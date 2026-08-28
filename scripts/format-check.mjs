import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const write = process.argv.includes('--write');
const targets = ['src', 'tests', 'scripts'];
const extensions = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.md']);
async function collect(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await collect(f)));
    else if (extensions.has(path.extname(e.name))) out.push(f);
  }
  return out;
}
let changed = 0;
const bad = [];
for (const dir of targets) {
  for (const file of await collect(path.join(root, dir))) {
    const text = await readFile(file, 'utf8');
    const fixed = text
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n*$/, '\n');
    if (fixed !== text) {
      if (write) {
        await writeFile(file, fixed);
        changed++;
      } else bad.push(path.relative(root, file));
    }
  }
}
for (const name of ['package.json', 'tsconfig.json']) {
  const file = path.join(root, name);
  const text = await readFile(file, 'utf8');
  if (!text.endsWith('\n')) {
    if (write) {
      await writeFile(file, `${text}\n`);
      changed++;
    } else bad.push(name);
  }
}
if (bad.length) {
  console.error(`Formatting check failed for:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log(write ? `Formatting normalized in ${changed} files.` : 'Formatting check passed.');
