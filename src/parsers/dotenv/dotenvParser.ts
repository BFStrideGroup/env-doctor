import path from 'node:path';
import { EnvFile, EnvFileParser, EnvDefinition, ParseError } from '../../core/models';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function hasIgnoreDirective(lines: string[], index: number): boolean {
  const current = lines[index] ?? '';
  const previous = index > 0 ? lines[index - 1] : '';
  return /ENV_DOCTOR_IGNORE(?:\s|$)/.test(current) || /ENV_DOCTOR_IGNORE(?:\s|$)/.test(previous);
}

function stripInlineComment(raw: string): string {
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && double) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !double) single = !single;
    else if (ch === '"' && !single) double = !double;
    else if (ch === '#' && !single && !double && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i).trimEnd();
    }
  }
  return raw.trimEnd();
}

function decodeDoubleQuoted(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function findClosingQuote(value: string, quote: string): number {
  let escaped = false;
  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    if (quote === '"' && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === quote && !escaped) return i;
    escaped = false;
  }
  return -1;
}

function isExampleFile(filePath: string): boolean {
  return /(?:^|\.)(?:example|sample|template)$/i.test(path.basename(filePath));
}

export class DotenvParser implements EnvFileParser {
  supports(filePath: string): boolean {
    const name = path.basename(filePath);
    return (
      name === '.env' ||
      name.startsWith('.env.') ||
      name === '.env.example' ||
      name === '.env.sample'
    );
  }

  parse(content: string, filePath: string): EnvFile {
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
    const definitions: EnvDefinition[] = [];
    const errors: ParseError[] = [];
    const seenNames = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const startIndex = i;
      const original = lines[i];
      let line = original.trim();
      if (!line || line.startsWith('#')) continue;

      let exported = false;
      if (/^export\s+/.test(line)) {
        exported = true;
        line = line.replace(/^export\s+/, '');
      }

      const eq = line.indexOf('=');
      if (eq < 1) {
        errors.push({
          file: filePath,
          line: i + 1,
          column: 1,
          message: 'Expected KEY=value syntax.',
          code: 'dotenv.syntax',
        });
        continue;
      }

      const key = line.slice(0, eq).trim();
      if (!KEY_RE.test(key)) {
        errors.push({
          file: filePath,
          line: i + 1,
          column: 1,
          message: `Invalid environment variable name: ${key}`,
          code: 'dotenv.invalidKey',
        });
        continue;
      }

      let rawValue = line.slice(eq + 1).trimStart();
      let quoted = false;
      let value: string;

      if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
        quoted = true;
        const quote = rawValue[0];
        let combined = rawValue;
        let closing = findClosingQuote(combined, quote);
        while (closing < 0 && i + 1 < lines.length) {
          i += 1;
          combined += `\n${lines[i]}`;
          closing = findClosingQuote(combined, quote);
        }
        if (closing < 0) {
          errors.push({
            file: filePath,
            line: startIndex + 1,
            column: eq + 2,
            message: `Unterminated ${quote === '"' ? 'double' : 'single'}-quoted value.`,
            code: 'dotenv.unterminatedQuote',
          });
          continue;
        }
        const inner = combined.slice(1, closing);
        value = quote === '"' ? decodeDoubleQuoted(inner) : inner;
        const trailing = combined.slice(closing + 1).trim();
        if (trailing && !trailing.startsWith('#')) {
          errors.push({
            file: filePath,
            line: startIndex + 1,
            column: eq + closing + 3,
            message: 'Unexpected content after quoted value.',
            code: 'dotenv.trailingContent',
          });
        }
      } else {
        rawValue = stripInlineComment(rawValue).trim();
        value = rawValue;
      }

      if (seenNames.has(key)) {
        errors.push({
          file: filePath,
          line: startIndex + 1,
          column: Math.max(1, original.indexOf(key) + 1),
          message: `${key} is defined more than once in this file.`,
          code: 'dotenv.duplicateKey',
        });
      }
      seenNames.add(key);
      definitions.push({
        name: key,
        value,
        quoted,
        exported,
        file: filePath,
        line: startIndex + 1,
        column: Math.max(1, original.indexOf(key) + 1),
        isExample: isExampleFile(filePath),
        ignored: hasIgnoreDirective(lines, startIndex),
      });
    }

    return {
      path: filePath,
      name: path.basename(filePath),
      packageRoot: path.dirname(filePath),
      definitions,
      errors,
    };
  }
}
