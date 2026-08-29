import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { ARTIFACT_CONFIG } from '../../../apollo-evals.config.js';
import { SeededRandom } from '../../../src/core/random.js';
import type { ScenarioContext, ScenarioLifecycle } from '../../../src/core/types.js';
import { check, arrangeBaseState, referenceAgent, verdict, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & { public: ScenarioBaseState['public'] & { mavenRepo: string; apolloJavaVersion: string }; initialValue: string; newValue: string };
async function verifyProgram(context: ScenarioContext<State>, publish: () => Promise<void>): Promise<{ compileOk: boolean; ready?: unknown; change?: unknown; exitCode: number | null; stderr: string }> {
  const runner = context.javaRunner;
  if (!runner) throw new Error('Java scenario requires the isolated Docker Java runner');
  const compile = await runner.run('mvn', ['-o', '-q', 'compile', 'dependency:build-classpath', '-Dmdep.outputFile=target/classpath.txt'], { timeoutMs: 120_000 });
  if (compile.exitCode !== 0) return { compileOk: false, exitCode: compile.exitCode, stderr: compile.stderr };
  const cp = (await readFile(path.join(context.workspace, 'target', 'classpath.txt'), 'utf8')).trim();
  const state = context.state;
  const child = runner.spawn('java', ['-cp', `/workspace/target/classes:${cp}`, 'scenario.ChangeListenerApp', state.public.targetApp, 'application', state.public.key]);
  let ready: unknown; let change: unknown; let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
  const lines = readline.createInterface({ input: child.stdout });
  const readyPromise = new Promise<void>((resolve) => lines.on('line', (line) => { try { const value = JSON.parse(line) as { event?: string }; if (value.event === 'ready' && ready === undefined) { ready = value; resolve(); } else if (value.event === 'change') change = value; } catch { /* ignore library logging */ } }));
  const readyTimer = new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('ready timeout')), 30_000));
  try { await Promise.race([readyPromise, readyTimer]); await publish(); } catch (error) { child.kill('SIGTERM'); return { compileOk: true, ready, change, exitCode: null, stderr: `${stderr}\n${String(error)}` }; }
  const exitCode = await new Promise<number | null>((resolve) => { const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(null); }, 45_000); child.once('close', (code) => { clearTimeout(timer); resolve(code); }); });
  lines.close();
  return { compileOk: true, ready, change, exitCode, stderr };
}
const lifecycle: ScenarioLifecycle<State> = {
  async arrange(context) {
    const base = await arrangeBaseState(context, 'java-listener');
    const random = new SeededRandom(context.identity.seed);
    const initialValue = random.token('initial', 10); const newValue = random.token('updated', 10);
    await context.session.control.putItem(base.public.targetApp, 'application', base.public.key, initialValue);
    await context.session.control.release(base.public.targetApp, 'application', 'listener-initial');
    return { ...base, public: { ...base.public, mavenRepo: '/m2', apolloJavaVersion: ARTIFACT_CONFIG.apolloJava.version }, initialValue, newValue };
  },
  async judge(context) {
    const pom = await readFile(path.join(context.workspace, 'pom.xml'), 'utf8');
    const source = await readFile(path.join(context.workspace, 'src/main/java/scenario/ChangeListenerApp.java'), 'utf8');
    const verified = source.includes('UnsupportedOperationException("TODO")')
      ? { compileOk: false, exitCode: null, stderr: 'starter is still TODO' }
      : await verifyProgram(context, async () => { await context.session.control.putItem(context.state.public.targetApp, 'application', context.state.public.key, context.state.newValue); await context.session.control.release(context.state.public.targetApp, 'application', 'hidden-listener-update'); });
    const ready = verified.ready as Record<string, unknown> | undefined; const change = verified.change as Record<string, unknown> | undefined;
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('locked apollo-client dependency', 'interaction', pom.includes('<artifactId>apollo-client</artifactId>') && pom.includes(`<version>${context.state.public.apolloJavaVersion}</version>`)),
      check('uses Apollo change listener API', 'interaction', /addChangeListener\s*\(/.test(source) && !/(HttpClient|HttpURLConnection|java\.net\.http)/.test(source)),
      check('program compiles offline', 'outcome', verified.compileOk, verified.stderr.slice(-500)),
      check('ready exposes initial value', 'outcome', ready?.event === 'ready' && ready.value === context.state.initialValue, JSON.stringify(ready)),
      check('listener reports exact change', 'outcome', change?.event === 'change' && change.key === context.state.public.key && change.oldValue === context.state.initialValue && change.newValue === context.state.newValue && change.changeType === 'MODIFIED', JSON.stringify(change)),
      check('program exits normally', 'outcome', verified.exitCode === 0, String(verified.exitCode)),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async reference(context) {
    const source = `package scenario;\nimport com.ctrip.framework.apollo.Config;\nimport com.ctrip.framework.apollo.ConfigChangeListener;\nimport com.ctrip.framework.apollo.ConfigService;\nimport com.ctrip.framework.apollo.model.ConfigChange;\nimport java.util.concurrent.CountDownLatch;\nimport java.util.concurrent.TimeUnit;\npublic final class ChangeListenerApp {\n public static void main(String[] a) throws Exception {\n  Config c=ConfigService.getConfig(a[0],a[1]); String initial=c.getProperty(a[2],""); CountDownLatch done=new CountDownLatch(1);\n  ConfigChangeListener listener=e->{if(e.isChanged(a[2])){ConfigChange x=e.getChange(a[2]); System.out.printf("{\\\"event\\\":\\\"change\\\",\\\"key\\\":\\\"%s\\\",\\\"oldValue\\\":\\\"%s\\\",\\\"newValue\\\":\\\"%s\\\",\\\"changeType\\\":\\\"%s\\\"}%n",a[2],x.getOldValue(),x.getNewValue(),x.getChangeType());System.out.flush();done.countDown();}};\n  c.addChangeListener(listener); System.out.printf("{\\\"event\\\":\\\"ready\\\",\\\"value\\\":\\\"%s\\\"}%n",initial); System.out.flush(); if(!done.await(60,TimeUnit.SECONDS)) System.exit(2);\n }\n}\n`;
    await writeFile(path.join(context.workspace, 'src/main/java/scenario/ChangeListenerApp.java'), source);
    return referenceAgent(['mvn -o compile', 'java scenario.ChangeListenerApp']);
  },
};
export default lifecycle;
