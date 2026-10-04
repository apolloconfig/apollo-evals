import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIFACT_CONFIG } from '../apollo-evals.config.js';
import lifecycle from '../scenarios/java-client/cluster-precedence/scenario.js';

type Context = Parameters<typeof lifecycle.verify>[0];

describe('cluster precedence verification', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'apollo-cluster-verifier-'));
    await mkdir(path.join(workspace, 'src/main/java/scenario'), { recursive: true });
    await mkdir(path.join(workspace, 'target'));
    await writeFile(path.join(workspace, 'target/classpath.txt'), '/m2/apollo-client.jar');
    await writeFile(path.join(workspace, 'pom.xml'), `<project><dependencies><dependency>
      <artifactId>apollo-client</artifactId><version>${ARTIFACT_CONFIG.apolloJava.version}</version>
    </dependency></dependencies></project>`);
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  async function verify(source: string, preferredValue = 'cluster-value') {
    await writeFile(path.join(workspace, 'src/main/java/scenario/ClusterPrecedence.java'), source);
    const result = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', timedOut: false, durationMs: 1 });
    const context = {
      workspace,
      state: {
        public: {
          targetApp: 'cluster-app', distractorApp: 'cluster-app-shadow', key: 'key',
          preferredCluster: 'canary', missingCluster: 'missing',
          apolloJavaVersion: ARTIFACT_CONFIG.apolloJava.version,
        },
        expected: { preferredValue: 'cluster-value', defaultValue: 'default-value' },
        distractorValue: 'do-not-touch',
      },
      javaRunner: {
        run: vi.fn()
          .mockResolvedValueOnce(result(''))
          .mockResolvedValueOnce(result(JSON.stringify({ cluster: 'canary', value: preferredValue })))
          .mockResolvedValueOnce(result(JSON.stringify({ cluster: 'missing', value: 'default-value' }))),
      },
      session: { control: { config: vi.fn().mockResolvedValue({ key: 'do-not-touch' }) } },
    } as unknown as Context;
    return lifecycle.verify(context);
  }

  it.each([
    '"apollo.cluster"',
    'ApolloClientSystemConsts.APOLLO_CLUSTER',
    'ConfigConsts.APOLLO_CLUSTER_KEY',
  ])('accepts cluster selection using %s', async (clusterKey) => {
    const verified = await verify(`
      System.setProperty(${clusterKey}, cluster);
      Config config = ConfigService.getConfig(appId, namespace);
      String value = config.getProperty(key, null);
    `);
    expect(verified.passed).toBe(true);
  });

  it('rejects client reads without cluster selection', async () => {
    const verified = await verify('Config config = ConfigService.getConfig(appId, namespace);');
    expect(verified.checks.find((check) => check.name === 'uses cluster-aware Apollo Java Client read')?.passed).toBe(false);
  });

  it('still rejects raw HTTP alongside official cluster constants', async () => {
    const verified = await verify(`
      System.setProperty(ApolloClientSystemConsts.APOLLO_CLUSTER, cluster);
      Config config = ConfigService.getConfig(appId, namespace);
      HttpClient client = HttpClient.newHttpClient();
    `);
    expect(verified.passed).toBe(false);
    expect(verified.checks.find((check) => check.name === 'uses cluster-aware Apollo Java Client read')?.passed).toBe(false);
  });

  it('still rejects an incorrect cluster value with a valid client call', async () => {
    const verified = await verify(`
      System.setProperty(ApolloClientSystemConsts.APOLLO_CLUSTER, cluster);
      Config config = ConfigService.getConfig(appId, namespace);
    `, 'wrong-value');
    expect(verified.passed).toBe(false);
    expect(verified.checks.find((check) => check.name === 'preferred cluster overrides default')?.passed).toBe(false);
  });
});
