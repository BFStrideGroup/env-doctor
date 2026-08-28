import crypto from 'node:crypto';

export function stableId(...parts: Array<string | number | undefined>): string {
  return crypto
    .createHash('sha1')
    .update(parts.map((p) => p ?? '').join('|'))
    .digest('hex')
    .slice(0, 16);
}
