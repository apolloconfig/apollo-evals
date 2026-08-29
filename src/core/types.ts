export type ProductTrack = 'apollo-cli' | 'apollo-java-client';
export type Campaign = 'smoke' | 'benchmark';
export type AttemptStatus = 'passed' | 'failed' | 'infra_error';
export type CheckCategory = 'outcome' | 'interaction' | 'boundary';

export type ScenarioMetadata = {
  id: string;
  campaigns: Campaign[];
  track: ProductTrack;
  products: string[];
  timeoutSec?: number;
};

export type AgentProfile = {
  id: string;
  adapter: 'codex';
  model: string;
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
};

export type AgentRuntime = {
  adapter: AgentProfile['adapter'];
  cliCommand: string;
  cliVersion: string;
  model: string;
  reasoningEffort: AgentProfile['reasoningEffort'];
};

export type AttemptIdentity = {
  runId: string;
  profileId: string;
  scenarioId: string;
  attempt: number;
  seed: number;
};

export type ApolloRequestRecord = {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  userAgent?: string;
  authType: 'none' | 'bearer' | 'cookie' | 'other';
};

export type ApolloRequestObservation = {
  records: ApolloRequestRecord[];
};

export interface ApolloSession {
  portalUrl: string;
  agentPortalUrl: string;
  configServiceUrl: string;
  adminServiceUrl: string;
  control: import('../runtime/control.js').ApolloControlClient;
  observation: ApolloRequestObservation;
  serverLog: string;
  dockerNetwork: string;
  runtimeContainer: string;
}

export interface ApolloRuntime {
  start(attempt: AttemptIdentity): Promise<ApolloSession>;
  stop(): Promise<void>;
}

export type ScenarioState = {
  public: Record<string, unknown>;
  secrets?: string[];
  token?: string;
  [key: string]: unknown;
};

export type NormalizedEvent = {
  type: 'message' | 'reasoning' | 'command' | 'file_change' | 'web_search' | 'usage' | 'other';
  timestamp?: string;
  text?: string;
  command?: string;
  path?: string;
  url?: string;
  inputTokens?: number;
  outputTokens?: number;
  rawType?: string;
};

export type AgentRunInput = {
  prompt: string;
  workspace: string;
  profile: AgentProfile;
  timeoutSec: number;
  env: NodeJS.ProcessEnv;
  transcriptPath: string;
  stderrPath: string;
  redactor: import('./redact.js').Redactor;
};

export type AgentRunResult = {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  stopReason: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  events: NormalizedEvent[];
  commands: string[];
  externalUrls: string[];
};

export interface AgentAdapter {
  id: 'codex';
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export type CheckResult = {
  name: string;
  category: CheckCategory;
  passed: boolean;
  detail?: string;
};

export type Verdict = {
  passed: boolean;
  checks: CheckResult[];
};

export type ScenarioContext<T extends ScenarioState = ScenarioState> = {
  identity: AttemptIdentity;
  session: ApolloSession;
  state: T;
  workspace: string;
  artifactsDir: string;
  agent: AgentRunResult;
  javaRunner?: import('../runtime/java-runner.js').DockerJavaRunner;
};

export type ScenarioLifecycle<T extends ScenarioState = ScenarioState> = {
  arrange(context: Omit<ScenarioContext<T>, 'state' | 'agent'>): Promise<T>;
  judge(context: ScenarioContext<T>): Promise<Verdict>;
  reference?(context: Omit<ScenarioContext<T>, 'agent'>): Promise<AgentRunResult>;
};

export type DiscoveredScenario = {
  id: string;
  dir: string;
  prompt: string;
  metadata: ScenarioMetadata;
  lifecycle: ScenarioLifecycle;
};

export type AttemptResult = {
  runId: string;
  profileId: string;
  scenarioId: string;
  attempt: number;
  seed: number;
  agent: AgentRuntime;
  status: AttemptStatus;
  checks: CheckResult[];
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  apolloHttpCalls: number;
  externalUrls: string[];
  stopReason: string;
  infraError?: string;
};
