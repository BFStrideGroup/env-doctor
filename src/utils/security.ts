import crypto from 'node:crypto';

export const SECRET_NAME_RE =
  /(secret|token|password|passwd|pwd|private[_-]?key|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?key)/i;

export function isSensitiveName(name: string): boolean {
  return SECRET_NAME_RE.test(name);
}

export function maskSecret(value: string): string {
  if (!value) return '<empty>';
  if (value.length <= 4) return '****';
  const visiblePrefix = Math.min(3, Math.max(1, Math.floor(value.length / 8)));
  const visibleSuffix = value.length > 8 ? 2 : 1;
  return `${value.slice(0, visiblePrefix)}${'*'.repeat(Math.min(12, value.length - visiblePrefix - visibleSuffix))}${value.slice(-visibleSuffix)}`;
}

export function fingerprintSecret(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.name;
  return 'Unknown error';
}
