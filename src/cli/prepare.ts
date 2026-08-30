import { chmod, cp, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ARTIFACT_CONFIG, PROJECT_ROOT } from '../../apollo-evals.config.js';
import { apolloJavaJarRelativePath, apolloJavaJarUrl, cliArchiveName, cliArchiveUrl, cliReleaseTag, currentCliTarget } from '../core/artifacts.js';
import { ensureDir, sha256, writeJson } from '../core/fs.js';
import { runProcess } from '../core/process.js';
import { dockerVersion, ensureDockerImage } from '../runtime/docker.js';

async function runChecked(command: string, args: string[], timeoutMs = 30 * 60_000): Promise<void> {
  process.stdout.write(`$ ${command} ${args.join(' ')}\n`);
  const result = await runProcess(command, args, { timeoutMs });
  if (result.exitCode !== 0) throw new Error(`${command} failed\n${result.stdout.slice(-2_000)}\n${result.stderr.slice(-4_000)}`);
}

const CURL_RETRY_ARGS = [
  '--http1.1', '--fail', '--location', '--silent', '--show-error',
  '--connect-timeout', '15', '--max-time', '300',
  '--speed-limit', '1024', '--speed-time', '30',
  '--retry', '3', '--retry-delay', '2', '--retry-all-errors',
] as const;

async function githubReleaseAssetSha256(repository: string, releaseTag: string, assetName: string): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`;
  const response = await runProcess('curl', [
    ...CURL_RETRY_ARGS,
    '--header', 'Accept: application/vnd.github+json',
    '--user-agent', 'apollo-evals-prepare',
    apiUrl,
  ], { timeoutMs: 6 * 60_000 });
  if (response.exitCode !== 0) throw new Error(`Unable to read GitHub release metadata: ${apiUrl}\n${response.stderr.slice(-2_000)}`);
  const release = JSON.parse(response.stdout) as { tag_name?: string; assets?: Array<{ name?: string; digest?: string | null }> };
  if (release.tag_name !== releaseTag) throw new Error(`Unexpected GitHub release tag for ${repository}: ${String(release.tag_name)}`);
  const asset = release.assets?.find((candidate) => candidate.name === assetName);
  const digest = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest ?? '')?.[1];
  if (!digest) throw new Error(`GitHub did not provide a SHA-256 digest for ${repository} ${releaseTag} asset ${assetName}`);
  return digest;
}

async function downloadArtifact(url: string, destination: string, expectedSha256?: string): Promise<string> {
  if (expectedSha256 && await sha256(destination).catch(() => '') === expectedSha256) return expectedSha256;
  const part = `${destination}.part`;
  await ensureDir(path.dirname(destination));
  await rm(part, { force: true });
  const downloaded = await runProcess('curl', [
    ...CURL_RETRY_ARGS,
    '--user-agent', 'apollo-evals-prepare',
    '--output', part, url,
  ], { timeoutMs: 6 * 60_000 });
  if (downloaded.exitCode !== 0) throw new Error(`Download failed: ${url}\n${downloaded.stderr.slice(-2_000)}`);
  await chmod(part, 0o600);
  const actual = await sha256(part);
  if (expectedSha256 && actual !== expectedSha256) {
    await rm(part, { force: true });
    throw new Error(`Checksum mismatch for ${url}: expected ${expectedSha256}, got ${actual}`);
  }
  await rm(destination, { force: true });
  await rename(part, destination);
  return actual;
}

async function findFile(root: string, names: Set<string>): Promise<string | undefined> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) { const nested = await findFile(full, names); if (nested) return nested; }
    else if (names.has(entry.name)) return full;
  }
  return undefined;
}

async function prepareCli(cache: string, artifacts: string): Promise<{ path: string; sha256: string; target: string; archiveUrl: string; archiveSha256: string }> {
  const target = currentCliTarget();
  const archiveName = cliArchiveName(target);
  const archiveUrl = cliArchiveUrl(target);
  const archiveSha256 = await githubReleaseAssetSha256(ARTIFACT_CONFIG.apolloCli.repository, cliReleaseTag(), archiveName);
  const archive = path.join(cache, 'downloads', archiveName);
  await downloadArtifact(archiveUrl, archive, archiveSha256);
  const extractDir = path.join(cache, 'extract', archiveName.replace(/\.(?:tar\.gz|zip)$/, ''));
  await rm(extractDir, { recursive: true, force: true });
  await ensureDir(extractDir);
  await runChecked('tar', [archive.endsWith('.tar.gz') ? '-xzf' : '-xf', archive, '-C', extractDir], 120_000);
  const extracted = await findFile(extractDir, new Set(process.platform === 'win32' ? ['apollo.exe'] : ['apollo']));
  if (!extracted) throw new Error(`Apollo CLI binary not found after extracting ${archiveName}`);
  const executable = path.join(artifacts, process.platform === 'win32' ? 'apollo.exe' : 'apollo');
  await cp(extracted, executable);
  await chmod(executable, 0o755);
  const version = await runProcess(executable, ['--version'], { timeoutMs: 30_000 });
  if (version.exitCode !== 0 || !version.stdout.includes(ARTIFACT_CONFIG.apolloCli.version)) throw new Error(`Unexpected Apollo CLI version: ${version.stdout.trim()} ${version.stderr.trim()}`);
  return { path: executable, sha256: await sha256(executable), target, archiveUrl, archiveSha256 };
}

async function prepareMavenRepo(imageId: string, mavenRepo: string): Promise<void> {
  await ensureDir(mavenRepo);
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
  const javaScenariosRoot = path.join(PROJECT_ROOT, 'scenarios', 'java-client');
  const starters = (await readdir(javaScenariosRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const starter of starters) {
    const staged = path.join(PROJECT_ROOT, '.cache', 'maven-starters', `java-client-${starter}`);
    await rm(staged, { recursive: true, force: true });
    await ensureDir(staged);
    await cp(
      path.join(javaScenariosRoot, starter, 'workspace', 'pom.xml'),
      path.join(staged, 'pom.xml'),
    );
    await runChecked('docker', [
      'run', '--rm', '--entrypoint', 'mvn',
      '--user', `${uid}:${gid}`, '--env', 'HOME=/tmp',
      '--mount', `type=bind,src=${staged},dst=/project`,
      '--mount', `type=bind,src=${mavenRepo},dst=/m2`,
      '--workdir', '/project',
      imageId, '-B', '-Dmaven.repo.local=/m2', 'dependency:go-offline',
    ]);
  }
}

async function main(): Promise<void> {
  const cache = path.join(PROJECT_ROOT, '.cache');
  const artifacts = path.join(cache, 'artifacts');
  const mavenRepo = path.join(cache, 'm2', `apollo-java-${ARTIFACT_CONFIG.apolloJava.version}`);
  await ensureDir(artifacts);
  const serverVersion = await dockerVersion();
  const apolloImage = await ensureDockerImage(ARTIFACT_CONFIG.apollo.image);
  const javaRunnerImage = await ensureDockerImage(ARTIFACT_CONFIG.apolloJava.runnerImage);

  const apolloCli = await prepareCli(cache, artifacts);
  await prepareMavenRepo(javaRunnerImage.id, mavenRepo);
  const apolloClientJarPath = path.join(mavenRepo, ...apolloJavaJarRelativePath().split('/'));
  if (!(await stat(apolloClientJarPath)).isFile()) throw new Error(`Missing Maven Central artifact: ${apolloClientJarPath}`);

  await writeJson(path.join(PROJECT_ROOT, 'versions.lock.json'), {
    generatedAt: new Date().toISOString(),
    products: {
      apollo: { version: ARTIFACT_CONFIG.apollo.version, image: ARTIFACT_CONFIG.apollo.image },
      apolloJava: { version: ARTIFACT_CONFIG.apolloJava.version, coordinates: ARTIFACT_CONFIG.apolloJava.coordinates },
      apolloCli: { version: ARTIFACT_CONFIG.apolloCli.version, releaseTag: cliReleaseTag() },
    },
    runtime: { dockerVersion: serverVersion, apolloImage, javaRunnerImage },
    artifacts: {
      apolloCli,
      mavenRepo: {
        path: mavenRepo,
        apolloClientJar: { path: apolloClientJarPath, url: apolloJavaJarUrl(), sha256: await sha256(apolloClientJarPath) },
      },
    },
  });
  process.stdout.write(`Prepared remote artifacts and Docker runtimes; wrote ${path.join(PROJECT_ROOT, 'versions.lock.json')}\n`);
}

await main();
