import path from 'node:path';
import { EnvReference, LanguageDetector } from '../../core/models';

const SHELL_EXT = new Set(['.sh', '.bash', '.zsh', '.ksh']);

function maskNonExpandingText(line: string): string {
  const output = [...line];
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (escaped) {
      output[index] = ' ';
      escaped = false;
      continue;
    }
    if (character === '\\' && !singleQuoted) {
      output[index] = ' ';
      escaped = true;
      continue;
    }
    if (character === "'" && !doubleQuoted) {
      singleQuoted = !singleQuoted;
      output[index] = ' ';
      continue;
    }
    if (character === '"' && !singleQuoted) {
      doubleQuoted = !doubleQuoted;
      output[index] = ' ';
      continue;
    }
    if (singleQuoted) {
      output[index] = ' ';
      continue;
    }
    if (character === '#' && !doubleQuoted && (index === 0 || /\s/.test(line[index - 1]))) {
      output.fill(' ', index);
      break;
    }
  }
  return output.join('');
}

export class ShellDetector implements LanguageDetector {
  readonly id = 'shell';
  supports(filePath: string): boolean {
    return SHELL_EXT.has(path.extname(filePath).toLowerCase());
  }

  async detectReferences(source: string, filePath: string): Promise<EnvReference[]> {
    const refs: EnvReference[] = [];
    const lines = source.split(/\r?\n/);
    const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-+?=])[^}]*)?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
    lines.forEach((line, idx) => {
      const analyzable = maskNonExpandingText(line);
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(analyzable))) {
        const name = match[1] ?? match[3];
        const operator = match[2] ?? '';
        const optional = Boolean(match[1] && operator && !operator.includes('?'));
        refs.push({
          name,
          file: filePath,
          line: idx + 1,
          column: match.index + 1,
          language: 'shell',
          accessType: match[1]
            ? optional
              ? 'shell.braced.default'
              : 'shell.braced'
            : 'shell.variable',
          confidence: 'high',
          optional,
          ignored: /ENV_DOCTOR_IGNORE/.test(line) || /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? ''),
        });
      }
    });
    return refs;
  }
}
