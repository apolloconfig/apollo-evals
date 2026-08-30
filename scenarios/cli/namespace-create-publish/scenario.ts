import { PROJECT_ROOT } from '../../../apollo-evals.config.js';
import { loadLock } from '../../../src/core/fs.js';
import { SeededRandom } from '../../../src/core/random.js';
import { runProcess } from '../../../src/core/process.js';
import type { ScenarioLifecycle } from '../../../src/core/types.js';
import { check, commandIncludes, setupBaseState, oracleAgentResult, verdict, usedRawHttp, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & { public: ScenarioBaseState['public'] & { portalUrl: string; namespaceName: string; value: string; type: number; releaseTitle: string } };

const lifecycle: ScenarioLifecycle<State> = {
  async setup(context) {
    const base = await setupBaseState(context, 'cli-namespace');
    const random = new SeededRandom(context.identity.seed);
    const value = JSON.stringify({ enabled: true, percentage: random.int(10, 90), label: random.token('variant', 8) });
    return {
      ...base,
      public: {
        ...base.public,
        portalUrl: context.session.agentPortalUrl,
        namespaceName: random.token('feature', 8).toLowerCase(),
        value,
        type: 3,
        releaseTitle: random.token('namespace-release', 8),
      },
    };
  },
  async verify(context) {
    const appNamespaces = await context.session.control.appNamespaces(context.state.public.targetApp);
    const meta = appNamespaces.find((entry) => entry.name === context.state.public.namespaceName);
    const items = await context.session.control.items(context.state.public.targetApp, context.state.public.namespaceName);
    const item = items.find((entry) => entry.key === context.state.public.key);
    const release = await context.session.control.latestRelease(context.state.public.targetApp, context.state.public.namespaceName);
    const config = await context.session.control.config(context.state.public.targetApp, context.state.public.namespaceName);
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('private properties AppNamespace metadata', 'outcome', String(meta?.format).toLowerCase() === 'properties' && meta?.isPublic === false, JSON.stringify(meta)),
      check('namespace item value and type', 'outcome', item?.value === context.state.public.value && item.type === context.state.public.type, JSON.stringify(item)),
      check('active release contains value', 'outcome', (release?.configurations as Record<string, string> | undefined)?.[context.state.public.key] === context.state.public.value),
      check('Config Service exposes value', 'outcome', config[context.state.public.key] === context.state.public.value),
      check('used namespace create, config set, and release create', 'interaction', commandIncludes(context.agent, /apollo[\s\S]*namespace\s+create/, /apollo[\s\S]*config\s+set/, /apollo[\s\S]*release\s+create/) && !usedRawHttp(context.agent.commands)),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async runOracle(context) {
    const lock = await loadLock(PROJECT_ROOT);
    const common = ['--server', context.session.agentPortalUrl, '--output', 'json', '--yes'];
    const env = { ...process.env, APOLLO_TOKEN: context.state.token };
    const namespaceArgs = [...common, 'namespace', 'create', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', context.state.public.namespaceName];
    const setArgs = [...common, 'config', 'set', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', '--namespace', context.state.public.namespaceName, context.state.public.key, context.state.public.value, '--type', String(context.state.public.type)];
    const releaseArgs = [...common, 'release', 'create', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', '--namespace', context.state.public.namespaceName, '--title', context.state.public.releaseTitle];
    for (const args of [namespaceArgs, setArgs, releaseArgs]) {
      const result = await runProcess(lock.artifacts.apolloCli.path, args, { env });
      if (result.exitCode !== 0) throw new Error(result.stderr);
    }
    return oracleAgentResult([
      `${lock.artifacts.apolloCli.path} ${namespaceArgs.join(' ')}`,
      `${lock.artifacts.apolloCli.path} ${setArgs.join(' ')}`,
      `${lock.artifacts.apolloCli.path} ${releaseArgs.join(' ')}`,
    ]);
  },
};

export default lifecycle;
