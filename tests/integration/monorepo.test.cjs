const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EnvDoctorEngine } = require('../../dist/core/services');

test('monorepo analysis keeps package env files scoped to their nearest package', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-mono-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
  );
  for (const name of ['web', 'api']) {
    const dir = path.join(root, 'apps', name);
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: `@acme/${name}` }));
  }
  await fs.writeFile(path.join(root, 'apps', 'web', '.env'), 'WEB_KEY=x\n');
  await fs.writeFile(path.join(root, 'apps', 'api', '.env'), 'API_KEY=x\n');
  await fs.writeFile(
    path.join(root, 'apps', 'web', 'src', 'app.ts'),
    'process.env.WEB_KEY; process.env.API_KEY;',
  );
  await fs.writeFile(path.join(root, 'apps', 'api', 'src', 'app.ts'), 'process.env.API_KEY;');
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  const web = report.projects.find((p) => p.name === '@acme/web');
  const api = report.projects.find((p) => p.name === '@acme/api');
  assert(web && api);
  assert.equal(web.envFiles.length, 1);
  assert.equal(api.envFiles.length, 1);
  assert(
    report.issues.some(
      (i) => i.kind === 'missing' && i.name === 'API_KEY' && i.packageRoot === web.packageRoot,
    ),
  );
  assert(
    !report.issues.some(
      (i) => i.kind === 'missing' && i.name === 'API_KEY' && i.packageRoot === api.packageRoot,
    ),
  );
});

test('package-level .envdoctorrc suppressions apply only to that package', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-mono-ignore-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'root' }));
  for (const name of ['web', 'api']) {
    const dir = path.join(root, 'apps', name);
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name }));
    await fs.writeFile(path.join(dir, 'src', 'app.ts'), 'process.env.EXTERNAL_ONLY;');
  }
  await fs.writeFile(
    path.join(root, 'apps', 'web', '.envdoctorrc'),
    JSON.stringify({
      ignoredVariables: ['EXTERNAL_ONLY'],
      ignoredFiles: [],
      ignoredRules: [],
      rules: {},
    }),
  );
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  const web = report.projects.find((p) => p.name === 'web');
  const api = report.projects.find((p) => p.name === 'api');
  assert(web && api);
  assert(
    !report.issues.some(
      (i) =>
        i.kind === 'missing' && i.name === 'EXTERNAL_ONLY' && i.packageRoot === web.packageRoot,
    ),
  );
  assert(
    report.issues.some(
      (i) =>
        i.kind === 'missing' && i.name === 'EXTERNAL_ONLY' && i.packageRoot === api.packageRoot,
    ),
  );
});

test('package-level custom env filenames are discovered and scoped to that package', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'env-doctor-mono-custom-env-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
  );
  const app = path.join(root, 'apps', 'web');
  await fs.mkdir(path.join(app, 'src'), { recursive: true });
  await fs.mkdir(path.join(app, 'config'), { recursive: true });
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'web' }));
  await fs.writeFile(
    path.join(app, '.envdoctorrc'),
    JSON.stringify({
      envFiles: ['config/runtime.vars'],
      ignoredVariables: [],
      ignoredFiles: [],
      ignoredRules: [],
      rules: {},
    }),
  );
  await fs.writeFile(path.join(app, 'config', 'runtime.vars'), 'CUSTOM_PACKAGE_KEY=defined\n');
  await fs.writeFile(path.join(app, 'src', 'app.ts'), 'process.env.CUSTOM_PACKAGE_KEY;\n');
  const report = await new EnvDoctorEngine().scanWorkspace(root);
  const web = report.projects.find((p) => p.name === 'web');
  assert(web);
  assert(web.envFiles.some((f) => f.path.endsWith('/config/runtime.vars')));
  assert(
    !report.issues.some(
      (i) =>
        i.kind === 'missing' &&
        i.name === 'CUSTOM_PACKAGE_KEY' &&
        i.packageRoot === web.packageRoot,
    ),
  );
});
