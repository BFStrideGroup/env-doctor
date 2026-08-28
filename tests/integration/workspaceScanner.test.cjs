const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { EnvDoctorEngine } = require('../../dist/core/services');

async function tempProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-test-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'sample', dependencies: { next: '15.0.0' } }),
  );
  await fs.writeFile(path.join(root, '.env'), 'DATABASE_URL=postgres://localhost/db\nOLD=value\n');
  await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=\nMISSING_DOC=\n');
  await fs.writeFile(
    path.join(root, 'src', 'app.ts'),
    'export const db = process.env.DATABASE_URL;\nexport const redis = process.env.REDIS_URL;\n',
  );
  return root;
}

test('engine scans project, detects framework, missing and unused variables', async (t) => {
  const root = await tempProject();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  assert(report.projects[0].frameworks.includes('Next.js'));
  assert(report.issues.some((i) => i.kind === 'missing' && i.name === 'REDIS_URL'));
  assert(report.issues.some((i) => i.kind === 'unused' && i.name === 'OLD'));
  assert(report.environments.some((e) => e.name === '.env.example'));
});

test('incremental cache avoids reparsing unchanged files', async (t) => {
  const root = await tempProject();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const engine = new EnvDoctorEngine();
  const first = await engine.scanWorkspace(root);
  const second = await engine.scanWorkspace(root);
  assert(first.scan.filesParsed > 0);
  assert(second.scan.cacheHits > 0);
  assert(second.scan.filesParsed < first.scan.filesParsed);
});

test('default exclusions ignore node_modules', async (t) => {
  const root = await tempProject();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'node_modules', 'bad'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'node_modules', 'bad', 'index.js'),
    'const token="ghp_abcdefghijklmnopqrstuvwxyz123456";',
  );
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  assert(
    !report.issues.some((i) => i.kind === 'secret' && i.location?.file.includes('node_modules')),
  );
});

test('generic JSON and TOML configuration files participate in local secret scanning', async (t) => {
  const root = await tempProject();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'config.json'), '{"apiKey":"json-private-token-value"}\n');
  await fs.writeFile(
    path.join(root, 'settings.toml'),
    'access_token = "toml-private-token-value"\n',
  );
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  assert(
    report.issues.some((i) => i.kind === 'secret' && i.location?.file.endsWith('config.json')),
  );
  assert(
    report.issues.some((i) => i.kind === 'secret' && i.location?.file.endsWith('settings.toml')),
  );
});

test('runtime-provided and explicitly defaulted references are not reported missing', async (t) => {
  const root = await tempProject();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'src', 'runtime.ts'),
    'process.env.PATH; process.env.OPTIONAL_URL ?? "http://localhost";\n',
  );
  await fs.writeFile(
    path.join(root, 'src', 'run.sh'),
    'echo "$HOME ${OPTIONAL_SHELL:-fallback}"\n',
  );
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  for (const name of ['PATH', 'HOME', 'OPTIONAL_URL', 'OPTIONAL_SHELL']) {
    assert(
      !report.issues.some((i) => i.kind === 'missing' && i.name === name),
      `${name} should not be missing`,
    );
  }
});

test('Git-tracked env files are checked locally and can be disabled', async (t) => {
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('git is unavailable');
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-git-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.writeFile(path.join(root, '.env'), 'DATABASE_PASSWORD=tracked-private-password\n');
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', ['add', '-f', '.env', 'package.json'], { cwd: root }).status, 0);
  const enabled = await new EnvDoctorEngine().scanWorkspace(root);
  assert(enabled.issues.some((i) => i.ruleId === 'secret.trackedEnvFile'));
  const disabled = await new EnvDoctorEngine().scanWorkspace(root, {
    scanGitTrackedEnvFiles: false,
  });
  assert(!disabled.issues.some((i) => i.ruleId === 'secret.trackedEnvFile'));
});
