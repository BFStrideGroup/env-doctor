function escapeRegex(ch: string): string {
  return /[\\^$+?.()|{}[\]]/.test(ch) ? `\\${ch}` : ch;
}

export function globToRegExp(patternInput: string): RegExp {
  let pattern = patternInput.replace(/\\/g, '/').replace(/^\.\//, '');
  let source = '^';
  if (pattern.startsWith('**/')) {
    source += '(?:.*/)?';
    pattern = pattern.slice(3);
  }
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        while (pattern[i + 1] === '*') i++;
        source += '.*';
      } else source += '[^/]*';
    } else if (ch === '?') source += '[^/]';
    else source += escapeRegex(ch);
  }
  source += '$';
  return new RegExp(source);
}

export function matchesGlob(valueInput: string, pattern: string): boolean {
  const value = valueInput.replace(/\\/g, '/').replace(/^\.\//, '');
  const regex = globToRegExp(pattern);
  return regex.test(value) || regex.test(`${value}/`);
}

export function matchesAnyGlob(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(value, pattern));
}
