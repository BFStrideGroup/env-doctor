const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.resolve(__dirname, '../../dist/cli/index.js');

test('CLI exposes help and rejects unknown arguments', () => {
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /env-doctor check/);

  const invalid = spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Unknown argument/);
});

test('CLI JSON output is machine-readable and sanitized', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'env-doctor-cli-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  await fsp.mkdir(path.join(root, 'src'));
  await fsp.writeFile(path.join(root, 'package.json'), '{}');
  const raw = 'cli-private-password-value';
  await fsp.writeFile(path.join(root, '.env'), `DATABASE_PASSWORD=${raw}\n`);
  await fsp.writeFile(path.join(root, 'src', 'app.ts'), 'process.env.MISSING_FROM_CLI;\n');

  const result = spawnSync(
    process.execPath,
    [cli, 'check', '--format', 'json', '--root', root, '--no-git'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert(!result.stdout.includes(raw));
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.summary.missing, 1);
  assert(parsed.issues.some((issue) => issue.name === 'MISSING_FROM_CLI'));
  assert(!fs.existsSync(path.join(root, '.env.example')));
});
