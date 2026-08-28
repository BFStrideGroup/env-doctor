const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EnvDoctorEngine } = require('../../dist/core/services');

test(
  'large synthetic repository remains bounded and benefits from cache',
  { timeout: 60000 },
  async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-perf-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'package.json'), '{}');
    await fs.writeFile(path.join(root, '.env'), 'SHARED=x\n');
    const writes = [];
    for (let i = 0; i < 1200; i++)
      writes.push(
        fs.writeFile(
          path.join(root, 'src', `f${i}.ts`),
          `export const v${i}=process.env.SHARED;\n`,
        ),
      );
    await Promise.all(writes);
    const engine = new EnvDoctorEngine();
    const first = await engine.scanWorkspace(root, { maxFiles: 5000 });
    const second = await engine.scanWorkspace(root, { maxFiles: 5000 });
    assert(first.scan.filesConsidered >= 1200);
    assert(second.scan.cacheHits >= 1200);
    assert(second.scan.filesParsed < first.scan.filesParsed);
    assert(first.scan.durationMs < 20000);
  },
);
