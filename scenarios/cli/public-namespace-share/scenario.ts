import { PROJECT_ROOT } from '../../../apollo-evals.config.js';
import { loadLock } from '../../../src/core/fs.js';
import { SeededRandom } from '../../../src/core/random.js';
import { runProcess } from '../../../src/core/process.js';
import type { ScenarioLifecycle } from '../../../src/core/types.js';
import { check, commandIncludes, oracleAgentResult, setupBaseState, usedRawHttp, verdict, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & {
  public: ScenarioBaseState['public'] & {
    portalUrl: string;
    consumerApp: string;
    namespaceName: string;
    value: string;
    releaseTitle: string;
  };
  consumerBaseline: { key: string; value: string };
};

async function waitForSharedValue(context: Parameters<NonNullable<ScenarioLifecycle<State>['verify']>>[0]): Promise<string | undefined> {
  const deadline = Date.now() + 8_000;
  do {
    const config = await context.session.control.config(context.state.public.consumerApp, context.state.public.namespaceName);
    const value = config[context.state.public.key];
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  return undefined;
}

const lifecycle: ScenarioLifecycle<State> = {
  async setup(context) {
    const base = await setupBaseState(context, 'cli-public');
    const random = new SeededRandom(context.identity.seed);
    const consumerApp = random.token('consumer', 10).toLowerCase();
    const consumerBaseline = {
      key: random.token('consumer-baseline', 8).replace('-', '.'),
      value: random.token('consumer-value', 12),
    };
    await context.session.control.createApp(consumerApp);
    await context.session.control.putItem(consumerApp, 'application', consumerBaseline.key, consumerBaseline.value);
    await context.session.control.release(consumerApp, 'application', 'consumer-baseline');
    return {
      ...base,
      public: {
        ...base.public,
        portalUrl: context.session.agentPortalUrl,
        consumerApp,
        namespaceName: random.token('shared', 10).toLowerCase(),
        value: random.token('shared-value', 12),
        releaseTitle: random.token('shared-release', 8),
      },
      consumerBaseline,
    };
  },
  async verify(context) {
    const appNamespaces = await context.session.control.appNamespaces(context.state.public.targetApp);
    const meta = appNamespaces.find((entry) => entry.name === context.state.public.namespaceName);
    const items = await context.session.control.items(context.state.public.targetApp, context.state.public.namespaceName);
    const item = items.find((entry) => entry.key === context.state.public.key);
    const release = await context.session.control.latestRelease(context.state.public.targetApp, context.state.public.namespaceName);
    const provider = await context.session.control.config(context.state.public.targetApp, context.state.public.namespaceName);
    const consumerValue = await waitForSharedValue(context);
    const consumerBaseline = await context.session.control.config(context.state.public.consumerApp);
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    return verdict([
      check('public properties AppNamespace has exact name', 'outcome', String(meta?.format).toLowerCase() === 'properties' && meta?.isPublic === true, JSON.stringify(meta)),
      check('shared item value and string type', 'outcome', item?.value === context.state.public.value && item.type === 0, JSON.stringify(item)),
      check('shared release contains value', 'outcome', (release?.configurations as Record<string, string> | undefined)?.[context.state.public.key] === context.state.public.value),
      check('provider Config Service exposes value', 'outcome', provider[context.state.public.key] === context.state.public.value),
      check('consumer reads public Namespace value', 'outcome', consumerValue === context.state.public.value, consumerValue),
      check('used namespace, config, and release resource commands', 'interaction', commandIncludes(context.agent, /apollo[\s\S]*namespace\s+create/, /apollo[\s\S]*config\s+set/, /apollo[\s\S]*release\s+create/) && !usedRawHttp(context.agent.commands)),
      check('consumer application baseline unchanged', 'boundary', consumerBaseline[context.state.consumerBaseline.key] === context.state.consumerBaseline.value),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async runOracle(context) {
    const lock = await loadLock(PROJECT_ROOT);
    const common = ['--server', context.session.agentPortalUrl, '--output', 'json', '--yes'];
    const env = { ...process.env, APOLLO_TOKEN: context.state.token };
    const namespaceArgs = [...common, 'namespace', 'create', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', '--public', '--no-append-namespace-prefix', context.state.public.namespaceName];
    const setArgs = [...common, 'config', 'set', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', '--namespace', context.state.public.namespaceName, context.state.public.key, context.state.public.value, '--type', '0'];
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
