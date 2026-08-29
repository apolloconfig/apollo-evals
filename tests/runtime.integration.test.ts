import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WORKSPACE_ROOT } from '../apollo-evals.config.js';
import { ensureDir } from '../src/core/fs.js';
import { runProcess } from '../src/core/process.js';
import { DockerApolloRuntime } from '../src/runtime/docker-apollo.js';
import { DockerJavaRunner } from '../src/runtime/java-runner.js';

describe.sequential('Docker runtimes', () => {
  let runtime: DockerApolloRuntime | undefined;
  let javaRunner: DockerJavaRunner | undefined;
  let workspace: string | undefined;

  afterEach(async () => {
    await javaRunner?.stop();
    await runtime?.stop();
    if (workspace) await rm(workspace, { recursive: true, force: true });
    javaRunner = undefined;
    runtime = undefined;
    workspace = undefined;
  });

  it('starts Apollo on dynamic host ports and runs Java in a separate container on the attempt network', async () => {
    runtime = new DockerApolloRuntime();
    const identity = {
      runId: 'runtime-integration',
      profileId: 'test',
      scenarioId: 'runtime',
      attempt: 1,
      seed: 42,
    };
    const session = await runtime.start(identity);
    expect(new URL(session.portalUrl).port).not.toBe('8070');
    expect(new URL(session.configServiceUrl).port).not.toBe('8080');
    expect(new URL(session.adminServiceUrl).port).not.toBe('8090');

    const appId = 'scenario-runtime-integration';
    await session.control.createApp(appId);
    const token = await session.control.createUserToken('runtime-integration', [appId]);
    const response = await fetch(`${session.agentPortalUrl}/openapi/v1/user-tokens/current`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'apollo-evals-integration' },
    });
    expect(response.status).toBe(200);
    expect(session.observation.records.some((record) => record.authType === 'bearer' && record.userAgent === 'apollo-evals-integration')).toBe(true);

    await ensureDir(WORKSPACE_ROOT);
    workspace = await mkdtemp(path.join(WORKSPACE_ROOT, 'integration-java-runner-'));
    javaRunner = await DockerJavaRunner.start(session, workspace, identity);
    const maven = await javaRunner.run('mvn', ['--version'], { timeoutMs: 30_000 });
    expect(maven.exitCode).toBe(0);
    expect(maven.stdout).toContain('Apache Maven');
    const wrappedMaven = await runProcess(path.join(javaRunner.toolBin, 'mvn'), ['--version'], {
      timeoutMs: 30_000,
      env: { ...process.env, PATH: `${javaRunner.toolBin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` },
    });
    expect(wrappedMaven.exitCode).toBe(0);
    expect(wrappedMaven.stdout).toContain('Apache Maven');
    const networkMembers = await runProcess('docker', ['network', 'inspect', session.dockerNetwork, '--format', '{{len .Containers}}']);
    expect(Number(networkMembers.stdout.trim())).toBe(2);

    const runtimeContainer = session.runtimeContainer;
    const dockerNetwork = session.dockerNetwork;
    await javaRunner.stop(); javaRunner = undefined;
    await runtime.stop(); runtime = undefined;
    expect((await runProcess('docker', ['container', 'inspect', runtimeContainer])).exitCode).not.toBe(0);
    expect((await runProcess('docker', ['network', 'inspect', dockerNetwork])).exitCode).not.toBe(0);
  }, 180_000);
});
