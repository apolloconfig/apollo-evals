import { runProcess } from '../core/process.js';

export type DockerImageInfo = {
  reference: string;
  id: string;
  repoDigests: string[];
  architecture: string;
  os: string;
};

type InspectImage = {
  Id?: string;
  RepoDigests?: string[];
  Architecture?: string;
  Os?: string;
};

export async function dockerVersion(): Promise<string> {
  const result = await runProcess('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 30_000 });
  if (result.exitCode !== 0 || !result.stdout.trim()) throw new Error(`Docker daemon is unavailable: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

export async function inspectDockerImage(reference: string): Promise<DockerImageInfo | undefined> {
  const result = await runProcess('docker', ['image', 'inspect', reference], { timeoutMs: 30_000 });
  if (result.exitCode !== 0) return undefined;
  const parsed = JSON.parse(result.stdout) as InspectImage[];
  const image = parsed[0];
  if (!image?.Id || !image.Architecture || !image.Os) throw new Error(`Incomplete Docker image metadata for ${reference}`);
  return { reference, id: image.Id, repoDigests: image.RepoDigests ?? [], architecture: image.Architecture, os: image.Os };
}

export async function ensureDockerImage(reference: string): Promise<DockerImageInfo> {
  const existing = await inspectDockerImage(reference);
  if (existing) return existing;
  process.stdout.write(`$ docker pull ${reference}\n`);
  const pulled = await runProcess('docker', ['pull', reference], { timeoutMs: 30 * 60_000 });
  if (pulled.exitCode !== 0) throw new Error(`Unable to pull Docker image ${reference}\n${pulled.stdout.slice(-2_000)}\n${pulled.stderr.slice(-4_000)}`);
  const image = await inspectDockerImage(reference);
  if (!image) throw new Error(`Docker image ${reference} is still unavailable after pull`);
  return image;
}

export function dockerName(...parts: Array<string | number>): string {
  return parts.join('-').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 110);
}
