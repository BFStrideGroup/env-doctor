import fs from 'node:fs/promises';
import path from 'node:path';

async function readJson(file: string): Promise<Record<string, any> | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, any>;
  } catch {
    return undefined;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function detectFrameworks(packageRoot: string): Promise<string[]> {
  const result = new Set<string>();
  const pkg = await readJson(path.join(packageRoot, 'package.json'));
  if (pkg) {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } as Record<
      string,
      string
    >;
    if (deps.next) result.add('Next.js');
    if (deps.vite) result.add('Vite');
    if (deps.react) result.add('React');
    if (deps['@nestjs/core']) result.add('NestJS');
    if (deps.express) result.add('Express');
    if (deps.nuxt) result.add('Nuxt');
    if (!result.has('Next.js') && !result.has('Nuxt')) result.add('Node.js');
  }
  const pyFiles = ['requirements.txt', 'pyproject.toml'];
  for (const name of pyFiles) {
    try {
      const text = (await fs.readFile(path.join(packageRoot, name), 'utf8')).toLowerCase();
      if (/\bdjango\b/.test(text)) result.add('Django');
      if (/\bflask\b/.test(text)) result.add('Flask');
      if (text) result.add('Python');
    } catch {
      /* absent */
    }
  }
  const composer = await readJson(path.join(packageRoot, 'composer.json'));
  if (composer) {
    const deps = { ...(composer.require ?? {}), ...(composer['require-dev'] ?? {}) };
    if (deps['laravel/framework']) result.add('Laravel');
    else result.add('PHP');
  }
  const composeCandidates = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ];
  if (
    (await Promise.all(composeCandidates.map((name) => exists(path.join(packageRoot, name))))).some(
      Boolean,
    )
  ) {
    result.add('Docker Compose');
  }
  if (await exists(path.join(packageRoot, 'Dockerfile'))) result.add('Docker');
  return [...result];
}
