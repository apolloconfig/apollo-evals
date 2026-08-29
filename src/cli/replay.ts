import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT } from '../../apollo-evals.config.js';
import { parseArgs, requireArg } from '../core/args.js';
import { discoverScenarios } from '../core/discovery.js';
import { loadAgentProfile } from '../core/agent-profiles.js';
import { runAttempt } from '../core/runner.js';
import type { AttemptResult } from '../core/types.js';
import { verifyAgentAdapter, verifyPrepared } from '../core/verify.js';

const args = parseArgs();
const sourceRunId = requireArg(args, 'run-id');
const scenarioId = requireArg(args, 'scenario');
const attempt = Number(requireArg(args, 'attempt'));
await verifyPrepared();

const sourceRun = path.join(PROJECT_ROOT, 'results', sourceRunId);
const profileDirs = await readdir(sourceRun, { withFileTypes: true });
let source: AttemptResult | undefined;
let profileId = '';
for (const profileDir of profileDirs.filter((entry) => entry.isDirectory())) {
  const scenarioDir = path.join(sourceRun, profileDir.name, scenarioId);
  for (const dir of await readdir(scenarioDir, { withFileTypes: true }).catch(() => [])) {
    if (!dir.isDirectory()) continue;
    const candidate = JSON.parse(
      await readFile(path.join(scenarioDir, dir.name, 'result.json'), 'utf8'),
    ) as AttemptResult;
    if (candidate.attempt === attempt && candidate.status !== 'infra_error') {
      source = candidate;
      profileId = profileDir.name;
      break;
    }
  }
}
if (!source) throw new Error('Source non-infra attempt not found');

const scenario = (await discoverScenarios(PROJECT_ROOT)).find((entry) => entry.id === scenarioId);
if (!scenario) throw new Error(`Unknown scenario ${scenarioId}`);
const profile = await loadAgentProfile(profileId);
const runId = `${sourceRunId}-replay-${scenarioId}-${attempt}-${Date.now()}`;
const agentRuntime = await verifyAgentAdapter(profile);
const result = await runAttempt(
  { runId, profileId, scenarioId, attempt, seed: source.seed },
  scenario,
  profile,
  agentRuntime,
);
process.stdout.write(`${result.status} seed=${source.seed} run=${runId}\n`);
