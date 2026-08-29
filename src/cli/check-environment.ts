import { verifyPrepared } from '../core/verify.js';

await verifyPrepared();
process.stdout.write('Pinned remote artifacts, Docker images, checksums, and isolated Maven cache are valid.\n');
