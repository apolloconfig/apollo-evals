import path from 'node:path';
import { ARTIFACT_CONFIG, PROJECT_ROOT } from '../../apollo-evals.config.js';
import { apolloJavaJarRelativePath, apolloJavaJarUrl, cliReleaseTag, currentCliTarget } from './artifacts.js';
import { loadLock, sha256 } from './fs.js';
import { runProcess } from './process.js';
import type { AgentProfile, AgentRuntime } from './types.js';
import { dockerVersion, inspectDockerImage } from '../runtime/docker.js';

const REQUIRED_CODEX_EXEC_OPTIONS = [
  '--config',
  '--strict-config',
  '--model',
  '--sandbox',
  '--cd',
  '--skip-git-repo-check',
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '--json',
] as const;

const REQUIRED_CLAUDE_CODE_OPTIONS = [
  '--print',
  '--output-format',
  '--verbose',
  '--no-session-persistence',
  '--safe-mode',
  '--strict-mcp-config',
  '--dangerously-skip-permissions',
  '--model',
  '--effort',
] as const;

function requireEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`${label} drifted from apollo-evals.config.ts; run pnpm prepare`);
}

export async function verifyPrepared(): Promise<void> {
  const lock = await loadLock(PROJECT_ROOT).catch((error) => {
    throw new Error(`Run pnpm prepare first: ${String(error)}`);
  });

  requireEqual('Apollo version', lock.products.apollo.version, ARTIFACT_CONFIG.apollo.version);
  requireEqual('Apollo image', lock.products.apollo.image, ARTIFACT_CONFIG.apollo.image);
  requireEqual('Apollo runtime image', lock.runtime.apolloImage.reference, ARTIFACT_CONFIG.apollo.image);
  requireEqual('Apollo Java version', lock.products.apolloJava.version, ARTIFACT_CONFIG.apolloJava.version);
  requireEqual('Apollo Java coordinates', lock.products.apolloJava.coordinates, ARTIFACT_CONFIG.apolloJava.coordinates);
  requireEqual('Java runner image', lock.runtime.javaRunnerImage.reference, ARTIFACT_CONFIG.apolloJava.runnerImage);
  requireEqual('Apollo CLI version', lock.products.apolloCli.version, ARTIFACT_CONFIG.apolloCli.version);
  requireEqual('Apollo CLI release tag', lock.products.apolloCli.releaseTag, cliReleaseTag());
  requireEqual('Apollo CLI target', lock.artifacts.apolloCli.target, currentCliTarget());

  if (await sha256(lock.artifacts.apolloCli.path).catch(() => '') !== lock.artifacts.apolloCli.sha256) {
    throw new Error(`Artifact checksum mismatch: ${lock.artifacts.apolloCli.path}; rerun pnpm prepare`);
  }

  const cli = await runProcess(lock.artifacts.apolloCli.path, ['--version'], { timeoutMs: 30_000 });
  if (cli.exitCode !== 0 || !cli.stdout.includes(ARTIFACT_CONFIG.apolloCli.version)) {
    throw new Error(`Apollo CLI must be ${ARTIFACT_CONFIG.apolloCli.version}; rerun pnpm prepare`);
  }

  const expectedMavenArtifact = path.join(lock.artifacts.mavenRepo.path, ...apolloJavaJarRelativePath().split('/'));
  requireEqual('Apollo Java artifact path', lock.artifacts.mavenRepo.apolloClientJar.path, expectedMavenArtifact);
  requireEqual('Apollo Java artifact URL', lock.artifacts.mavenRepo.apolloClientJar.url, apolloJavaJarUrl());
  if (await sha256(lock.artifacts.mavenRepo.apolloClientJar.path).catch(() => '') !== lock.artifacts.mavenRepo.apolloClientJar.sha256) {
    throw new Error(`Apollo Java ${ARTIFACT_CONFIG.apolloJava.version} is not prepared in ${lock.artifacts.mavenRepo.path}; rerun pnpm prepare`);
  }

  await dockerVersion();
  for (const [label, reference, expectedId] of [
    ['Apollo', lock.runtime.apolloImage.reference, lock.runtime.apolloImage.id],
    ['Java runner', lock.runtime.javaRunnerImage.reference, lock.runtime.javaRunnerImage.id],
  ] as const) {
    const image = await inspectDockerImage(reference);
    if (!image) throw new Error(`${label} Docker image is unavailable: ${reference}; rerun pnpm prepare`);
    if (image.id !== expectedId) throw new Error(`${label} Docker image tag now points to ${image.id}, expected ${expectedId}; rerun pnpm prepare to accept the new image`);
  }
}

export async function verifyAgentAdapter(profile: AgentProfile, runner: typeof runProcess = runProcess): Promise<AgentRuntime> {
  if (profile.adapter === 'claude-code') {
    let claude: Awaited<ReturnType<typeof runProcess>>;
    try {
      claude = await runner('claude', ['--version'], { timeoutMs: 30_000 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Claude Code CLI was not found on PATH. Install and authenticate Claude Code on the host before running an evaluation or replay.', { cause: error });
      }
      throw new Error(`Unable to run the host Claude Code CLI: ${String(error)}`, { cause: error });
    }

    const cliVersion = claude.stdout.trim() || claude.stderr.trim();
    if (claude.exitCode !== 0 || claude.timedOut || !cliVersion) {
      throw new Error(`Unable to read the host Claude Code CLI version: ${cliVersion || 'unavailable'}`);
    }

    const help = await runner('claude', ['--help'], { timeoutMs: 30_000 });
    const helpText = `${help.stdout}\n${help.stderr}`;
    if (help.exitCode !== 0 || help.timedOut) {
      throw new Error(`The installed Claude Code CLI cannot run non-interactively: ${helpText.trim() || 'claude --help failed'}`);
    }
    const missingOptions = REQUIRED_CLAUDE_CODE_OPTIONS.filter((option) => !helpText.includes(option));
    if (missingOptions.length) {
      throw new Error(`The installed Claude Code CLI does not support the options required by this adapter: ${missingOptions.join(', ')}. No exact version is required; install a compatible Claude Code CLI.`);
    }

    return {
      adapter: profile.adapter,
      cliCommand: 'claude',
      cliVersion,
      model: profile.model,
      reasoningEffort: profile.reasoningEffort,
    };
  }

  let codex: Awaited<ReturnType<typeof runProcess>>;
  try {
    codex = await runner('codex', ['--version'], { timeoutMs: 30_000 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Codex CLI was not found on PATH. Install and authenticate Codex on the host before running an evaluation or replay.', { cause: error });
    }
    throw new Error(`Unable to run the host Codex CLI: ${String(error)}`, { cause: error });
  }

  const cliVersion = codex.stdout.trim() || codex.stderr.trim();
  if (codex.exitCode !== 0 || codex.timedOut || !cliVersion) {
    throw new Error(`Unable to read the host Codex CLI version: ${cliVersion || 'unavailable'}`);
  }

  const help = await runner('codex', ['exec', '--help'], { timeoutMs: 30_000 });
  const helpText = `${help.stdout}\n${help.stderr}`;
  if (help.exitCode !== 0 || help.timedOut) {
    throw new Error(`The installed Codex CLI cannot run non-interactively: ${helpText.trim() || 'codex exec --help failed'}`);
  }
  const missingOptions = REQUIRED_CODEX_EXEC_OPTIONS.filter((option) => !helpText.includes(option));
  if (missingOptions.length) {
    throw new Error(`The installed Codex CLI does not support the options required by this adapter: ${missingOptions.join(', ')}. No exact version is required; install a compatible Codex CLI.`);
  }

  return {
    adapter: profile.adapter,
    cliCommand: 'codex',
    cliVersion,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
  };
}
