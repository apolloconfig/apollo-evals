import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ARTIFACT_CONFIG } from '../../../apollo-evals.config.js';
import { SeededRandom } from '../../../src/core/random.js';
import type { ScenarioContext, ScenarioLifecycle } from '../../../src/core/types.js';
import { check, setupBaseState, oracleAgentResult, verdict, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & { public: ScenarioBaseState['public'] & { stringKey: string; intKey: string; booleanKey: string; missingKey: string; mavenRepo: string; apolloJavaVersion: string }; expected: { string: string; int: number; boolean: boolean; missing: string } };
async function runJava(context: ScenarioContext<State>): Promise<{ compileOk: boolean; stdout: string; stderr: string }> {
  const runner = context.javaRunner;
  if (!runner) throw new Error('Java scenario requires the isolated Docker Java runner');
  const mvnArgs = ['-o', '-q', 'compile', 'dependency:build-classpath', '-Dmdep.outputFile=target/classpath.txt'];
  const compiled = await runner.run('mvn', mvnArgs, { timeoutMs: 120_000 });
  if (compiled.exitCode !== 0) return { compileOk: false, stdout: compiled.stdout, stderr: compiled.stderr };
  const classpath = (await readFile(path.join(context.workspace, 'target', 'classpath.txt'), 'utf8')).trim();
  const state = context.state;
  const args = [state.public.targetApp, 'application', state.public.stringKey, state.public.intKey, state.public.booleanKey, state.public.missingKey];
  const ran = await runner.run('java', ['-cp', `/workspace/target/classes:${classpath}`, 'scenario.TypedRead', ...args], { timeoutMs: 45_000 });
  return { compileOk: true, stdout: ran.stdout, stderr: ran.stderr };
}
const lifecycle: ScenarioLifecycle<State> = {
  async setup(context) {
    const base = await setupBaseState(context, 'java-typed');
    const random = new SeededRandom(context.identity.seed);
    const publicValues = { stringKey: random.token('str-key', 6), intKey: random.token('int-key', 6), booleanKey: random.token('bool-key', 6), missingKey: random.token('missing-key', 6) };
    const expected = { string: random.token('string-value', 10), int: random.int(100, 999), boolean: random.int(0, 1) === 1, missing: 'fallback-value' };
    await context.session.control.putItem(base.public.targetApp, 'application', publicValues.stringKey, expected.string);
    await context.session.control.putItem(base.public.targetApp, 'application', publicValues.intKey, String(expected.int));
    await context.session.control.putItem(base.public.targetApp, 'application', publicValues.booleanKey, String(expected.boolean));
    await context.session.control.release(base.public.targetApp, 'application', 'java-typed-values');
    return { ...base, public: { ...base.public, ...publicValues, mavenRepo: '/m2', apolloJavaVersion: ARTIFACT_CONFIG.apolloJava.version }, expected };
  },
  async verify(context) {
    const pom = await readFile(path.join(context.workspace, 'pom.xml'), 'utf8');
    const source = await readFile(path.join(context.workspace, 'src/main/java/scenario/TypedRead.java'), 'utf8');
    const result = await runJava(context);
    const line = result.stdout.split(/\r?\n/).find((value) => value.trim().startsWith('{'));
    let actual: unknown; try { actual = line ? JSON.parse(line) : undefined; } catch { actual = undefined; }
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('locked apollo-client dependency', 'interaction', pom.includes('<artifactId>apollo-client</artifactId>') && pom.includes(`<version>${context.state.public.apolloJavaVersion}</version>`)),
      check('explicit app and namespace ConfigService call', 'interaction', /ConfigService\s*\.\s*getConfig\s*\(/.test(source) && !/(HttpClient|HttpURLConnection|java\.net\.http)/.test(source)),
      check('uses typed getters', 'interaction', /getIntProperty\s*\(/.test(source) && /getBooleanProperty\s*\(/.test(source) && /getProperty\s*\(/.test(source)),
      check('program compiles offline', 'outcome', result.compileOk, result.stderr.slice(-500)),
      check('program reads correct typed values', 'outcome', JSON.stringify(actual) === JSON.stringify(context.state.expected), line),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async runOracle(context) {
    const source = `package scenario;\nimport com.ctrip.framework.apollo.Config;\nimport com.ctrip.framework.apollo.ConfigService;\npublic final class TypedRead {\n  public static void main(String[] args) {\n    Config c = ConfigService.getConfig(args[0], args[1]);\n    String s = c.getProperty(args[2], "");\n    int i = c.getIntProperty(args[3], -1);\n    boolean b = c.getBooleanProperty(args[4], false);\n    String m = c.getProperty(args[5], "fallback-value");\n    System.out.printf("{\\\"string\\\":\\\"%s\\\",\\\"int\\\":%d,\\\"boolean\\\":%s,\\\"missing\\\":\\\"%s\\\"}%n", s, i, b, m);\n  }\n}\n`;
    await writeFile(path.join(context.workspace, 'src/main/java/scenario/TypedRead.java'), source);
    return oracleAgentResult(['mvn -o compile', 'java scenario.TypedRead']);
  },
};
export default lifecycle;
