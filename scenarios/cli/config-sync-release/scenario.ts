import { PROJECT_ROOT } from '../../../apollo-evals.config.js';
import { loadLock } from '../../../src/core/fs.js';
import { SeededRandom } from '../../../src/core/random.js';
import { runProcess } from '../../../src/core/process.js';
import type { ScenarioLifecycle } from '../../../src/core/types.js';
import { check, commandIncludes, arrangeBaseState, referenceAgent, verdict, usedRawHttp, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & { public: ScenarioBaseState['public'] & { portalUrl: string; targetCluster: string; releaseTitle: string }; expected: Record<string, string> };

function canonical(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

const lifecycle: ScenarioLifecycle<State> = {
  async arrange(context) {
    const base = await arrangeBaseState(context, 'cli-sync');
    const random = new SeededRandom(context.identity.seed);
    const targetCluster = random.token('canary', 6).toLowerCase();
    const expected = {
      [base.public.key]: random.token('updated', 8),
      [random.token('created-key', 6)]: random.token('created-value', 8),
      [random.token('kept-key', 6)]: random.token('kept-value', 8),
    };
    for (const [key, value] of Object.entries(expected)) await context.session.control.putItem(base.public.targetApp, 'application', key, value);
    await context.session.control.release(base.public.targetApp, 'application', 'source-current');
    await context.session.control.createCluster(base.public.targetApp, targetCluster);
    await context.session.control.createNamespaceInCluster(base.public.targetApp, targetCluster, 'application');
    await context.session.control.putItemInCluster(base.public.targetApp, targetCluster, 'application', base.public.key, 'stale-value');
    await context.session.control.putItemInCluster(base.public.targetApp, targetCluster, 'application', 'obsolete.key', 'delete-me');
    await context.session.control.releaseInCluster(base.public.targetApp, targetCluster, 'application', 'target-stale');
    return { ...base, public: { ...base.public, portalUrl: context.session.agentPortalUrl, targetCluster, releaseTitle: random.token('sync-release', 8) }, expected };
  },
  async judge(context) {
    const targetItems = await context.session.control.itemsInCluster(context.state.public.targetApp, context.state.public.targetCluster);
    const actual = Object.fromEntries(targetItems.filter((item) => item.key).map((item) => [item.key, item.value]));
    const release = await context.session.control.latestReleaseInCluster(context.state.public.targetApp, context.state.public.targetCluster);
    const source = Object.fromEntries((await context.session.control.items(context.state.public.targetApp)).filter((item) => item.key).map((item) => [item.key, item.value]));
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('target added updated and deleted exactly', 'outcome', canonical(actual) === canonical(context.state.expected), JSON.stringify(actual)),
      check('target active release equals source', 'outcome', canonical((release?.configurations as Record<string, string> | undefined) ?? {}) === canonical(context.state.expected)),
      check('source remained unchanged', 'boundary', canonical(source) === canonical(context.state.expected)),
      check('used config diff, apply, delete, and target release create', 'interaction', commandIncludes(context.agent, /apollo[\s\S]*config\s+diff/, /apollo[\s\S]*config\s+apply/, /apollo[\s\S]*config\s+delete/, /apollo[\s\S]*release\s+create/) && !usedRawHttp(context.agent.commands)),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async reference(context) {
    const lock = await loadLock(PROJECT_ROOT);
    const common = ['--server', context.session.agentPortalUrl, '--output', 'json', '--yes'];
    const env = { ...process.env, APOLLO_TOKEN: context.state.token };
    const source = ['--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', '--namespace', 'application'];
    const target = ['--target-env', 'LOCAL', '--target-cluster', context.state.public.targetCluster];
    const diffArgs = [...common, 'config', 'diff', ...source, ...target];
    const applyArgs = [...common, 'config', 'apply', ...source, ...target];
    const deleteArgs = [...common, 'config', 'delete', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', context.state.public.targetCluster, '--namespace', 'application', 'obsolete.key'];
    const releaseArgs = [...common, 'release', 'create', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', context.state.public.targetCluster, '--namespace', 'application', '--title', context.state.public.releaseTitle];
    for (const args of [diffArgs, applyArgs, deleteArgs, releaseArgs]) {
      const result = await runProcess(lock.artifacts.apolloCli.path, args, { env });
      if (result.exitCode !== 0) throw new Error(result.stderr);
    }
    return referenceAgent([
      `${lock.artifacts.apolloCli.path} ${diffArgs.join(' ')}`,
      `${lock.artifacts.apolloCli.path} ${applyArgs.join(' ')}`,
      `${lock.artifacts.apolloCli.path} ${deleteArgs.join(' ')}`,
      `${lock.artifacts.apolloCli.path} ${releaseArgs.join(' ')}`,
    ]);
  },
};

export default lifecycle;
