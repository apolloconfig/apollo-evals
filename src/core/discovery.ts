import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scenarioMetadataSchema } from './schema.js';
import type { DiscoveredScenario, ScenarioLifecycle } from './types.js';

const TRACK_BY_GROUP = {
  cli: 'apollo-cli',
  'java-client': 'apollo-java-client',
} as const;

export async function discoverScenarios(root: string): Promise<DiscoveredScenario[]> {
  const catalogRoot = path.join(root, 'scenarios');
  const scenarios: DiscoveredScenario[] = [];

  for (const group of await readdir(catalogRoot, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    const expectedTrack = TRACK_BY_GROUP[group.name as keyof typeof TRACK_BY_GROUP];
    if (!expectedTrack) throw new Error(`Unknown scenario group: scenarios/${group.name}`);

    const groupDir = path.join(catalogRoot, group.name);
    for (const entry of await readdir(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(groupDir, entry.name);
      const metadata = scenarioMetadataSchema.parse(
        JSON.parse(await readFile(path.join(dir, 'scenario.json'), 'utf8')),
      );
      const expectedId = `${group.name}-${entry.name}`;
      if (metadata.id !== expectedId) {
        throw new Error(`${path.relative(root, dir)}: scenario id must be ${expectedId}`);
      }
      if (metadata.track !== expectedTrack) {
        throw new Error(`${metadata.id}: track must be ${expectedTrack}`);
      }

      const prompt = (await readFile(path.join(dir, 'PROMPT.md'), 'utf8')).trim();
      const imported = await import(
        `${pathToFileURL(path.join(dir, 'scenario.ts')).href}?t=${Date.now()}`
      ) as { default: ScenarioLifecycle };
      if (!imported.default?.setup || !imported.default?.verify) {
        throw new Error(`${metadata.id}: scenario.ts must export setup and verify`);
      }
      scenarios.push({ id: metadata.id, dir, metadata, prompt, lifecycle: imported.default });
    }
  }

  return scenarios.sort((left, right) => left.id.localeCompare(right.id));
}

export function renderPrompt(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{([A-Za-z0-9_.-]+)\}\}/g, (_all, key: string) => {
    const value = key.split('.').reduce<unknown>((current, part) => (
      current && typeof current === 'object'
        ? (current as Record<string, unknown>)[part]
        : undefined
    ), variables);
    if (value === undefined) throw new Error(`Missing prompt variable: ${key}`);
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}
