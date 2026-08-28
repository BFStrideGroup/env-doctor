const test = require('node:test');
const assert = require('node:assert/strict');
const { PythonDetector } = require('../../dist/parsers/python');
const { PhpDetector } = require('../../dist/parsers/php');
const { DockerDetector } = require('../../dist/parsers/docker');
const { ShellDetector } = require('../../dist/parsers/shell');

test('Python detector finds supported forms', async () => {
  const refs = await new PythonDetector().detectReferences(
    `os.getenv("DATABASE_URL")\nos.environ['TOKEN']\nos.environ.get("REDIS_URL")\nos.getenv("PORT", "3000")`,
    '/x/app.py',
  );
  assert.deepEqual(
    refs.map((r) => r.name),
    ['DATABASE_URL', 'TOKEN', 'REDIS_URL', 'PORT'],
  );
  assert.equal(refs.find((r) => r.name === 'PORT').optional, true);
});

test('PHP detector finds Laravel env calls', async () => {
  const refs = await new PhpDetector().detectReferences(
    `$x = env('DATABASE_URL');`,
    '/x/config.php',
  );
  assert.equal(refs[0].name, 'DATABASE_URL');
});

test('Docker detector finds interpolation and pass-through', async () => {
  const refs = await new DockerDetector().detectReferences(
    `services:\n  app:\n    environment:\n      - DATABASE_URL=\${DATABASE_URL}\n      - REDIS_URL\n`,
    '/x/docker-compose.yml',
  );
  assert(refs.some((r) => r.name === 'DATABASE_URL'));
  assert(refs.some((r) => r.name === 'REDIS_URL'));
});

test('Shell detector finds braced and unbraced variables', async () => {
  const refs = await new ShellDetector().detectReferences(
    `echo "$DATABASE_URL ${'${TOKEN:-missing}'}"`,
    '/x/run.sh',
  );
  assert.deepEqual(
    refs.map((r) => r.name),
    ['DATABASE_URL', 'TOKEN'],
  );
});

test('Docker detector does not mistake arbitrary Compose mapping keys for env pass-through', async () => {
  const refs = await new DockerDetector().detectReferences(
    `services:\n  app:\n    image: node:22\n    ports:\n      - "3000:3000"\n    environment:\n      API_KEY:\n`,
    '/x/compose.yml',
  );
  assert.deepEqual(
    refs.map((r) => r.name),
    ['API_KEY'],
  );
});

test('Docker and shell detectors mark defaulted variables optional', async () => {
  const docker = await new DockerDetector().detectReferences(
    'image: "${IMAGE_NAME:-app}"\nname: "${REQUIRED?missing}"',
    '/x/compose.yml',
  );
  assert.equal(docker.find((r) => r.name === 'IMAGE_NAME').optional, true);
  assert.equal(docker.find((r) => r.name === 'REQUIRED').optional, false);

  const shell = await new ShellDetector().detectReferences(
    `echo "${'${OPTIONAL:-fallback}'}"\necho "${'${REQUIRED?missing}'}"\necho '$NOT_EXPANDED'\necho \\$ESCAPED # $COMMENT`,
    '/x/run.sh',
  );
  assert.equal(shell.find((r) => r.name === 'OPTIONAL').optional, true);
  assert.equal(shell.find((r) => r.name === 'REQUIRED').optional, false);
  assert(!shell.some((r) => ['NOT_EXPANDED', 'ESCAPED', 'COMMENT'].includes(r.name)));
});
