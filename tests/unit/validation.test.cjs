const test = require('node:test');
const assert = require('node:assert/strict');
const { validateValue } = require('../../dist/core/validators');

test('validation engine validates URL, integer, boolean and allowed values without echoing values', () => {
  assert.equal(validateValue('PORT', '3000', { integer: true }).valid, true);
  assert.equal(validateValue('DEBUG', 'true', { boolean: true }).valid, true);
  assert.equal(validateValue('URL', 'not-url', { url: true }).valid, false);
  const r = validateValue('NODE_ENV', 'staging', {
    allowedValues: ['development', 'test', 'production'],
  });
  assert.equal(r.valid, false);
  assert(!JSON.stringify(r).includes('staging'));
});

test('validation messages do not reveal configured allowed values for secrets', () => {
  const secretAllowed = 'credential-value-that-must-not-leak';
  const result = validateValue('API_SECRET', 'different', {
    secret: true,
    allowedValues: [secretAllowed],
  });
  assert.equal(result.valid, false);
  assert(!JSON.stringify(result).includes(secretAllowed));
});

test('validation rejects potentially unsafe regular expressions', () => {
  const result = validateValue('INPUT', 'a'.repeat(10000) + '!', { regex: '(a+)+$' });
  assert.equal(result.valid, false);
  assert.match(result.checks[0].message, /potentially unsafe/);
});
