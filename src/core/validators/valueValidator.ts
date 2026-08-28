import { Rule, ValidationResult } from '../models';
import { isSensitiveName } from '../../utils/security';

const TRUE_FALSE = new Set(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off']);

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.hostname);
  } catch {
    return false;
  }
}

function validateConfiguredRegex(
  value: string,
  pattern: string,
): { valid: boolean; message: string } {
  const unsafe =
    pattern.length > 256 ||
    /\\[1-9]/.test(pattern) ||
    /\(\?/.test(pattern) ||
    /\([^)]*\|[^)]*\)[+*{]/.test(pattern) ||
    /\([^)]*[+*{][^)]*\)[+*{]/.test(pattern) ||
    /\.\*[^\n]*\.\*/.test(pattern);
  if (unsafe) {
    return {
      valid: false,
      message: 'Configured regex is too complex or potentially unsafe.',
    };
  }
  try {
    const valid = new RegExp(pattern).test(value.slice(0, 4096));
    return {
      valid,
      message: valid ? 'Matches configured pattern.' : 'Does not match configured pattern.',
    };
  } catch {
    return { valid: false, message: 'Configured regex is invalid.' };
  }
}

export function validateValue(name: string, value: string, rule: Rule): ValidationResult {
  const checks: ValidationResult['checks'] = [];
  if (rule.url) {
    const valid = isValidUrl(value);
    checks.push({
      rule: 'url',
      valid,
      message: valid ? 'Valid URL format.' : 'Expected a valid URL.',
    });
  }
  if (rule.integer) {
    const valid = /^[-+]?\d+$/.test(value.trim());
    checks.push({
      rule: 'integer',
      valid,
      message: valid ? 'Valid integer.' : 'Expected an integer.',
    });
  }
  if (rule.boolean) {
    const valid = TRUE_FALSE.has(value.trim().toLowerCase());
    checks.push({
      rule: 'boolean',
      valid,
      message: valid ? 'Valid boolean.' : 'Expected a boolean value.',
    });
  }
  if (rule.regex) {
    const result = validateConfiguredRegex(value, rule.regex);
    checks.push({
      rule: 'regex',
      valid: result.valid,
      message: result.message,
    });
  }
  if (rule.allowedValues?.length) {
    const valid = rule.allowedValues.includes(value);
    const safeExpectation =
      rule.secret || isSensitiveName(name)
        ? 'Expected one of the configured allowed values.'
        : `Expected one of: ${rule.allowedValues.join(' | ')}`;
    checks.push({
      rule: 'allowedValues',
      valid,
      message: valid ? 'Value is allowed.' : safeExpectation,
    });
  }
  return { name, valid: checks.every((check) => check.valid), checks };
}
