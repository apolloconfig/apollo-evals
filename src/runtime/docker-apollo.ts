import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APOLLO_CONTAINER_PORTS, PROJECT_ROOT } from '../../apollo-evals.config.js';
import { ensureDir, loadLock } from '../core/fs.js';
import { runProcess } from '../core/process.js';
import type { ApolloRequestObservation, ApolloRuntime, ApolloSession, AttemptIdentity } from '../core/types.js';
import { ApolloControlClient } from './control.js';
import { dockerName } from './docker.js';
import { startObservationProxy } from './proxy.js';

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try { if (await predicate()) return; } catch (error) { lastError = String(error); }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError}` : ''}`);
}

async function healthy(url: string, expected: (body: string, status: number) => boolean = (_body, status) => status === 200): Promise<boolean> {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_000) });
  return expected(await response.text(), response.status);
}

async function publishedPort(container: string, containerPort: number): Promise<number> {
  const result = await runProcess('docker', ['port', container, `${containerPort}/tcp`], { timeoutMs: 30_000 });
  if (result.exitCode !== 0) throw new Error(`Unable to resolve Docker port ${containerPort}: ${result.stderr.trim()}`);
  const match = result.stdout.split(/\r?\n/).map((line) => /:(\d+)\s*$/.exec(line)).find(Boolean);
  if (!match?.[1]) throw new Error(`Unexpected Docker port output for ${containerPort}: ${result.stdout.trim()}`);
  return Number(match[1]);
}

export class DockerApolloRuntime implements ApolloRuntime {
  private containerName?: string;
  private networkName?: string;
  private proxy?: Awaited<ReturnType<typeof startObservationProxy>>;
  private serverLog?: string;

  async start(attempt: AttemptIdentity): Promise<ApolloSession> {
    const suffix = dockerName(
      process.pid,
      attempt.runId,
      attempt.scenarioId,
      attempt.attempt,
      attempt.seed,
    );
    this.containerName = dockerName('apollo-evals-apollo', suffix);
    this.networkName = dockerName('apollo-evals-net', suffix);
    const runtimeDir = path.join(PROJECT_ROOT, '.runtime', suffix);
    await rm(runtimeDir, { recursive: true, force: true });
    await ensureDir(runtimeDir);
    this.serverLog = path.join(runtimeDir, 'server.log');
    await writeFile(this.serverLog, '', { mode: 0o600 });

    try {
      const lock = await loadLock(PROJECT_ROOT);
      const network = await runProcess('docker', ['network', 'create', this.networkName], { timeoutMs: 30_000 });
      if (network.exitCode !== 0) throw new Error(`Unable to create Docker network ${this.networkName}: ${network.stderr.trim()}`);

      const dbSuffix = `${attempt.runId}_${attempt.scenarioId}_${attempt.attempt}_${attempt.seed}`
        .replace(/[^A-Za-z0-9_]/g, '_');
      const h2Options = ';mode=mysql;DB_CLOSE_ON_EXIT=FALSE;DB_CLOSE_DELAY=-1;BUILTIN_ALIAS_OVERRIDE=TRUE;DATABASE_TO_UPPER=FALSE';
      const run = await runProcess('docker', [
        'run', '--detach', '--name', this.containerName,
        '--network', this.networkName, '--network-alias', 'apollo',
        '--publish', `127.0.0.1::${APOLLO_CONTAINER_PORTS.portal}`,
        '--publish', `127.0.0.1::${APOLLO_CONTAINER_PORTS.configService}`,
        '--publish', `127.0.0.1::${APOLLO_CONTAINER_PORTS.adminService}`,
        '--env', 'SPRING_PROFILES_ACTIVE=github,database-discovery,auth',
        '--env', 'SPRING_H2_CONSOLE_ENABLED=false',
        '--env', 'SPRING_SQL_CONFIG_INIT_MODE=always',
        '--env', 'SPRING_SQL_PORTAL_INIT_MODE=always',
        '--env', `SPRING_CONFIG_DATASOURCE_URL=jdbc:h2:mem:${dbSuffix}_config${h2Options}`,
        '--env', `SPRING_PORTAL_DATASOURCE_URL=jdbc:h2:mem:${dbSuffix}_portal${h2Options}`,
        '--entrypoint', 'java',
        lock.runtime.apolloImage.id,
        '-jar', '/apollo-quick-start/apollo-all-in-one.jar',
      ], { timeoutMs: 60_000 });
      if (run.exitCode !== 0) throw new Error(`Unable to start Apollo Docker container: ${run.stderr.trim()}`);

      const portalPort = await publishedPort(this.containerName, APOLLO_CONTAINER_PORTS.portal);
      const configPort = await publishedPort(this.containerName, APOLLO_CONTAINER_PORTS.configService);
      const adminPort = await publishedPort(this.containerName, APOLLO_CONTAINER_PORTS.adminService);
      const portalUrl = `http://127.0.0.1:${portalPort}`;
      const configServiceUrl = `http://127.0.0.1:${configPort}`;
      const adminServiceUrl = `http://127.0.0.1:${adminPort}`;

      await waitFor(async () => await healthy(`${configServiceUrl}/health`), 120_000, 'Config Service /health');
      await waitFor(async () => await healthy(`${adminServiceUrl}/health`), 120_000, 'Admin Service /health');
      await waitFor(async () => await healthy(`${portalUrl}/signin`, (_body, status) => status === 200), 120_000, 'Portal /signin');
      await waitFor(async () => await healthy(`${configServiceUrl}/services/config`, (body, status) => status === 200 && body.includes('8080')), 45_000, 'Config Service registration');
      await waitFor(async () => await healthy(`${configServiceUrl}/services/admin`, (body, status) => status === 200 && body.includes('8090')), 45_000, 'Admin Service registration');

      const observation: ApolloRequestObservation = { records: [] };
      const control = new ApolloControlClient(portalUrl, configServiceUrl);
      await control.login();
      await waitFor(async () => {
        try {
          await control.request('/openapi/v1/envs/LOCAL/apps/SampleApp/clusters/default/namespaces/application');
          return true;
        } catch (error) {
          return /:\s404\b/.test(String(error));
        }
      }, 45_000, 'Portal to Admin Service discovery');
      this.proxy = await startObservationProxy(portalUrl, observation);
      return {
        portalUrl,
        agentPortalUrl: this.proxy.url,
        configServiceUrl,
        adminServiceUrl,
        control,
        observation,
        serverLog: this.serverLog,
        dockerNetwork: this.networkName,
        runtimeContainer: this.containerName,
      };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.proxy) { await this.proxy.close().catch(() => undefined); this.proxy = undefined; }
    if (this.containerName) {
      await runProcess('docker', ['stop', '--time', '10', this.containerName], { timeoutMs: 20_000 }).catch(() => undefined);
      const logs = await runProcess('docker', ['logs', '--timestamps', this.containerName], { timeoutMs: 30_000 }).catch(() => undefined);
      if (this.serverLog && logs) await writeFile(this.serverLog, `${logs.stdout}${logs.stderr}`, { mode: 0o600 }).catch(() => undefined);
      await runProcess('docker', ['rm', '--force', this.containerName], { timeoutMs: 30_000 }).catch(() => undefined);
      this.containerName = undefined;
    }
    if (this.networkName) {
      await runProcess('docker', ['network', 'rm', this.networkName], { timeoutMs: 30_000 }).catch(() => undefined);
      this.networkName = undefined;
    }
  }

  async readServerLog(): Promise<string> {
    return this.serverLog ? await readFile(this.serverLog, 'utf8').catch(() => '') : '';
  }
}
