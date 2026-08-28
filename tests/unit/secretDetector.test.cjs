const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectSecrets,
  detectTrackedEnvSecrets,
} = require('../../dist/core/services/secretDetector');

test('secret detector recognizes provider keys and masks previews', () => {
  const raw = 'sk_live_abcdefghijklmnopqrstuvwxyz';
  const findings = detectSecrets(`const stripeKey = "${raw}";`, '/r/config.ts');
  assert(findings.length >= 1);
  assert.equal(findings[0].confidence, 'high');
  assert(!findings[0].maskedPreview.includes(raw));
  assert(!findings[0].message.includes(raw));
});

test('secret detector skips dotenv files and placeholders', () => {
  assert.equal(
    detectSecrets('STRIPE_SECRET_KEY=sk_live_abcdefghijklmnopqrstuvwxyz', '/r/.env').length,
    0,
  );
  assert.equal(detectSecrets('api_key: "<your-key>"', '/r/config.yml').length, 0);
});

test('secret detector scans JSON credential properties', () => {
  const raw = 'json-private-token-value';
  const findings = detectSecrets(`{"apiKey":"${raw}"}`, '/r/config.json');
  assert(findings.some((f) => f.ruleId === 'secret.suspiciousJson'));
  assert(!JSON.stringify(findings).includes(raw));
});

test('tracked env detection reports credential-like definitions without retaining complete values', () => {
  const raw = 'tracked-private-password';
  const findings = detectTrackedEnvSecrets(
    [
      {
        name: 'DATABASE_PASSWORD',
        value: raw,
        file: '/r/.env',
        line: 1,
        column: 1,
        quoted: false,
        exported: false,
        isExample: false,
      },
    ],
    '/r/.env',
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'secret.trackedEnvFile');
  assert(!JSON.stringify(findings).includes(raw));
});

test('tracked env detection catches credential-bearing URLs even with a neutral variable name', () => {
  const raw = 'postgres://user:private-password@localhost/app';
  const findings = detectTrackedEnvSecrets(
    [
      {
        name: 'DATABASE_URL',
        value: raw,
        file: '/r/.env',
        line: 1,
        column: 1,
        quoted: false,
        exported: false,
        isExample: false,
      },
    ],
    '/r/.env',
  );
  assert.equal(findings.length, 1);
  assert(!JSON.stringify(findings).includes(raw));
});
