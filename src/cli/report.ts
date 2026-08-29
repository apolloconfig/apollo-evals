import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT } from '../../apollo-evals.config.js';
import { aggregateRun, summaryMarkdown } from '../core/aggregate.js';
import { parseArgs, requireArg } from '../core/args.js';
import { writeJson } from '../core/fs.js';

const runId = requireArg(parseArgs(), 'run-id');
const runDir = path.join(PROJECT_ROOT, 'results', runId);
const summary = await aggregateRun(runDir);
await writeJson(path.join(runDir, 'summary.json'), { runId, ...summary });
await writeFile(path.join(runDir, 'summary.md'), summaryMarkdown(summary, runId));
process.stdout.write(`${path.join(runDir, 'summary.md')}\n`);
