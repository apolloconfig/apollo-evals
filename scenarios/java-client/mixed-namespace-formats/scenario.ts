import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ARTIFACT_CONFIG } from '../../../apollo-evals.config.js';
import { SeededRandom } from '../../../src/core/random.js';
import type { ScenarioContext, ScenarioLifecycle } from '../../../src/core/types.js';
import { check, oracleAgentResult, setupBaseState, verdict, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & {
  public: ScenarioBaseState['public'] & {
    yamlNamespace: string;
    jsonNamespace: string;
    yamlBooleanKey: string;
    yamlIntKey: string;
    mavenRepo: string;
    apolloJavaVersion: string;
  };
  expected: { yamlEnabled: boolean; yamlLimit: number; jsonBase64: string };
};

type JavaResult = { compileOk: boolean; stdout: string; stderr: string };

async function runJava(context: ScenarioContext<State>): Promise<JavaResult> {
  const runner = context.javaRunner;
  if (!runner) throw new Error('Java scenario requires the isolated Docker Java runner');
  const compiled = await runner.run('mvn', ['-o', '-q', 'compile', 'dependency:build-classpath', '-Dmdep.outputFile=target/classpath.txt'], { timeoutMs: 120_000 });
  if (compiled.exitCode !== 0) return { compileOk: false, stdout: compiled.stdout, stderr: `${compiled.stdout}\n${compiled.stderr}` };
  const classpath = (await readFile(path.join(context.workspace, 'target', 'classpath.txt'), 'utf8')).trim();
  const state = context.state;
  const args = [state.public.targetApp, state.public.yamlNamespace, state.public.jsonNamespace, state.public.yamlBooleanKey, state.public.yamlIntKey];
  const ran = await runner.run('java', ['-cp', `/workspace/target/classes:${classpath}`, 'scenario.MixedNamespaceFormats', ...args], { timeoutMs: 45_000 });
  return { compileOk: true, stdout: ran.stdout, stderr: ran.stderr };
}

const lifecycle: ScenarioLifecycle<State> = {
  async setup(context) {
    const base = await setupBaseState(context, 'java-formats');
    const random = new SeededRandom(context.identity.seed);
    const yamlBase = random.token('yaml', 8).toLowerCase();
    const jsonBase = random.token('json', 8).toLowerCase();
    const yamlNamespace = `${yamlBase}.yml`;
    const jsonNamespace = `${jsonBase}.json`;
    const yamlBooleanKey = 'feature.enabled';
    const yamlIntKey = 'feature.limit';
    const yamlEnabled = random.int(0, 1) === 1;
    const yamlLimit = random.int(100, 999);
    const jsonText = JSON.stringify({ mode: random.token('mode', 8), retries: random.int(2, 9), enabled: random.int(0, 1) === 1 });
    await context.session.control.createAppNamespace(base.public.targetApp, yamlBase, 'yml');
    await context.session.control.createNamespace(base.public.targetApp, yamlNamespace);
    await context.session.control.putText(base.public.targetApp, yamlNamespace, `feature:\n  enabled: ${yamlEnabled}\n  limit: ${yamlLimit}\n`);
    await context.session.control.release(base.public.targetApp, yamlNamespace, 'yaml-format-baseline');
    await context.session.control.createAppNamespace(base.public.targetApp, jsonBase, 'json');
    await context.session.control.createNamespace(base.public.targetApp, jsonNamespace);
    await context.session.control.putText(base.public.targetApp, jsonNamespace, jsonText);
    await context.session.control.release(base.public.targetApp, jsonNamespace, 'json-format-baseline');
    return {
      ...base,
      public: {
        ...base.public,
        yamlNamespace,
        jsonNamespace,
        yamlBooleanKey,
        yamlIntKey,
        mavenRepo: '/m2',
        apolloJavaVersion: ARTIFACT_CONFIG.apolloJava.version,
      },
      expected: { yamlEnabled, yamlLimit, jsonBase64: Buffer.from(jsonText, 'utf8').toString('base64') },
    };
  },
  async verify(context) {
    const pom = await readFile(path.join(context.workspace, 'pom.xml'), 'utf8');
    const source = await readFile(path.join(context.workspace, 'src/main/java/scenario/MixedNamespaceFormats.java'), 'utf8');
    const result = await runJava(context);
    const line = result.stdout.split(/\r?\n/).find((value) => value.trim().startsWith('{'));
    let actual: unknown;
    try { actual = line ? JSON.parse(line) : undefined; } catch { actual = undefined; }
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('locked apollo-client dependency', 'interaction', pom.includes('<artifactId>apollo-client</artifactId>') && pom.includes(`<version>${context.state.public.apolloJavaVersion}</version>`)),
      check('uses normal and file Apollo Java Client reads', 'interaction', /ConfigService\s*\.\s*getConfig\s*\(/.test(source) && /getConfigFile\s*\(/.test(source) && /ConfigFileFormat\s*\.\s*JSON/.test(source) && !/(HttpClient|HttpURLConnection|java\.net\.http)/.test(source)),
      check('uses typed YAML getters', 'interaction', /getBooleanProperty\s*\(/.test(source) && /getIntProperty\s*\(/.test(source)),
      check('program compiles offline', 'outcome', result.compileOk, result.stderr.slice(-500)),
      check('program reads YAML types and exact JSON file', 'outcome', JSON.stringify(actual) === JSON.stringify(context.state.expected), line),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async runOracle(context) {
    const source = `package scenario;\nimport com.ctrip.framework.apollo.Config;\nimport com.ctrip.framework.apollo.ConfigFile;\nimport com.ctrip.framework.apollo.ConfigService;\nimport com.ctrip.framework.apollo.core.enums.ConfigFileFormat;\nimport java.nio.charset.StandardCharsets;\nimport java.util.Base64;\npublic final class MixedNamespaceFormats {\n  private MixedNamespaceFormats() {}\n  public static void main(String[] args) {\n    System.setProperty("app.id", args[0]);\n    Config yaml = ConfigService.getConfig(args[0], args[1]);\n    boolean enabled = yaml.getBooleanProperty(args[3], false);\n    int limit = yaml.getIntProperty(args[4], -1);\n    String jsonNamespace = args[2].endsWith(".json") ? args[2].substring(0, args[2].length() - 5) : args[2];\n    ConfigFile json = ConfigService.getConfigFile(jsonNamespace, ConfigFileFormat.JSON);\n    String encoded = Base64.getEncoder().encodeToString(json.getContent().getBytes(StandardCharsets.UTF_8));\n    System.out.printf("{\\\"yamlEnabled\\\":%s,\\\"yamlLimit\\\":%d,\\\"jsonBase64\\\":\\\"%s\\\"}%n", enabled, limit, encoded);\n  }\n}\n`;
    await writeFile(path.join(context.workspace, 'src/main/java/scenario/MixedNamespaceFormats.java'), source);
    return oracleAgentResult(['mvn -o compile', 'java scenario.MixedNamespaceFormats']);
  },
};

export default lifecycle;
