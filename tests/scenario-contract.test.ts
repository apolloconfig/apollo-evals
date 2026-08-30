import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../apollo-evals.config.js';
import { discoverScenarios } from '../src/core/discovery.js';
import { usedRawHttp } from '../src/testing/scenario-helpers.js';

const README_HEADINGS = [
  '评测目标',
  '用户场景',
  '初始状态与可见信息',
  '判分标准',
  '刻意隐藏的实现细节',
  '非目标与边界',
  '验证方式',
];

describe('scenario authoring contract', () => {
  it('keeps the scenario catalog and agent profile layout stable', async () => {
    expect(existsSync(path.join(PROJECT_ROOT, 'evals'))).toBe(false);
    expect(existsSync(path.join(PROJECT_ROOT, 'experiments'))).toBe(false);
    expect(existsSync(path.join(PROJECT_ROOT, 'scenarios'))).toBe(true);
    expect(existsSync(path.join(PROJECT_ROOT, 'agent-profiles'))).toBe(true);
    expect(existsSync(path.join(PROJECT_ROOT, 'profiles'))).toBe(false);

    for (const scenario of await discoverScenarios(PROJECT_ROOT)) {
      expect(existsSync(path.join(scenario.dir, 'PROMPT.md'))).toBe(true);
      expect(existsSync(path.join(scenario.dir, 'brief.md'))).toBe(false);
      expect(existsSync(path.join(scenario.dir, 'scenario.json'))).toBe(true);
      expect(existsSync(path.join(scenario.dir, 'scenario.ts'))).toBe(true);
      expect(existsSync(path.join(scenario.dir, 'EVAL.ts'))).toBe(false);
      expect(scenario.lifecycle.setup).toBeTypeOf('function');
      expect(scenario.lifecycle.verify).toBeTypeOf('function');
      expect(scenario.lifecycle.runOracle).toBeTypeOf('function');
      expect(scenario.lifecycle).not.toHaveProperty('arrange');
      expect(scenario.lifecycle).not.toHaveProperty('judge');
      expect(scenario.lifecycle).not.toHaveProperty('reference');
    }
  });

  it('keeps a maintainer README beside every scenario', async () => {
    for (const scenario of await discoverScenarios(PROJECT_ROOT)) {
      const readme = await readFile(path.join(scenario.dir, 'README.md'), 'utf8');
      expect(readme).toContain(`# ${scenario.id}`);
      for (const heading of README_HEADINGS) {
        expect(readme).toContain(`\n## ${heading}\n`);
      }
    }
  });

  it('keeps CLI solution recipes out of agent briefs', async () => {
    const forbidden = [
      /\bconfig\s+(?:set|diff|apply|delete)\b/i,
      /\bnamespace\s+create\b/i,
      /\brelease\s+(?:create|list|rollback)\b/i,
      /\bapollo\s+api\b/i,
    ];
    const scenarios = (await discoverScenarios(PROJECT_ROOT))
      .filter((scenario) => scenario.metadata.track === 'apollo-cli');
    for (const scenario of scenarios) {
      expect(scenario.prompt).toContain('Apollo CLI');
      for (const pattern of forbidden) expect(scenario.prompt).not.toMatch(pattern);
    }
  });

  it('keeps Java API solution names out of agent-visible starters and briefs', async () => {
    const forbidden = [
      /\bConfigService\b/,
      /\bConfigChangeListener\b/,
      /\baddChangeListener\b/,
      /\bgetProperty\b/,
      /\bgetIntProperty\b/,
      /\bgetBooleanProperty\b/,
    ];
    const scenarios = (await discoverScenarios(PROJECT_ROOT))
      .filter((scenario) => scenario.metadata.track === 'apollo-java-client');
    for (const scenario of scenarios) {
      const javaDir = path.join(scenario.dir, 'workspace', 'src', 'main', 'java', 'scenario');
      const javaFiles = (await readdir(javaDir)).filter((name) => name.endsWith('.java'));
      const starters = await Promise.all(
        javaFiles.map((name) => readFile(path.join(javaDir, name), 'utf8')),
      );
      const agentVisible = [scenario.prompt, ...starters].join('\n');
      expect(scenario.prompt).toContain('Apollo Java Client');
      for (const pattern of forbidden) expect(agentVisible).not.toMatch(pattern);
    }
  });
});

describe('raw HTTP command detection', () => {
  it('detects direct HTTP clients and the Apollo raw API escape hatch', () => {
    expect(usedRawHttp(['curl -X PUT http://apollo.example/config'])).toBe(true);
    expect(usedRawHttp(['wget http://apollo.example/config'])).toBe(true);
    expect(usedRawHttp(['http POST http://apollo.example/config'])).toBe(true);
    expect(usedRawHttp(['apollo --server http://apollo.example api get /openapi/v1/apps'])).toBe(true);
    expect(usedRawHttp(['/tmp/tools/apollo --server http://apollo.example api delete /openapi/v1/apps/demo'])).toBe(true);
    expect(usedRawHttp(['/bin/zsh -lc "curl -sS http://apollo.example/config"'])).toBe(true);
    expect(usedRawHttp(["/bin/zsh -lc 'apollo --server http://apollo.example api get /openapi/v1/apps'"])).toBe(true);
    expect(usedRawHttp(['/bin/zsh -lc "pwd && wget http://apollo.example/config"'])).toBe(true);
  });

  it('allows Apollo resource commands and unrelated tools', () => {
    expect(usedRawHttp(['apollo config set --env LOCAL --app demo key value'])).toBe(false);
    expect(usedRawHttp(['apollo release rollback --env LOCAL 42'])).toBe(false);
    expect(usedRawHttp(['mvn -o -q compile'])).toBe(false);
    expect(usedRawHttp(['/bin/zsh -lc "rg -n \'curl|apollo api\' README.md"'])).toBe(false);
  });
});
