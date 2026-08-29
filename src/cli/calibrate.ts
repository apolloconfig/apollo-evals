import { rm } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT, WORKSPACE_ROOT } from '../../apollo-evals.config.js';
import { parseArgs } from '../core/args.js';
import { discoverScenarios } from '../core/discovery.js';
import { deriveSeed } from '../core/random.js';
import { prepareAttemptWorkspace } from '../core/runner.js';
import { DockerApolloRuntime } from '../runtime/docker-apollo.js';
import { DockerJavaRunner } from '../runtime/java-runner.js';
import { referenceAgent } from '../testing/scenario-helpers.js';
import { verifyPrepared } from '../core/verify.js';

await verifyPrepared();
const args = parseArgs();
const discovered = await discoverScenarios(PROJECT_ROOT);
const scenarios = typeof args.scenario === 'string'
  ? discovered.filter((entry) => entry.id === args.scenario)
  : discovered;
if (!scenarios.length) throw new Error('No scenarios selected');

for (const [index, scenario] of scenarios.entries()) {
  if (!scenario.lifecycle.reference) {
    throw new Error(`${scenario.id} has no deterministic reference`);
  }
  const identity = {
    runId: 'calibration',
    profileId: 'reference',
    scenarioId: scenario.id,
    attempt: 1,
    seed: deriveSeed(0x41504f4c, scenario.id, index),
  };
  const workspace = path.join(WORKSPACE_ROOT, 'calibration', scenario.id);
  const artifactsDir = path.join(PROJECT_ROOT, '.runtime', 'calibration-artifacts', scenario.id);
  const runtime = new DockerApolloRuntime();
  let javaRunner: DockerJavaRunner | undefined;
  process.stdout.write(`[calibrate] ${scenario.id}\n`);
  try {
    await prepareAttemptWorkspace(scenario, workspace);
    const session = await runtime.start(identity);
    if (scenario.metadata.track === 'apollo-java-client') {
      javaRunner = await DockerJavaRunner.start(session, workspace, identity);
    }
    const base = { identity, session, workspace, artifactsDir, javaRunner };
    const state = await scenario.lifecycle.arrange(base);
    const baseline = await scenario.lifecycle.judge({ ...base, state, agent: referenceAgent() });
    if (baseline.passed) {
      throw new Error(`${scenario.id}: judge passed immediately after arrange`);
    }
    const reference = await scenario.lifecycle.reference({ ...base, state });
    if (javaRunner) {
      await javaRunner.restart();
      await rm(path.join(workspace, '.apollo-cache'), { recursive: true, force: true });
    }
    const verified = await scenario.lifecycle.judge({ ...base, state, agent: reference });
    if (!verified.passed) {
      throw new Error(
        `${scenario.id}: reference did not pass\n${JSON.stringify(verified.checks, null, 2)}`,
      );
    }
    const boundaryChecks = verified.checks.filter((entry) => entry.category === 'boundary');
    if (!boundaryChecks.length || !boundaryChecks.every((entry) => entry.passed)) {
      throw new Error(`${scenario.id}: boundary gate failed`);
    }
    session.control.clearSession();
    process.stdout.write('  baseline=failed reference=passed boundary=passed\n');
  } finally {
    await javaRunner?.stop();
    await runtime.stop();
    await rm(workspace, { recursive: true, force: true });
  }
}
process.stdout.write(`Calibrated ${scenarios.length} scenarios.\n`);
