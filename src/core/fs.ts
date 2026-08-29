import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lockSchema, type VersionsLock } from './schema.js';

export async function ensureDir(dir: string): Promise<void> { await mkdir(dir, { recursive: true }); }
export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
export async function readJson<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, 'utf8')) as T; }
export async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', resolve).on('error', reject));
  return hash.digest('hex');
}
export async function loadLock(root: string): Promise<VersionsLock> {
  return lockSchema.parse(await readJson(path.join(root, 'versions.lock.json')));
}
