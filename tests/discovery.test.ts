import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../apollo-evals.config.js';
import { discoverScenarios, renderPrompt } from '../src/core/discovery.js';
import { scenarioMetadataSchema } from '../src/core/schema.js';

describe('scenario catalog protocol', () => {
  it('keeps harness metadata separate from the agent prompt', async () => {
    const scenarios = await discoverScenarios(PROJECT_ROOT);
    expect(scenarios).toHaveLength(6);
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      'cli-config-publish',
      'cli-config-sync-release',
      'cli-namespace-create-publish',
      'cli-release-rollback',
      'java-client-change-listener',
      'java-client-typed-read',
    ]);
    expect(scenarios.every((scenario) => !scenario.prompt.startsWith('---'))).toBe(true);
  });

  it('validates scenario manifests and renders prompt variables', () => {
    const metadata = scenarioMetadataSchema.parse({
      id: 'cli-config-publish',
      campaigns: ['smoke', 'benchmark'],
      track: 'apollo-cli',
      products: ['apollo-cli'],
      timeoutSec: 30,
    });
    expect(metadata.track).toBe('apollo-cli');
    expect(renderPrompt('Do {{thing}}', { thing: 'work' })).toBe('Do work');
    expect(() => scenarioMetadataSchema.parse({ id: 'bad', campaigns: [] })).toThrow();
  });
});
