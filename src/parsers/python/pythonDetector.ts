import path from 'node:path';
import { EnvReference, LanguageDetector } from '../../core/models';

const PATTERNS: Array<{ re: RegExp; accessType: string }> = [
  { re: /\bos\.getenv\(\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g, accessType: 'os.getenv' },
  {
    re: /\bos\.environ\s*\[\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g,
    accessType: 'os.environ.element',
  },
  { re: /\bos\.environ\.get\(\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g, accessType: 'os.environ.get' },
];

function ignored(lines: string[], line: number): boolean {
  return (
    /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line] ?? '') ||
    /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line - 1] ?? '')
  );
}

export class PythonDetector implements LanguageDetector {
  readonly id = 'python';
  supports(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.py';
  }

  async detectReferences(source: string, filePath: string): Promise<EnvReference[]> {
    const refs: EnvReference[] = [];
    const lines = source.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const text = lines[lineIndex];
      for (const pattern of PATTERNS) {
        pattern.re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.re.exec(text))) {
          const optional =
            pattern.accessType !== 'os.environ.element' &&
            /^\s*,/.test(text.slice(pattern.re.lastIndex));
          refs.push({
            name: match[2],
            file: filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            language: 'python',
            accessType: pattern.accessType,
            confidence: 'high',
            optional,
            ignored: ignored(lines, lineIndex),
          });
        }
      }
      const dynamic =
        /\bos\.(?:getenv|environ\.get)\(\s*(?!["'])/.exec(text) ||
        /\bos\.environ\s*\[\s*(?!["'])/.exec(text);
      if (dynamic)
        refs.push({
          name: '<dynamic>',
          file: filePath,
          line: lineIndex + 1,
          column: dynamic.index + 1,
          language: 'python',
          accessType: 'os.env.dynamic',
          confidence: 'low',
          dynamic: true,
          ignored: ignored(lines, lineIndex),
        });
    }
    return refs;
  }
}
