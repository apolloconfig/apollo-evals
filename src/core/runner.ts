import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT, WORKSPACE_ROOT } from '../../apollo-evals.config.js';
import { CodexAdapter } from '../agent/codex.js';
import { DockerApolloRuntime } from '../runtime/docker-apollo.js';
import { DockerJavaRunner } from '../runtime/java-runner.js';
import { ensureDir, loadLock, writeJson } from './fs.js';
import { collectProvenance } from './provenance.js';
import { Redactor } from './redact.js';
import { renderPrompt } from './discovery.js';
import type {
  AgentProfile,
  AgentRunResult,
  AgentRuntime,
  AttemptIdentity,
  AttemptResult,
  DiscoveredScenario,
  ScenarioState,
} from './types.js';

export async function prepareAttemptWorkspace(
  scenario: DiscoveredScenario,
  workspace: string,
): Promise<void> {
  await rm(workspace, { recursive: true, force: true });
  await ensureDir(workspace);
  const starter = path.join(scenario.dir, 'workspace');
  await cp(starter, workspace, { recursive: true, force: true }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}

function isolatedEnv(
  track: DiscoveredScenario['metadata']['track'],
  lock: Awaited<ReturnType<typeof loadLock>>,
  state: ScenarioState,
  javaRunner?: DockerJavaRunner,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['HOME', 'CODEX_HOME', 'OPENAI_API_KEY', 'LANG', 'LC_ALL', 'SHELL', 'TMPDIR', 'TERM', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) if (process.env[key]) env[key] = process.env[key];
  const standardPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  env.PATH = track === 'apollo-cli'
    ? `${path.dirname(lock.artifacts.apolloCli.path)}:${standardPath}`
    : track === 'apollo-java-client' && javaRunner
      ? `${javaRunner.toolBin}:${standardPath}`
      : standardPath;
  env.APOLLO_SERVER = String(state.public.portalUrl ?? '');
  if (track !== 'apollo-java-client' && state.token) env.APOLLO_TOKEN = state.token;
  if (track === 'apollo-java-client') {
    env.APOLLO_META = 'http://apollo:8080';
    env.APOLLO_CACHE_DIR = '/workspace/.apollo-cache';
    env.MAVEN_OPTS = '-Dmaven.repo.local=/m2';
  }
  return env;
}

function emptyAgent(reason: string): AgentRunResult {
  return { ok: false, exitCode: null, timedOut: false, stopReason: reason, durationMs: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0, events: [], commands: [], externalUrls: [] };
}

export async function runAttempt(
  identity: AttemptIdentity,
  scenario: DiscoveredScenario,
  profile: AgentProfile,
  agentRuntime: AgentRuntime,
  attemptLabel = `attempt-${String(identity.attempt).padStart(2, '0')}`,
): Promise<AttemptResult> {
  const artifactsDir = path.join(
    PROJECT_ROOT,
    'results',
    identity.runId,
    profile.id,
    scenario.id,
    attemptLabel,
  );
  const workspace = path.join(WORKSPACE_ROOT, `${identity.runId}-${scenario.id}-${attemptLabel}`);
  await ensureDir(artifactsDir);
  await prepareAttemptWorkspace(scenario, workspace);
  const runtime = new DockerApolloRuntime();
  const started = Date.now();
  let session: Awaited<ReturnType<DockerApolloRuntime['start']>> | undefined;
  let javaRunner: DockerJavaRunner | undefined;
  let result: AttemptResult | undefined;
  let state: ScenarioState | undefined;
  let agent = emptyAgent('not_started');
  const redactor = new Redactor();
  try {
    session = await runtime.start(identity);
    if (scenario.metadata.track === 'apollo-java-client') {
      javaRunner = await DockerJavaRunner.start(session, workspace, identity);
    }
    const baseContext = { identity, session, workspace, artifactsDir, javaRunner };
    state = await scenario.lifecycle.arrange(baseContext);
    for (const secret of state.secrets ?? []) redactor.add(secret);
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY']) redactor.add(process.env[key]);
    const lock = await loadLock(PROJECT_ROOT);
    const prompt = renderPrompt(scenario.prompt, state.public);
    await writeFile(path.join(artifactsDir, 'prompt.rendered.md'), redactor.redact(prompt), { mode: 0o600 });
    agent = await new CodexAdapter().run({
      prompt,
      workspace,
      profile,
      timeoutSec: scenario.metadata.timeoutSec ?? 240,
      env: isolatedEnv(scenario.metadata.track, lock, state, javaRunner),
      transcriptPath: path.join(artifactsDir, 'transcript.jsonl'),
      stderrPath: path.join(artifactsDir, 'agent.stderr'),
      redactor,
    });
    if (javaRunner) {
      await javaRunner.restart();
      await rm(path.join(workspace, '.apollo-cache'), { recursive: true, force: true });
    }
    const judged = await scenario.lifecycle.judge({ ...baseContext, state, agent });
    const status = agent.ok && judged.passed ? 'passed' : 'failed';
    result = {
      runId: identity.runId, profileId: profile.id, scenarioId: scenario.id, attempt: identity.attempt, seed: identity.seed,
      agent: agentRuntime,
      status, checks: judged.checks, durationMs: Date.now() - started, inputTokens: agent.inputTokens, outputTokens: agent.outputTokens,
      toolCalls: agent.toolCalls, apolloHttpCalls: session.observation.records.length, externalUrls: agent.externalUrls, stopReason: agent.stopReason,
    };
    await writeJson(path.join(artifactsDir, 'transcript.normalized.json'), agent.events);
    await writeFile(path.join(artifactsDir, 'apollo-requests.jsonl'), session.observation.records.map((record) => JSON.stringify(redactor.redactValue(record))).join('\n') + '\n', { mode: 0o600 });
  } catch (error) {
    result = {
      runId: identity.runId, profileId: profile.id, scenarioId: scenario.id, attempt: identity.attempt, seed: identity.seed,
      agent: agentRuntime,
      status: 'infra_error', checks: [], durationMs: Date.now() - started, inputTokens: agent.inputTokens, outputTokens: agent.outputTokens,
      toolCalls: agent.toolCalls, apolloHttpCalls: session?.observation.records.length ?? 0, externalUrls: agent.externalUrls, stopReason: agent.stopReason,
      infraError: String(error instanceof Error ? error.stack ?? error.message : error),
    };
  } finally {
    session?.control.clearSession();
    await javaRunner?.stop();
    await runtime.stop();
    if (session) {
      const serverLog = await readFile(session.serverLog, 'utf8').catch(() => '');
      await writeFile(path.join(artifactsDir, 'server.log'), redactor.redact(serverLog), { mode: 0o600 });
    }
    await rm(path.join(workspace, '.apollo-cache'), { recursive: true, force: true }).catch(() => undefined);
    if (scenario.metadata.track === 'apollo-java-client') await cp(workspace, path.join(artifactsDir, 'workspace'), { recursive: true, force: true }).catch(() => undefined);
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
  await writeJson(path.join(artifactsDir, 'provenance.json'), await collectProvenance(agentRuntime));
  await writeJson(path.join(artifactsDir, 'result.json'), result);
  return result;
}
