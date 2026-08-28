const test = require('node:test');
const assert = require('node:assert/strict');
const { generateEnvExample } = require('../../dist/core/services/exampleGenerator');

function envFile(definitions) {
  return {
    path: '/r/.env',
    name: '.env',
    packageRoot: '/r',
    errors: [],
    definitions: definitions.map(([name, value], index) => ({
      name,
      value,
      file: '/r/.env',
      line: index + 1,
      column: 1,
      quoted: false,
      exported: false,
      isExample: false,
    })),
  };
}

test('example generation preserves only narrow non-secret defaults', () => {
  const output = generateEnvExample(
    [
      envFile([
        ['PORT', '3000'],
        ['DATABASE_URL', 'postgres://user:password@localhost/app'],
      ]),
    ],
    { preserveNonSecretDefaults: true },
  );
  assert(output.includes('PORT=3000'));
  assert(output.includes('DATABASE_URL='));
  assert(!output.includes('password'));
});

test('credential-like placeholders must look like placeholders', () => {
  const secret = 'real-secret-that-must-not-be-written';
  const unsafe = generateEnvExample([envFile([['API_SECRET', 'ignored']])], {
    preserveNonSecretDefaults: false,
    placeholders: { API_SECRET: secret },
  });
  assert.equal(unsafe, 'API_SECRET=\n');
  assert(!unsafe.includes(secret));

  const safe = generateEnvExample([envFile([['API_SECRET', 'ignored']])], {
    preserveNonSecretDefaults: false,
    placeholders: { API_SECRET: '<your-api-secret>' },
  });
  assert.equal(safe, 'API_SECRET=<your-api-secret>\n');
});
