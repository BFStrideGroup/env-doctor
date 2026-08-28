import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const tscEntry = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const compile = spawnSync(process.execPath, [tscEntry, '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collect(full)));
    else if (entry.name.endsWith('.test.cjs')) out.push(full);
  }
  return out;
}

const files = await collect(path.join(root, 'tests'));
const performanceFiles = files.filter((file) => file.includes(`${path.sep}performance${path.sep}`));
const regularFiles = files.filter((file) => !file.includes(`${path.sep}performance${path.sep}`));
const env = {
  ...process.env,
  NODE_PATH: [
    path.join(root, 'tests', 'mocks', 'node_modules'),
    path.join(root, 'node_modules'),
    process.env.NODE_PATH,
  ]
    .filter(Boolean)
    .join(path.delimiter),
};

function run(testFiles, serial = false) {
  const nodeArgs = [];
  if (args.has('--coverage')) nodeArgs.push('--experimental-test-coverage');
  nodeArgs.push('--test');
  if (serial) nodeArgs.push('--test-concurrency=1');
  nodeArgs.push(...testFiles);
  return spawnSync(process.execPath, nodeArgs, { cwd: root, stdio: 'inherit', env }).status ?? 1;
}

if (args.has('--performance')) process.exit(run(performanceFiles, true));

const regularStatus = run(regularFiles);
if (regularStatus !== 0 || args.has('--no-performance')) process.exit(regularStatus);
process.exit(run(performanceFiles, true));
