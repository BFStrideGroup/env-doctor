import path from 'node:path';
import { EnvFile } from '../models';
import { isSensitiveName } from '../../utils/security';

export interface ExampleGenerationOptions {
  preserveNonSecretDefaults: boolean;
  placeholders?: Record<string, string>;
  additionalNames?: string[];
}

const PRESERVABLE_DEFAULT =
  /^(?:true|false|\d{1,6}|development|production|test|localhost|127\.0\.0\.1)$/i;
const SAFE_SECRET_PLACEHOLDER =
  /^(?:$|<[^>]+>|\$\{[^}]+\}|your[-_ ]|change[-_ ]?me|example|sample)/i;

export function generateEnvExample(envFiles: EnvFile[], options: ExampleGenerationOptions): string {
  const selected = envFiles.filter(
    (f) => !['.env.example', '.env.sample'].includes(path.basename(f.path)),
  );
  const definitions = new Map<string, string>();
  for (const file of selected) {
    for (const def of file.definitions)
      if (!definitions.has(def.name)) definitions.set(def.name, def.value);
  }
  for (const name of options.additionalNames ?? [])
    if (!definitions.has(name)) definitions.set(name, '');
  const lines = [...definitions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => {
      const placeholder = options.placeholders?.[name];
      if (
        placeholder !== undefined &&
        (!isSensitiveName(name) || SAFE_SECRET_PLACEHOLDER.test(placeholder.trim()))
      ) {
        return `${name}=${placeholder}`;
      }
      if (
        options.preserveNonSecretDefaults &&
        !isSensitiveName(name) &&
        PRESERVABLE_DEFAULT.test(value.trim())
      )
        return `${name}=${value.trim()}`;
      return `${name}=`;
    });
  return `${lines.join('\n')}\n`;
}
