const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EnvDoctorEngine } = require('../../dist/core/services');
const { loadIgnoreConfig } = require('../../dist/core/rules');

test('.envdoctorrc supports comments, ignores, required rules and validation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.writeFile(path.join(root, '.env'), 'IGNORED=x\nPORT=nope\n');
  await fs.writeFile(path.join(root, 'src', 'app.ts'), 'process.env.IGNORED;');
  await fs.writeFile(
    path.join(root, '.envdoctorrc'),
    `{
    // project policy
    "ignoredVariables": ["IGNORED"],
    "ignoredFiles": [],
    "ignoredRules": [],
    "rules": {"REQUIRED_KEY":{"required":true},"PORT":{"integer":true}}
  }`,
  );
  const loaded = await loadIgnoreConfig(root);
  assert.equal(loaded.warning, undefined);
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  assert(report.issues.some((i) => i.kind === 'missing' && i.name === 'REQUIRED_KEY'));
  assert(report.issues.some((i) => i.kind === 'validation' && i.name === 'PORT'));
  assert(!report.issues.some((i) => i.name === 'IGNORED'));
});

test('.envdoctorrc ignoredRules suppresses analyzer rule families', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-rules-ignore-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.writeFile(path.join(root, '.env'), 'OLD=x\n');
  await fs.writeFile(
    path.join(root, '.envdoctorrc'),
    JSON.stringify({ ignoredVariables: [], ignoredFiles: [], ignoredRules: ['unused'], rules: {} }),
  );
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  assert(!report.issues.some((i) => i.kind === 'unused'));
});
