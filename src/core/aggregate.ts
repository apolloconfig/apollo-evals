import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgentRuntime, AttemptResult } from './types.js';

async function resultFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await resultFiles(full));
    else if (entry.name === 'result.json') files.push(full);
  }
  return files;
}
function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }

function normalizeAttempt(raw: AttemptResult & {
  experimentId?: string;
  caseId?: string;
}): AttemptResult {
  return {
    ...raw,
    profileId: raw.profileId ?? raw.experimentId ?? 'unknown-profile',
    scenarioId: raw.scenarioId ?? raw.caseId ?? 'unknown-scenario',
  };
}

function uniqueAgentRuntimes(attempts: AttemptResult[]): AgentRuntime[] {
  const runtimes = new Map<string, AgentRuntime>();
  for (const attempt of attempts) {
    if (!attempt.agent) continue; // Backward compatibility for results written before agent metadata was embedded.
    const key = [attempt.agent.adapter, attempt.agent.cliCommand, attempt.agent.cliVersion, attempt.agent.model, attempt.agent.reasoningEffort].join('\u0000');
    runtimes.set(key, attempt.agent);
  }
  return [...runtimes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, runtime]) => runtime);
}

export async function aggregateRun(runDir: string): Promise<Record<string, unknown>> {
  const attempts = await Promise.all((await resultFiles(runDir)).map(async (file) => (
    normalizeAttempt(JSON.parse(await readFile(file, 'utf8')) as AttemptResult)
  )));
  const finalAttempts = attempts.filter((attempt) => attempt.status !== 'infra_error');
  const byProfileScenario = new Map<string, AttemptResult[]>();
  for (const attempt of finalAttempts) {
    const key = `${attempt.profileId}/${attempt.scenarioId}`;
    byProfileScenario.set(key, [...(byProfileScenario.get(key) ?? []), attempt]);
  }
  const scenarios = [...byProfileScenario.entries()].map(([key, values]) => ({
    profileScenario: key,
    passed: values.filter((value) => value.status === 'passed').length,
    attempts: values.length,
    stable: values.length > 0 && values.every((value) => value.status === 'passed'),
  }));
  const passed = finalAttempts.filter((attempt) => attempt.status === 'passed');
  const macroSuccessRate = scenarios.length
    ? scenarios.reduce((sum, value) => sum + value.passed / value.attempts, 0) / scenarios.length
    : 0;
  return {
    generatedAt: new Date().toISOString(),
    attempts: finalAttempts.length,
    infraErrors: attempts.length - finalAttempts.length,
    macroSuccessRate,
    stableScenarios: scenarios.filter((value) => value.stable).length,
    agentRuntimes: uniqueAgentRuntimes(attempts),
    scenarios,
    passedEfficiencyMedian: { durationMs: median(passed.map((value) => value.durationMs)), inputTokens: median(passed.map((value) => value.inputTokens)), outputTokens: median(passed.map((value) => value.outputTokens)), toolCalls: median(passed.map((value) => value.toolCalls)) },
  };
}

export function summaryMarkdown(summary: Record<string, unknown>, runId: string): string {
  const scenarios = summary.scenarios as Array<{
    profileScenario: string;
    passed: number;
    attempts: number;
    stable: boolean;
  }>;
  const agentRuntimes = (summary.agentRuntimes ?? []) as AgentRuntime[];
  const rate = Number(summary.macroSuccessRate) * 100;
  const runtimeSection = agentRuntimes.length
    ? `\n## Agent runtimes\n\n| Adapter | CLI command | CLI version | Model | Reasoning effort |\n|---|---|---|---|---|\n${agentRuntimes.map((runtime) => `| ${runtime.adapter} | ${runtime.cliCommand} | ${runtime.cliVersion} | ${runtime.model} | ${runtime.reasoningEffort} |`).join('\n')}\n`
    : '';
  return `# Apollo Evals run ${runId}\n\n- Macro success rate: ${rate.toFixed(1)}%\n- Stable scenarios: ${summary.stableScenarios}/${scenarios.length}\n- Non-infra attempts: ${summary.attempts}\n- Infrastructure errors (including retries): ${summary.infraErrors}\n${runtimeSection}\n| Agent profile / scenario | Passed | Stable |\n|---|---:|:---:|\n${scenarios.map((value) => `| ${value.profileScenario} | ${value.passed}/${value.attempts} | ${value.stable ? 'yes' : 'no'} |`).join('\n')}\n`;
}
