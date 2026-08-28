import path from 'node:path';
import { EnvReference, LanguageDetector } from '../../core/models';

export class PhpDetector implements LanguageDetector {
  readonly id = 'php-laravel';
  supports(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.php';
  }
  async detectReferences(source: string, filePath: string): Promise<EnvReference[]> {
    const refs: EnvReference[] = [];
    const lines = source.split(/\r?\n/);
    const re = /\benv\(\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g;
    lines.forEach((line, idx) => {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(line))) {
        refs.push({
          name: match[2],
          file: filePath,
          line: idx + 1,
          column: match.index + 1,
          language: 'php',
          accessType: 'laravel.env',
          confidence: 'high',
          ignored: /ENV_DOCTOR_IGNORE/.test(line) || /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? ''),
        });
      }
      const dynamic = /\benv\(\s*(?!["'])/.exec(line);
      if (dynamic)
        refs.push({
          name: '<dynamic>',
          file: filePath,
          line: idx + 1,
          column: dynamic.index + 1,
          language: 'php',
          accessType: 'laravel.env.dynamic',
          confidence: 'low',
          dynamic: true,
        });
    });
    return refs;
  }
}
