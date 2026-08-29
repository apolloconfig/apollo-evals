import { cp } from 'node:fs/promises';
import path from 'node:path';
import { SeededRandom } from '../core/random.js';
import type {
  AgentRunResult,
  CheckResult,
  ScenarioContext,
  ScenarioState,
  Verdict,
} from '../core/types.js';

export type ScenarioBaseState = ScenarioState & {
  public: { targetApp: string; distractorApp: string; key: string; [key: string]: unknown };
  token: string;
  distractorValue: string;
};

export async function arrangeBaseState(
  context: Omit<ScenarioContext<ScenarioBaseState>, 'state' | 'agent'>,
  label: string,
): Promise<ScenarioBaseState> {
  const random = new SeededRandom(context.identity.seed);
  const targetApp = random.token(`scenario-${label}`, 10).toLowerCase();
  const distractorApp = `${targetApp}-shadow`;
  const key = random.token('key', 8).replace('-', '.');
  const distractorValue = random.token('do-not-touch', 12);
  await context.session.control.createApp(targetApp);
  await context.session.control.createApp(distractorApp);
  await context.session.control.putItem(distractorApp, 'application', key, distractorValue);
  await context.session.control.release(distractorApp, 'application', 'distractor-baseline');
  const token = await context.session.control.createUserToken(
    `scenario-${label}-${context.identity.seed}`,
    [targetApp],
  );
  return { public: { targetApp, distractorApp, key }, token, secrets: [token], distractorValue };
}

export function check(name: string, category: CheckResult['category'], passed: boolean, detail?: string): CheckResult {
  return detail === undefined ? { name, category, passed } : { name, category, passed, detail };
}

export function verdict(checks: CheckResult[]): Verdict {
  return { passed: checks.every((entry) => entry.passed), checks };
}
export function commandIncludes(agent: AgentRunResult, ...patterns: RegExp[]): boolean { const joined = agent.commands.join('\n'); return patterns.every((pattern) => pattern.test(joined)); }
export function usedRawHttp(commands: string[]): boolean {
  const commandBoundary = String.raw`(?:^|(?:&&|\|\||[;|\n])\s*|\s-(?:lc|c)\s+)`;
  const assignments = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]+\s+)*`;
  const directClient = new RegExp(commandBoundary + assignments + String.raw`(?:[^\s;&|]*\/)?(?:curl|wget|http)(?=\s|$)`);
  const apolloRawApi = new RegExp(commandBoundary + assignments + String.raw`(?:[^\s;&|]*\/)?apollo(?:\s+[^\s;&|]+)*\s+api\s+(?:get|post|put|patch|delete)(?=\s|$)`);
  return commands.some((command) => {
    const withoutShellQuotes = command.replace(/["']/g, '');
    return directClient.test(withoutShellQuotes) || apolloRawApi.test(withoutShellQuotes);
  });
}
export function observed(context: ScenarioContext, method: string, pattern: RegExp): boolean {
  return context.session.observation.records.some(
    (record) => record.method === method && pattern.test(record.path),
  );
}

export function referenceAgent(commands: string[] = []): AgentRunResult {
  return {
    ok: true,
    exitCode: 0,
    timedOut: false,
    stopReason: 'reference',
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: commands.length,
    events: commands.map((command) => ({ type: 'command', command })),
    commands,
    externalUrls: [],
  };
}

export async function copyStarter(scenarioDir: string, workspace: string): Promise<void> {
  await cp(path.join(scenarioDir, 'workspace'), workspace, { recursive: true, force: true });
}
