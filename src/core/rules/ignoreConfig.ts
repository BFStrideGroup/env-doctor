import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { IgnoreConfig, Rule } from '../models';

function emptyConfig(): IgnoreConfig {
  return { ignoredVariables: [], ignoredFiles: [], ignoredRules: [], rules: {} };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function rules(value: unknown): Record<string, Rule> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, Rule> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    out[name] = {
      required: typeof r.required === 'boolean' ? r.required : undefined,
      optional: typeof r.optional === 'boolean' ? r.optional : undefined,
      secret: typeof r.secret === 'boolean' ? r.secret : undefined,
      url: typeof r.url === 'boolean' ? r.url : undefined,
      integer: typeof r.integer === 'boolean' ? r.integer : undefined,
      boolean: typeof r.boolean === 'boolean' ? r.boolean : undefined,
      regex: typeof r.regex === 'string' ? r.regex : undefined,
      allowedValues: strings(r.allowedValues),
    };
  }
  return out;
}

export async function loadIgnoreConfig(
  root: string,
): Promise<{ config: IgnoreConfig; warning?: string }> {
  const file = path.join(root, '.envdoctorrc');
  try {
    const content = await fs.readFile(file, 'utf8');
    const parsed = ts.parseConfigFileTextToJson(file, content);
    if (parsed.error || !parsed.config || typeof parsed.config !== 'object') {
      return {
        config: emptyConfig(),
        warning: '.envdoctorrc could not be parsed. The file contents were not logged.',
      };
    }
    const raw = parsed.config as Record<string, unknown>;
    return {
      config: {
        ignoredVariables: strings(raw.ignoredVariables),
        ignoredFiles: strings(raw.ignoredFiles),
        ignoredRules: strings(raw.ignoredRules),
        rules: rules(raw.rules),
        compareEnvFiles: strings(raw.compareEnvFiles),
        envFiles: strings(raw.envFiles),
      },
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { config: emptyConfig() };
    return {
      config: emptyConfig(),
      warning: '.envdoctorrc could not be read. Check file permissions.',
    };
  }
}

export function serializeIgnoreConfig(config: IgnoreConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
