import os from 'node:os';
import { PROJECT_ROOT } from '../../apollo-evals.config.js';
import type { AgentRuntime } from './types.js';
import { loadLock } from './fs.js';
import { runProcess } from './process.js';
import { dockerVersion } from '../runtime/docker.js';

export async function collectProvenance(agent: AgentRuntime): Promise<Record<string, unknown>> {
  const lock = await loadLock(PROJECT_ROOT);
  const [harness, currentDockerVersion] = await Promise.all([
    runProcess('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT }),
    dockerVersion(),
  ]);
  return {
    products: lock.products,
    artifacts: lock.artifacts,
    images: {
      apollo: lock.runtime.apolloImage,
      javaRunner: lock.runtime.javaRunnerImage,
    },
    agent,
    harnessCommit: harness.exitCode === 0 ? harness.stdout.trim() : 'uncommitted-unborn-main',
    runtime: {
      node: process.version,
      docker: currentDockerVersion,
      preparedWithDocker: lock.runtime.dockerVersion,
      os: `${os.platform()} ${os.release()} ${os.arch()}`,
    },
  };
}
