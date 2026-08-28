import path from 'node:path';
import { EnvDefinition, SecretFinding } from '../models';
import { isSensitiveName, maskSecret } from '../../utils/security';

interface ProviderPattern {
  id: string;
  regex: RegExp;
  confidence: 'high' | 'medium';
  variableName?: string;
}

const PROVIDER_PATTERNS: ProviderPattern[] = [
  {
    id: 'secret.stripe.live',
    regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g,
    confidence: 'high',
    variableName: 'STRIPE_SECRET_KEY',
  },
  {
    id: 'secret.github.token',
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    confidence: 'high',
    variableName: 'GITHUB_TOKEN',
  },
  {
    id: 'secret.aws.accessKey',
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    confidence: 'high',
    variableName: 'AWS_ACCESS_KEY_ID',
  },
  {
    id: 'secret.privateKey',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    confidence: 'high',
    variableName: 'PRIVATE_KEY',
  },
];

const ASSIGNMENT =
  /(?:^|[,{;\s])([A-Za-z_][A-Za-z0-9_.-]{2,})\s*(?:=|:)\s*(["'`])([^\n"'`]{6,})\2/g;
const JSON_ASSIGNMENT = /["']([A-Za-z_][A-Za-z0-9_.-]{2,})["']\s*:\s*(["'])([^\n"']{6,})\2/g;
const YAML_ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_.-]{2,})\s*:\s*([^#\s][^#\n]{5,})\s*(?:#.*)?$/g;
const SAFE_PLACEHOLDER =
  /^(?:<.*>|your[-_ ]|change[-_ ]?me|example|sample|dummy|test|xxx+|\*+|\$\{)/i;
const URL_WITH_CREDENTIALS = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]+@/i;
const TEXT_EXTENSIONS = new Set([
  '.bash',
  '.cfg',
  '.conf',
  '.config',
  '.cs',
  '.cts',
  '.go',
  '.gradle',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.ksh',
  '.mjs',
  '.mts',
  '.php',
  '.properties',
  '.ps1',
  '.py',
  '.rb',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
]);
const TEXT_FILE_NAMES = new Set(['dockerfile', 'makefile', 'procfile']);

function sourceKindSupported(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (base.startsWith('.env')) return false;
  if (/\.(?:lock|min\.js|min\.css)$/.test(base)) return false;
  return TEXT_EXTENSIONS.has(ext) || TEXT_FILE_NAMES.has(base) || base.startsWith('dockerfile.');
}

function lineCol(source: string, index: number): { line: number; column: number } {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function ignoredAt(source: string, index: number): boolean {
  const { line } = lineCol(source, index);
  const lines = source.split(/\r?\n/);
  return (
    /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line - 1] ?? '') ||
    /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line - 2] ?? '')
  );
}

export function detectSecrets(source: string, filePath: string): SecretFinding[] {
  if (!sourceKindSupported(filePath)) return [];
  const findings: SecretFinding[] = [];

  for (const provider of PROVIDER_PATTERNS) {
    provider.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = provider.regex.exec(source))) {
      if (ignoredAt(source, match.index)) continue;
      const loc = lineCol(source, match.index);
      findings.push({
        file: filePath,
        ...loc,
        ruleId: provider.id,
        variableName: provider.variableName,
        confidence: provider.confidence,
        maskedPreview: maskSecret(match[0]),
        message:
          'Potential credential detected in source. Move the value to an environment variable or secret store.',
      });
    }
  }

  ASSIGNMENT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASSIGNMENT.exec(source))) {
    const name = match[1];
    const value = match[3].trim();
    if (
      !isSensitiveName(name) ||
      SAFE_PLACEHOLDER.test(value) ||
      value.length < 8 ||
      ignoredAt(source, match.index)
    )
      continue;
    const loc = lineCol(source, match.index + match[0].indexOf(name));
    findings.push({
      file: filePath,
      ...loc,
      ruleId: 'secret.suspiciousAssignment',
      variableName: name.toUpperCase().replace(/[.-]/g, '_'),
      confidence: value.length >= 16 ? 'medium' : 'low',
      maskedPreview: maskSecret(value),
      message:
        'A value assigned to a credential-like name may be a secret. Verify it and move real credentials out of source.',
    });
  }

  JSON_ASSIGNMENT.lastIndex = 0;
  while ((match = JSON_ASSIGNMENT.exec(source))) {
    const name = match[1];
    const value = match[3].trim();
    if (
      !isSensitiveName(name) ||
      SAFE_PLACEHOLDER.test(value) ||
      value.length < 8 ||
      ignoredAt(source, match.index)
    )
      continue;
    const loc = lineCol(source, match.index + match[0].indexOf(name));
    findings.push({
      file: filePath,
      ...loc,
      ruleId: 'secret.suspiciousJson',
      variableName: name.toUpperCase().replace(/[.-]/g, '_'),
      confidence: value.length >= 16 ? 'medium' : 'low',
      maskedPreview: maskSecret(value),
      message:
        'A credential-like JSON property may contain a secret. Verify it and use an environment variable or secret store.',
    });
  }

  if (['.yaml', '.yml'].includes(path.extname(filePath).toLowerCase())) {
    const lines = source.split(/\r?\n/);
    lines.forEach((line, idx) => {
      YAML_ASSIGNMENT.lastIndex = 0;
      const yaml = YAML_ASSIGNMENT.exec(line);
      if (!yaml || !isSensitiveName(yaml[1])) return;
      const value = yaml[2].trim().replace(/^['"]|['"]$/g, '');
      if (
        SAFE_PLACEHOLDER.test(value) ||
        value.length < 8 ||
        /ENV_DOCTOR_IGNORE/.test(line) ||
        /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? '')
      )
        return;
      findings.push({
        file: filePath,
        line: idx + 1,
        column: line.indexOf(yaml[1]) + 1,
        ruleId: 'secret.suspiciousYaml',
        variableName: yaml[1].toUpperCase().replace(/[.-]/g, '_'),
        confidence: 'medium',
        maskedPreview: maskSecret(value),
        message:
          'A credential-like YAML value may contain a secret. Verify it and use an environment variable or secret store.',
      });
    });
  }

  const unique = new Map<string, SecretFinding>();
  for (const finding of findings)
    unique.set(`${finding.file}:${finding.line}:${finding.column}:${finding.ruleId}`, finding);
  return [...unique.values()];
}

export function detectTrackedEnvSecrets(
  definitions: EnvDefinition[],
  filePath: string,
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const definition of definitions) {
    const value = definition.value.trim();
    const providerMatch = PROVIDER_PATTERNS.some((provider) => {
      provider.regex.lastIndex = 0;
      return provider.regex.test(value);
    });
    if (
      definition.isExample ||
      definition.ignored ||
      !value ||
      (!isSensitiveName(definition.name) && !providerMatch && !URL_WITH_CREDENTIALS.test(value)) ||
      SAFE_PLACEHOLDER.test(value)
    ) {
      continue;
    }
    findings.push({
      file: filePath,
      line: definition.line,
      column: definition.column,
      ruleId: 'secret.trackedEnvFile',
      variableName: definition.name,
      confidence: 'high',
      maskedPreview: maskSecret(value),
      message:
        'A Git-tracked environment file contains a credential-like value. Remove the file from version control and rotate exposed credentials if necessary.',
    });
  }
  return findings;
}
