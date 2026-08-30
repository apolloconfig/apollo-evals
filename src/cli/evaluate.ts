import { randomInt } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT } from '../../apollo-evals.config.js';
import { aggregateRun, summaryMarkdown } from '../core/aggregate.js';
import { parseArgs } from '../core/args.js';
import { discoverScenarios } from '../core/discovery.js';
import { writeJson } from '../core/fs.js';
import { loadAgentProfile } from '../core/agent-profiles.js';
import { deriveSeed } from '../core/random.js';
import { runAttempt } from '../core/runner.js';
import type { EvaluationSuite } from '../core/types.js';
import { verifyAgentAdapter, verifyPrepared } from '../core/verify.js';

const args = parseArgs();
await verifyPrepared();

const profileId = typeof args.profile === 'string'
  ? args.profile
  : 'codex-gpt-5.6-sol-medium';
const profile = await loadAgentProfile(profileId);
const agentRuntime = await verifyAgentAdapter(profile);

const suite = typeof args.suite === 'string' ? args.suite as EvaluationSuite : undefined;
if (suite && !['smoke', 'benchmark'].includes(suite)) {
  throw new Error('--suite must be smoke or benchmark');
}
const scenarioId = typeof args.scenario === 'string' ? args.scenario : undefined;
if (!suite && !scenarioId) {
  throw new Error('Specify --scenario <id> or --suite smoke|benchmark');
}

const all = await discoverScenarios(PROJECT_ROOT);
const selected = scenarioId
  ? all.filter((scenario) => scenario.id === scenarioId)
  : all.filter((scenario) => scenario.metadata.suites.includes(suite!));
if (!selected.length) throw new Error('No scenarios selected');

const attempts = typeof args.attempts === 'string'
  ? Number(args.attempts)
  : suite === 'smoke'
    ? 1
    : 3;
if (!Number.isInteger(attempts) || attempts < 1) {
  throw new Error('--attempts must be a positive integer');
}
const rootSeed = typeof args.seed === 'string' ? Number(args.seed) : randomInt(1, 0x7fffffff);
if (!Number.isInteger(rootSeed)) throw new Error('--seed must be an integer');
const runId = typeof args['run-id'] === 'string'
  ? args['run-id']
  : `${new Date().toISOString().replace(/[:.]/g, '-')}-${rootSeed}`;

let exhaustedInfra = false;
for (const scenario of selected) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const seed = deriveSeed(rootSeed, profile.id, scenario.id, attempt);
    let completed = false;
    for (let infraRetry = 0; infraRetry <= 2 && !completed; infraRetry += 1) {
      const label = infraRetry === 0
        ? undefined
        : `attempt-${String(attempt).padStart(2, '0')}-infra-retry-${infraRetry}`;
      process.stdout.write(
        `[${scenario.id}] attempt ${attempt}/${attempts}${infraRetry ? ` infra retry ${infraRetry}/2` : ''}\n`,
      );
      const result = await runAttempt(
        { runId, profileId: profile.id, scenarioId: scenario.id, attempt, seed },
        scenario,
        profile,
        agentRuntime,
        label,
      );
      process.stdout.write(`  ${result.status}: ${result.stopReason}\n`);
      completed = result.status !== 'infra_error';
    }
    if (!completed) exhaustedInfra = true;
  }
}

const runDir = path.join(PROJECT_ROOT, 'results', runId);
const summary = await aggregateRun(runDir);
await writeJson(path.join(runDir, 'summary.json'), {
  runId,
  rootSeed,
  profile: profile.id,
  suite: suite ?? null,
  ...summary,
});
await writeFile(path.join(runDir, 'summary.md'), summaryMarkdown(summary, runId));
process.stdout.write(`Run ${runId} complete. Summary: ${path.join(runDir, 'summary.md')}\n`);
if (exhaustedInfra) {
  process.exitCode = 2;
  process.stderr.write('One or more logical attempts exhausted two infrastructure retries.\n');
}
