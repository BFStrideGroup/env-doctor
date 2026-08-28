import { rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = path.join(root, 'bundle');

await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: {
    extension: path.join(root, 'src', 'extension.ts'),
    cli: path.join(root, 'src', 'cli', 'index.ts'),
  },
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['typescript', 'vscode'],
  sourcemap: true,
  sourcesContent: false,
  legalComments: 'none',
  logLevel: 'info',
});
