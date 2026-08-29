import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from '../../apollo-evals.config.js';
import type { AgentProfile } from './types.js';

export async function loadAgentProfile(id: string): Promise<AgentProfile> {
  const root = path.join(PROJECT_ROOT, 'agent-profiles');
  for (const group of await readdir(root, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    const candidate = path.join(root, group.name, `${id}.ts`);
    const files = await readdir(path.dirname(candidate)).catch((): string[] => []);
    if (!files.includes(path.basename(candidate))) continue;
    const imported = await import(`${pathToFileURL(candidate).href}?t=${Date.now()}`) as {
      default: AgentProfile;
    };
    if (imported.default.id !== id) {
      throw new Error(`${path.relative(PROJECT_ROOT, candidate)}: profile id must be ${id}`);
    }
    return imported.default;
  }
  throw new Error(`Unknown agent profile ${id}. Add agent-profiles/<adapter>/${id}.ts.`);
}
