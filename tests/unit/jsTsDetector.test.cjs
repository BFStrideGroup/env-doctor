const test = require('node:test');
const assert = require('node:assert/strict');
const { JsTsDetector } = require('../../dist/parsers/javascript');

test('JS/TS detector uses AST for static and dynamic accesses', async () => {
  const source = `
    const a = process.env.DATABASE_URL;
    const b = process.env["REDIS_URL"];
    const c = import.meta.env.VITE_API_URL;
    const { JWT_SECRET: jwt, PORT } = process.env;
    const d = process.env[key];
    const e = process.env.OPTIONAL_URL ?? "http://localhost";
    const { OPTIONAL_PORT = "3000" } = process.env;
  `;
  const refs = await new JsTsDetector().detectReferences(source, '/repo/app.ts');
  assert.deepEqual(
    new Set(refs.filter((r) => !r.dynamic).map((r) => r.name)),
    new Set([
      'DATABASE_URL',
      'REDIS_URL',
      'VITE_API_URL',
      'JWT_SECRET',
      'PORT',
      'OPTIONAL_URL',
      'OPTIONAL_PORT',
    ]),
  );
  assert.equal(refs.find((r) => r.name === 'VITE_API_URL').public, true);
  assert.equal(refs.filter((r) => r.dynamic).length, 1);
  assert.equal(refs.find((r) => r.dynamic).confidence, 'low');
  assert.equal(refs.find((r) => r.name === 'OPTIONAL_URL').optional, true);
  assert.equal(refs.find((r) => r.name === 'OPTIONAL_PORT').optional, true);
});

test('Vite built-in import.meta.env properties are not treated as user variables', async () => {
  const refs = await new JsTsDetector().detectReferences(
    'console.log(import.meta.env.MODE, import.meta.env.DEV, import.meta.env.VITE_CUSTOM);',
    '/repo/app.ts',
  );
  assert.deepEqual(
    refs.map((r) => r.name),
    ['VITE_CUSTOM'],
  );
});
