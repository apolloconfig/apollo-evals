import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const WORKSPACE_ROOT = process.env.APOLLO_EVALS_WORKSPACE_ROOT
  ? path.resolve(process.env.APOLLO_EVALS_WORKSPACE_ROOT)
  : path.join(os.homedir(), '.cache', 'apollo-evals', 'workspaces');

export const APOLLO_CONTAINER_PORTS = { portal: 8070, configService: 8080, adminService: 8090 } as const;
const APOLLO_VERSION = '3.0.0-SNAPSHOT';
const APOLLO_IMAGE_REPOSITORY = 'nobodyiam/apollo-quick-start';
const APOLLO_JAVA_VERSION = '2.5.0';
const APOLLO_CLI_VERSION = '0.1.0';

export const ARTIFACT_CONFIG = {
  apollo: {
    version: APOLLO_VERSION,
    imageRepository: APOLLO_IMAGE_REPOSITORY,
    image: `${APOLLO_IMAGE_REPOSITORY}:${APOLLO_VERSION}`,
  },
  apolloJava: {
    version: APOLLO_JAVA_VERSION,
    coordinates: 'com.ctrip.framework.apollo:apollo-client',
    runnerImage: 'maven:3.9.11-eclipse-temurin-17',
  },
  apolloCli: {
    version: APOLLO_CLI_VERSION,
    repository: 'apolloconfig/apollo-cli',
  },
} as const;
