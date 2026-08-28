const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EnvDoctorEngine, toSafeReport } = require('../../dist/core/services');

test('safe report never serializes dotenv values or detected literal secrets', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-sec-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const envSecret = 'super-private-password-9384';
  const sourceSecret = 'sk_live_abcdefghijklmnopqrstuvwxyz';
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.writeFile(path.join(root, '.env'), `PASSWORD=${envSecret}\n`);
  await fs.writeFile(
    path.join(root, 'src', 'a.ts'),
    `process.env.PASSWORD; const x="${sourceSecret}";`,
  );
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  const serialized = JSON.stringify(toSafeReport(report));
  const inMemoryReport = JSON.stringify(report);
  assert(!serialized.includes(envSecret));
  assert(!serialized.includes(sourceSecret));
  assert(!inMemoryReport.includes(envSecret));
  assert(!inMemoryReport.includes(sourceSecret));
  assert(
    !report.issues.some((i) => i.message.includes(envSecret) || i.message.includes(sourceSecret)),
  );
  assert(report.envFiles.flatMap((f) => f.definitions).every((d) => d.value === ''));
  assert(
    report.projects
      .flatMap((p) => p.envFiles)
      .flatMap((f) => f.definitions)
      .every((d) => d.value === ''),
  );
});
