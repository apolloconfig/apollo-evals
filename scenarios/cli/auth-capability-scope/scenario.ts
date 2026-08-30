import { PROJECT_ROOT } from '../../../apollo-evals.config.js';
import { loadLock } from '../../../src/core/fs.js';
import { SeededRandom } from '../../../src/core/random.js';
import { runProcess } from '../../../src/core/process.js';
import type { ScenarioLifecycle } from '../../../src/core/types.js';
import { check, commandIncludes, observed, oracleAgentResult, setupBaseState, usedRawHttp, verdict, type ScenarioBaseState } from '../../../src/testing/scenario-helpers.js';

type State = ScenarioBaseState & {
  public: ScenarioBaseState['public'] & { portalUrl: string; value: string; releaseTitle: string };
};

const lifecycle: ScenarioLifecycle<State> = {
  async setup(context) {
    const base = await setupBaseState(context, 'cli-capability');
    const random = new SeededRandom(context.identity.seed);
    const token = await context.session.control.createUserToken(
      `scenario-cli-capability-scoped-${context.identity.seed}`,
      [base.public.targetApp],
      {
        operations: ['config:read', 'config:modify', 'config:release'],
        namespaces: [{
          appId: base.public.targetApp,
          env: 'LOCAL',
          clusterName: 'default',
          namespaceName: 'application',
        }],
      },
    );
    return {
      ...base,
      token,
      secrets: [...(base.secrets ?? []), token],
      public: {
        ...base.public,
        portalUrl: context.session.agentPortalUrl,
        value: random.token('scoped-value', 12),
        releaseTitle: random.token('scoped-release', 8),
      },
    };
  },
  async verify(context) {
    const items = await context.session.control.items(context.state.public.targetApp);
    const item = items.find((entry) => entry.key === context.state.public.key);
    const release = await context.session.control.latestRelease(context.state.public.targetApp);
    const config = await context.session.control.config(context.state.public.targetApp);
    const distractor = await context.session.control.config(context.state.public.distractorApp);
    const usedCapabilities = commandIncludes(context.agent, /apollo[\s\S]*auth\s+capabilities/)
      && observed(context, 'GET', /\/openapi\/v1\/user-tokens\/(?:current\/)?capabilities(?:\?|$)/);
    return verdict([
      check('scoped item value and string type', 'outcome', item?.value === context.state.public.value && item.type === 0, JSON.stringify(item)),
      check('scoped release contains value', 'outcome', (release?.configurations as Record<string, string> | undefined)?.[context.state.public.key] === context.state.public.value),
      check('Config Service exposes scoped value', 'outcome', config[context.state.public.key] === context.state.public.value),
      check('queried token capabilities through Apollo CLI', 'interaction', usedCapabilities),
      check('used config and release resource commands', 'interaction', commandIncludes(context.agent, /apollo[\s\S]*config\s+set/, /apollo[\s\S]*release\s+create/) && !usedRawHttp(context.agent.commands)),
      check('distractor unchanged', 'boundary', distractor[context.state.public.key] === context.state.distractorValue),
    ]);
  },
  async runOracle(context) {
    const lock = await loadLock(PROJECT_ROOT);
    const common = ['--server', context.session.agentPortalUrl, '--output', 'json', '--yes'];
    const env = { ...process.env, APOLLO_TOKEN: context.state.token };
    const capabilityArgs = [...common, 'auth', 'capabilities'];
    const setArgs = [...common, 'config', 'set', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', '--namespace', 'application', context.state.public.key, context.state.public.value, '--type', '0'];
    const releaseArgs = [...common, 'release', 'create', '--env', 'LOCAL', '--app', context.state.public.targetApp, '--cluster', 'default', '--namespace', 'application', '--title', context.state.public.releaseTitle];
    for (const args of [capabilityArgs, setArgs, releaseArgs]) {
      const result = await runProcess(lock.artifacts.apolloCli.path, args, { env });
      if (result.exitCode !== 0) throw new Error(result.stderr);
    }
    return oracleAgentResult([
      `${lock.artifacts.apolloCli.path} ${capabilityArgs.join(' ')}`,
      `${lock.artifacts.apolloCli.path} ${setArgs.join(' ')}`,
      `${lock.artifacts.apolloCli.path} ${releaseArgs.join(' ')}`,
    ]);
  },
};

export default lifecycle;
