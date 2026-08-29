import { ARTIFACT_CONFIG } from '../../apollo-evals.config.js';

export type CliTarget =
  | 'aarch64-apple-darwin'
  | 'aarch64-unknown-linux-gnu'
  | 'x86_64-apple-darwin'
  | 'x86_64-pc-windows-msvc'
  | 'x86_64-unknown-linux-gnu';

export function currentCliTarget(platform = process.platform, arch = process.arch): CliTarget {
  const key = `${platform}-${arch}`;
  const targets: Record<string, CliTarget> = {
    'darwin-arm64': 'aarch64-apple-darwin',
    'darwin-x64': 'x86_64-apple-darwin',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'win32-x64': 'x86_64-pc-windows-msvc',
  };
  const target = targets[key];
  if (!target) throw new Error(`Apollo CLI v${ARTIFACT_CONFIG.apolloCli.version} has no release asset for ${platform}/${arch}`);
  return target;
}

export function cliReleaseTag(): string { return `v${ARTIFACT_CONFIG.apolloCli.version}`; }
export function cliArchiveName(target: CliTarget): string {
  const extension = target.endsWith('windows-msvc') ? 'zip' : 'tar.gz';
  return `apollo-v${ARTIFACT_CONFIG.apolloCli.version}-${target}.${extension}`;
}
export function cliArchiveUrl(target: CliTarget): string {
  const { repository } = ARTIFACT_CONFIG.apolloCli;
  return `https://github.com/${repository}/releases/download/${cliReleaseTag()}/${cliArchiveName(target)}`;
}

export function apolloJavaJarRelativePath(): string {
  const [groupId, artifactId] = ARTIFACT_CONFIG.apolloJava.coordinates.split(':');
  if (!groupId || !artifactId) throw new Error(`Invalid Maven coordinates: ${ARTIFACT_CONFIG.apolloJava.coordinates}`);
  return [
    ...groupId.split('.'), artifactId, ARTIFACT_CONFIG.apolloJava.version,
    `${artifactId}-${ARTIFACT_CONFIG.apolloJava.version}.jar`,
  ].join('/');
}

export function apolloJavaJarUrl(): string {
  return `https://repo.maven.apache.org/maven2/${apolloJavaJarRelativePath()}`;
}
