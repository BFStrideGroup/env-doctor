import path from 'node:path';

export function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

export function relativeDisplay(root: string, file: string): string {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  return rel || path.basename(file);
}

export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function nearestRoot(file: string, roots: string[], fallback: string): string {
  const candidates = roots.filter((root) => isInside(root, file));
  if (!candidates.length) return fallback;
  return candidates.sort((a, b) => b.length - a.length)[0];
}
