import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ARTIFACT_CONFIG } from '../../../apollo-evals.config.js';
import { SeededRandom } from '../../../src/core/random.js';
import type { ScenarioContext, ScenarioLifecycle } from '../../../src/core/types.js';
import { check, oracleAgentResult, setupBaseState, verdict, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & {
  public: ScenarioBaseState['public'] & {
    preferredCluster: string;
    missingCluster: string;
    mavenRepo: string;
    apolloJavaVersion: string;
  };
  expected: { preferredValue: string; defaultValue: string };
};

type JavaResult = { compileOk: boolean; preferredStdout: string; missingStdout: string; stderr: string };

function parseJsonLine(stdout: string): unknown {
  const line = stdout.split(/\r?\n/).find((value) => value.trim().startsWith('{'));
  try { return line ? JSON.parse(line) : undefined; } catch { return undefined; }
}

async function runJava(context: ScenarioContext<State>): Promise<JavaResult> {
  const runner = context.javaRunner;
  if (!runner) throw new Error('Java scenario requires the isolated Docker Java runner');
  const compiled = await runner.run('mvn', ['-o', '-q', 'compile', 'dependency:build-classpath', '-Dmdep.outputFile=target/classpath.txt'], { timeoutMs: 120_000 });
  if (compiled.exitCode !== 0) return { compileOk: false, preferredStdout: '', missingStdout: '', stderr: `${compiled.stdout}\n${compiled.stderr}` };
  const classpath = (await readFile(path.join(context.workspace, 'target', 'classpath.txt'), 'utf8')).trim();
  const common = ['-cp', `/workspace/target/classes:${classpath}`, 'scenario.ClusterPrecedence', context.state.public.targetApp, 'application', context.state.public.key];
  const preferred = await runner.run('java', [...common, context.state.public.preferredCluster], { timeoutMs: 45_000 });
  const missing = await runner.run('java', [...common, context.state.public.missingCluster], { timeoutMs: 45_000 });
  return {
    compileOk: true,
    preferredStdout: preferred.stdout,
    missingStdout: missing.stdout,
    stderr: [preferred.stderr, missing.stderr].filter(Boolean).join('\n'),
  };
}

const lifecycle: ScenarioLifecycle<State> = {
  async setup(context) {
    const base = await setupBaseState(context, 'java-cluster');
    const random = new SeededRandom(context.identity.seed);
    const preferredCluster = random.token('canary', 8).toLowerCase();
    const missingCluster = random.token('missing', 8).toLowerCase();
    const expected = {
      preferredValue: random.token('cluster-value', 12),
      defaultValue: random.token('default-value', 12),
    };
    await context.session.control.putItem(base.public.targetApp, 'application', base.public.key, expected.defaultValue);
    await context.session.control.release(base.public.targetApp, 'application', 'default-cluster-baseline');
    await context.session.control.createCluster(base.public.targetApp, preferredCluster);
    await context.session.control.createNamespaceInCluster(base.public.targetApp, preferredCluster, 'application');
    await context.session.control.putItemInCluster(base.public.targetApp, preferredCluster, 'application', base.public.key, expected.preferredValue);
    await context.session.control.releaseInCluster(base.public.targetApp, preferredCluster, 'application', 'preferred-cluster-value');
    return {
      ...base,
      public: {
        ...base.public,
        preferredCluster,
        missingCluster,
        mavenRepo: '/m2',
        apolloJavaVersion: ARTIFACT_CONFIG.apolloJava.version,
      },
      expected,
    };
  },
  async verify(context) {
    const pom = await readFile(path.join(context.workspace, 'pom.xml'), 'utf8');
    const source = await readFile(path.join(context.workspace, 'src/main/java/scenario/ClusterPrecedence.java'), 'utf8');
    const result = await runJava(context);
    const preferred = parseJsonLine(result.preferredStdout);
    const missing = parseJsonLine(result.missingStdout);
    const expectedPreferred = { cluster: context.state.public.preferredCluster, value: context.state.expected.preferredValue };
    const expectedMissing = { cluster: context.state.public.missingCluster, value: context.state.expected.defaultValue };
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('locked apollo-client dependency', 'interaction', pom.includes('<artifactId>apollo-client</artifactId>') && pom.includes(`<version>${context.state.public.apolloJavaVersion}</version>`)),
      check('uses cluster-aware Apollo Java Client read', 'interaction', /ConfigService\s*\.\s*getConfig\s*\(/.test(source) && source.includes('apollo.cluster') && !/(HttpClient|HttpURLConnection|java\.net\.http)/.test(source)),
      check('program compiles offline', 'outcome', result.compileOk, result.stderr.slice(-500)),
      check('preferred cluster overrides default', 'outcome', JSON.stringify(preferred) === JSON.stringify(expectedPreferred), result.preferredStdout.trim()),
      check('missing cluster falls back to default', 'outcome', JSON.stringify(missing) === JSON.stringify(expectedMissing), result.missingStdout.trim()),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async runOracle(context) {
    const source = `package scenario;\nimport com.ctrip.framework.apollo.Config;\nimport com.ctrip.framework.apollo.ConfigService;\npublic final class ClusterPrecedence {\n  private ClusterPrecedence() {}\n  public static void main(String[] args) {\n    System.setProperty("apollo.cluster", args[3]);\n    Config config = ConfigService.getConfig(args[0], args[1]);\n    String value = config.getProperty(args[2], "");\n    System.out.printf("{\\\"cluster\\\":\\\"%s\\\",\\\"value\\\":\\\"%s\\\"}%n", args[3], value);\n  }\n}\n`;
    await writeFile(path.join(context.workspace, 'src/main/java/scenario/ClusterPrecedence.java'), source);
    return oracleAgentResult(['mvn -o compile', 'java scenario.ClusterPrecedence <preferred>', 'java scenario.ClusterPrecedence <missing>']);
  },
};

export default lifecycle;
