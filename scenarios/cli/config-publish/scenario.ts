import { PROJECT_ROOT } from '../../../apollo-evals.config.js';
import { loadLock } from '../../../src/core/fs.js';
import { SeededRandom } from '../../../src/core/random.js';
import { runProcess } from '../../../src/core/process.js';
import type { ScenarioLifecycle } from '../../../src/core/types.js';
import { check, commandIncludes, setupBaseState, oracleAgentResult, verdict, usedRawHttp, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & { public: ScenarioBaseState['public'] & { value: string; type: number; releaseTitle: string; portalUrl: string } };
const lifecycle: ScenarioLifecycle<State> = {
  async setup(context) {
    const base = await setupBaseState(context, 'cli-set');
    const random = new SeededRandom(context.identity.seed);
    return { ...base, public: { ...base.public, value: String(random.int(10_000, 99_999)), type: 1, releaseTitle: random.token('release', 8), portalUrl: context.session.agentPortalUrl } };
  },
  async verify(context) {
    const items = await context.session.control.items(context.state.public.targetApp);
    const item = items.find((entry) => entry.key === context.state.public.key);
    const release = await context.session.control.latestRelease(context.state.public.targetApp);
    const config = await context.session.control.config(context.state.public.targetApp);
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('item value and type', 'outcome', item?.value === context.state.public.value && item.type === context.state.public.type, JSON.stringify(item)),
      check('active release contains value', 'outcome', (release?.configurations as Record<string, string> | undefined)?.[context.state.public.key] === context.state.public.value),
      check('Config Service exposes value', 'outcome', config[context.state.public.key] === context.state.public.value),
      check('used apollo config set and release create', 'interaction', commandIncludes(context.agent, /apollo[\s\S]*config\s+set/, /apollo[\s\S]*release\s+create/) && !usedRawHttp(context.agent.commands)),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async runOracle(context) {
    const lock = await loadLock(PROJECT_ROOT);
    const common = ['--server', context.session.agentPortalUrl, '--output', 'json', '--yes'];
    const env = { ...process.env, APOLLO_TOKEN: context.state.token };
    const setArgs = [...common, 'config', 'set', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--namespace', 'application', context.state.public.key, context.state.public.value, '--type', String(context.state.public.type)];
    const releaseArgs = [...common, 'release', 'create', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--namespace', 'application', '--title', context.state.public.releaseTitle];
    for (const args of [setArgs, releaseArgs]) { const result = await runProcess(lock.artifacts.apolloCli.path, args, { env }); if (result.exitCode !== 0) throw new Error(result.stderr); }
    return oracleAgentResult([`${lock.artifacts.apolloCli.path} ${setArgs.join(' ')}`, `${lock.artifacts.apolloCli.path} ${releaseArgs.join(' ')}`]);
  },
};
export default lifecycle;
