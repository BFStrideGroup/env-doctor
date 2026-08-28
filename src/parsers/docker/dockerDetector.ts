import path from 'node:path';
import { EnvReference, LanguageDetector } from '../../core/models';

function isDockerFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return (
    base === 'dockerfile' ||
    base.startsWith('dockerfile.') ||
    /^(docker-)?compose(?:\.[\w-]+)?\.ya?ml$/.test(base)
  );
}

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

export class DockerDetector implements LanguageDetector {
  readonly id = 'docker';
  supports(filePath: string): boolean {
    return isDockerFile(filePath);
  }

  async detectReferences(source: string, filePath: string): Promise<EnvReference[]> {
    const refs: EnvReference[] = [];
    const lines = source.split(/\r?\n/);
    const braced = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-+?=])[^}]*)?\}/g;
    let environmentIndent: number | undefined;

    lines.forEach((line, idx) => {
      braced.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = braced.exec(line))) {
        const operator = match[2] ?? '';
        const optional = operator !== '' && !operator.includes('?');
        refs.push({
          name: match[1],
          file: filePath,
          line: idx + 1,
          column: match.index + 1,
          language: 'docker',
          accessType: optional ? 'compose.interpolation.default' : 'compose.interpolation',
          confidence: 'high',
          optional,
          ignored: /ENV_DOCTOR_IGNORE/.test(line) || /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? ''),
        });
      }

      if (/^\s*environment\s*:\s*(?:#.*)?$/.test(line)) {
        environmentIndent = indentOf(line);
        return;
      }
      if (environmentIndent === undefined || !line.trim() || line.trimStart().startsWith('#'))
        return;
      const indent = indentOf(line);
      if (indent <= environmentIndent) {
        environmentIndent = undefined;
        return;
      }

      // Compose pass-through syntax inside an environment block only:
      //   - FOO
      //   FOO:
      const passThroughList = /^\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:#.*)?$/.exec(line);
      const passThroughMap = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:#.*)?$/.exec(line);
      const pass = passThroughList ?? passThroughMap;
      if (pass)
        refs.push({
          name: pass[1],
          file: filePath,
          line: idx + 1,
          column: line.indexOf(pass[1]) + 1,
          language: 'docker',
          accessType: 'compose.environment.passthrough',
          confidence: 'medium',
        });
    });
    return refs;
  }
}
