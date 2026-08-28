import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(f)));
    else if (/\.(ts|mjs)$/.test(e.name)) out.push(f);
  }
  return out;
}
const violations = [];
for (const file of await files(path.join(root, 'src'))) {
  const text = await readFile(file, 'utf8');
  const rel = path.relative(root, file);
  const patterns = [
    [
      /console\.(?:log|info|warn|error)\([^\n]*(?:\.value|value\b)/,
      'Do not log environment values.',
    ],
    [
      /output\.(?:info|warn|error|appendLine)\([^\n]*(?:\.value|value\b)/,
      'Do not write environment values to the output channel.',
    ],
    [
      /JSON\.stringify\(\s*report\s*\)/,
      'Serialize reports through toSafeReport() before external output.',
    ],
  ];
  for (const [re, msg] of patterns) if (re.test(text)) violations.push(`${rel}: ${msg}`);
}
const safe = await readFile(path.join(root, 'src/core/services/safeReport.ts'), 'utf8');
if (/\bvalue\s*:/.test(safe))
  violations.push('safeReport.ts must never serialize EnvDefinition.value.');
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('Security lint passed: no obvious secret-value logging/serialization paths found.');
