const test = require('node:test');
const assert = require('node:assert/strict');
const { DotenvParser } = require('../../dist/parsers/dotenv');

test('dotenv parser handles comments, export, quotes, empty and multiline values', () => {
  const parser = new DotenvParser();
  const result = parser.parse(
    `# comment\nexport A=one\nB="two\\nlines" # note\nC='literal # hash'\nEMPTY=\nMULTI="hello\nworld"\n`,
    '/repo/.env',
  );
  assert.equal(result.errors.length, 0);
  const values = Object.fromEntries(result.definitions.map((d) => [d.name, d.value]));
  assert.equal(values.A, 'one');
  assert.equal(values.B, 'two\nlines');
  assert.equal(values.C, 'literal # hash');
  assert.equal(values.EMPTY, '');
  assert.equal(values.MULTI, 'hello\nworld');
  assert.equal(result.definitions.find((d) => d.name === 'A').exported, true);
});

test('dotenv parser reports malformed input without crashing', () => {
  const result = new DotenvParser().parse('BAD LINE\n1INVALID=x\nOK=y\n', '/repo/.env');
  assert.equal(result.definitions.length, 1);
  assert.equal(result.errors.length, 2);
  assert.equal(result.definitions[0].name, 'OK');
});

test('multiline dotenv definitions retain the starting source line', () => {
  const result = new DotenvParser().parse('A=1\nMULTI="hello\nworld"\n', '/repo/.env');
  assert.equal(result.definitions.find((d) => d.name === 'MULTI').line, 2);
});

test('dotenv parser reports duplicate keys and unexpected trailing content', () => {
  const result = new DotenvParser().parse('DUP=one\nDUP=two\nQUOTED="ok" trailing\n', '/repo/.env');
  assert(result.errors.some((e) => e.code === 'dotenv.duplicateKey'));
  assert(result.errors.some((e) => e.code === 'dotenv.trailingContent'));
  assert.equal(result.definitions.length, 3);
});
