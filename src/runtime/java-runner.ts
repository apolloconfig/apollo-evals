import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { chmod, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT } from '../../apollo-evals.config.js';
import { ensureDir, loadLock } from '../core/fs.js';
import { runProcess, type ProcessResult } from '../core/process.js';
import type { ApolloSession, AttemptIdentity } from '../core/types.js';
import { dockerName } from './docker.js';

export class DockerJavaRunner {
  private containerName: string;
  private readonly workspace: string;
  private readonly network: string;
  private readonly imageId: string;
  private readonly mavenRepo: string;
  readonly toolBin: string;

  private constructor(input: {
    containerName: string;
    workspace: string;
    network: string;
    imageId: string;
    mavenRepo: string;
    toolBin: string;
  }) {
    this.containerName = input.containerName;
    this.workspace = input.workspace;
    this.network = input.network;
    this.imageId = input.imageId;
    this.mavenRepo = input.mavenRepo;
    this.toolBin = input.toolBin;
  }

  static async start(session: ApolloSession, workspace: string, identity: AttemptIdentity): Promise<DockerJavaRunner> {
    const lock = await loadLock(PROJECT_ROOT);
    const dockerWorkspace = await realpath(workspace);
    const containerName = dockerName(
      'apollo-evals-java',
      process.pid,
      identity.runId,
      identity.scenarioId,
      identity.attempt,
      identity.seed,
    );
    const toolBin = path.join(workspace, '.apollo-evals-bin');
    const runner = new DockerJavaRunner({
      containerName,
      workspace: dockerWorkspace,
      network: session.dockerNetwork,
      imageId: lock.runtime.javaRunnerImage.id,
      mavenRepo: lock.artifacts.mavenRepo.path,
      toolBin,
    });
    try {
      await runner.startContainer();
      await runner.writeWrappers();
      return runner;
    } catch (error) {
      await runner.stop();
      throw error;
    }
  }

  private async startContainer(): Promise<void> {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
    const script = 'cp -a /m2-base/. /m2/ && touch /tmp/apollo-evals-ready && trap "exit 0" TERM INT; while :; do sleep 3600 & wait $!; done';
    const result = await runProcess('docker', [
      'run', '--detach', '--name', this.containerName,
      '--network', this.network,
      '--user', `${uid}:${gid}`,
      '--mount', `type=bind,src=${this.workspace},dst=/workspace`,
      '--mount', `type=bind,src=${this.mavenRepo},dst=/m2-base,readonly`,
      '--tmpfs', `/m2:rw,exec,uid=${uid},gid=${gid},mode=0755`,
      '--workdir', '/workspace',
      '--env', 'HOME=/tmp',
      '--env', 'APOLLO_META=http://apollo:8080',
      '--env', 'APOLLO_CACHE_DIR=/workspace/.apollo-cache',
      '--env', 'MAVEN_OPTS=-Dmaven.repo.local=/m2',
      '--entrypoint', 'sh',
      this.imageId, '-c', script,
    ], { timeoutMs: 60_000 });
    if (result.exitCode !== 0) throw new Error(`Unable to start Java runner: ${result.stderr.trim()}`);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const ready = await runProcess('docker', ['exec', this.containerName, 'test', '-f', '/tmp/apollo-evals-ready'], { timeoutMs: 5_000 });
      if (ready.exitCode === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const logs = await runProcess('docker', ['logs', this.containerName], { timeoutMs: 10_000 });
    throw new Error(`Timed out preparing isolated Maven repository\n${logs.stdout}\n${logs.stderr}`);
  }

  private async writeWrappers(): Promise<void> {
    await rm(this.toolBin, { recursive: true, force: true });
    await ensureDir(this.toolBin);
    for (const command of ['mvn', 'java']) {
      const file = path.join(this.toolBin, command);
      await writeFile(file, `#!/bin/sh\nexec docker exec -i -w /workspace ${this.containerName} ${command} "$@"\n`, { mode: 0o700 });
      await chmod(file, 0o700);
    }
  }

  async restart(): Promise<void> {
    await this.stopContainer();
    await this.startContainer();
  }

  async run(command: string, args: string[], options: { timeoutMs?: number; stdin?: string } = {}): Promise<ProcessResult> {
    return await runProcess('docker', ['exec', '-w', '/workspace', this.containerName, command, ...args], {
      timeoutMs: options.timeoutMs,
      stdin: options.stdin,
    });
  }

  spawn(command: string, args: string[]): ChildProcessWithoutNullStreams {
    const child = spawn('docker', ['exec', '-w', '/workspace', this.containerName, command, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end();
    return child;
  }

  private async stopContainer(): Promise<void> {
    await runProcess('docker', ['rm', '--force', this.containerName], { timeoutMs: 30_000 }).catch(() => undefined);
  }

  async stop(): Promise<void> {
    await this.stopContainer();
    await rm(this.toolBin, { recursive: true, force: true }).catch(() => undefined);
  }
}
