const RUNTIME_PROVIDED = new Set([
  'CI',
  'GITHUB_ACTIONS',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'HOSTNAME',
  'LANG',
  'LC_ALL',
  'LOGNAME',
  'NODE_ENV',
  'OLDPWD',
  'PATH',
  'PATHEXT',
  'PWD',
  'SHELL',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'USER',
  'USERDOMAIN',
  'USERNAME',
  'WINDIR',
]);

const UNUSED_RUNTIME_NAMES = new Set(['DEBUG', 'HOST', 'PORT']);

export function isRuntimeProvidedVariable(name: string): boolean {
  return RUNTIME_PROVIDED.has(name) || name.startsWith('GITHUB_') || name.startsWith('npm_');
}

export function isConventionallyRuntimeConsumed(name: string): boolean {
  return isRuntimeProvidedVariable(name) || UNUSED_RUNTIME_NAMES.has(name);
}
