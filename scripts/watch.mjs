import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const compiler = spawn(process.execPath, [tsc, '-p', 'tsconfig.json', '--watch'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
const bundler = await context({
  entryPoints: {
    extension: path.join(root, 'src', 'extension.ts'),
    cli: path.join(root, 'src', 'cli', 'index.ts'),
  },
  outdir: path.join(root, 'bundle'),
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

await bundler.watch();
console.log('Env Doctor watch mode is ready.');

const stop = async () => {
  compiler.kill();
  await bundler.dispose();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
compiler.once('exit', () => void bundler.dispose());
