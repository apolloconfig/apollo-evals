import { PROJECT_ROOT } from '../../../apollo-evals.config.js';
import { loadLock } from '../../../src/core/fs.js';
import { SeededRandom } from '../../../src/core/random.js';
import { runProcess } from '../../../src/core/process.js';
import type { ScenarioLifecycle } from '../../../src/core/types.js';
import { check, commandIncludes, arrangeBaseState, referenceAgent, observed, verdict, usedRawHttp, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & { public: ScenarioBaseState['public'] & { stableValue: string; badValue: string; portalUrl: string }; badReleaseId: number };
const lifecycle: ScenarioLifecycle<State> = {
  async arrange(context) {
    const base = await arrangeBaseState(context, 'cli-rollback');
    const random = new SeededRandom(context.identity.seed);
    const stableValue = random.token('stable', 10);
    const badValue = random.token('wrong', 10);
    await context.session.control.putItem(base.public.targetApp, 'application', base.public.key, stableValue);
    await context.session.control.release(base.public.targetApp, 'application', 'known-good');
    await context.session.control.putItem(base.public.targetApp, 'application', base.public.key, badValue);
    const bad = await context.session.control.release(base.public.targetApp, 'application', 'accidental-bad-release');
    return { ...base, public: { ...base.public, stableValue, badValue, portalUrl: context.session.agentPortalUrl }, badReleaseId: Number(bad.id) };
  },
  async judge(context) {
    const config = await context.session.control.config(context.state.public.targetApp);
    const release = await context.session.control.latestRelease(context.state.public.targetApp);
    const active = await context.session.control.activeReleases(context.state.public.targetApp);
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('Config Service restored stable value', 'outcome', config[context.state.public.key] === context.state.public.stableValue),
      check('active release restored stable value', 'outcome', (release?.configurations as Record<string, string> | undefined)?.[context.state.public.key] === context.state.public.stableValue),
      check('bad release is no longer active', 'outcome', !active.some((entry) => Number(entry.id) === context.state.badReleaseId)),
      check('used release list and rollback', 'interaction', commandIncludes(context.agent, /apollo[\s\S]*release\s+list/, /apollo[\s\S]*release\s+rollback/) && observed(context, 'PUT', /\/releases\/\d+\/rollback/) && !usedRawHttp(context.agent.commands)),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async reference(context) {
    const lock = await loadLock(PROJECT_ROOT);
    const common = ['--server', context.session.agentPortalUrl, '--output', 'json', '--yes'];
    const env = { ...process.env, APOLLO_TOKEN: context.state.token };
    const listArgs = [...common, 'release', 'list', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--namespace', 'application'];
    const rollbackArgs = [...common, 'release', 'rollback', '--env', 'LOCAL', String(context.state.badReleaseId)];
    for (const args of [listArgs, rollbackArgs]) { const result = await runProcess(lock.artifacts.apolloCli.path, args, { env }); if (result.exitCode !== 0) throw new Error(result.stderr); }
    return referenceAgent([`${lock.artifacts.apolloCli.path} ${listArgs.join(' ')}`, `${lock.artifacts.apolloCli.path} ${rollbackArgs.join(' ')}`]);
  },
};
export default lifecycle;
