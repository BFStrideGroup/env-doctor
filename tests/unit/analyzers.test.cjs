const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MissingAnalyzer,
  UnusedAnalyzer,
  ComparisonAnalyzer,
  PublicExposureAnalyzer,
} = require('../../dist/core/analyzers');

function context(dynamic = false) {
  const envA = {
    path: '/r/.env',
    name: '.env',
    packageRoot: '/r',
    errors: [],
    definitions: [
      {
        name: 'USED',
        value: 'x',
        file: '/r/.env',
        line: 1,
        column: 1,
        quoted: false,
        exported: false,
        isExample: false,
      },
      {
        name: 'OLD',
        value: 'y',
        file: '/r/.env',
        line: 2,
        column: 1,
        quoted: false,
        exported: false,
        isExample: false,
      },
    ],
  };
  const envE = {
    path: '/r/.env.example',
    name: '.env.example',
    packageRoot: '/r',
    errors: [],
    definitions: [
      {
        name: 'USED',
        value: '',
        file: '/r/.env.example',
        line: 1,
        column: 1,
        quoted: false,
        exported: false,
        isExample: true,
      },
      {
        name: 'DOC_ONLY',
        value: '',
        file: '/r/.env.example',
        line: 2,
        column: 1,
        quoted: false,
        exported: false,
        isExample: true,
      },
    ],
  };
  return {
    workspaceRoot: '/r',
    project: {
      root: '/r',
      packageRoot: '/r',
      name: 'r',
      frameworks: [],
      sourceFiles: ['/r/a.ts'],
      envFiles: [envA, envE],
    },
    envFiles: [envA, envE],
    references: [
      {
        name: 'USED',
        file: '/r/a.ts',
        line: 1,
        column: 1,
        language: 'typescript',
        accessType: 'x',
        confidence: 'high',
      },
      {
        name: 'MISSING',
        file: '/r/a.ts',
        line: 2,
        column: 1,
        language: 'typescript',
        accessType: 'x',
        confidence: 'high',
      },
      ...(dynamic
        ? [
            {
              name: '<dynamic>',
              file: '/r/a.ts',
              line: 3,
              column: 1,
              language: 'typescript',
              accessType: 'dynamic',
              confidence: 'low',
              dynamic: true,
            },
          ]
        : []),
    ],
    secretFindings: [],
    ignore: { ignoredVariables: [], ignoredFiles: [], ignoredRules: [], rules: {} },
    dynamicReferencePresent: dynamic,
  };
}

test('missing and unused analyzers are conservative around dynamic access', async () => {
  const c = context(true);
  const missing = await new MissingAnalyzer().analyze(c);
  assert.deepEqual(
    missing.map((i) => i.name),
    ['MISSING'],
  );
  const unused = await new UnusedAnalyzer().analyze(c);
  assert(unused.some((i) => i.name === 'OLD' && i.confidence === 'low'));
});

test('comparison analyzer reports missing definitions across env files', async () => {
  const issues = await new ComparisonAnalyzer(['.env', '.env.example']).analyze(context(false));
  assert(issues.some((i) => i.name === 'OLD' && i.message.includes('.env.example')));
  assert(issues.some((i) => i.name === 'DOC_ONLY' && i.message.includes('.env')));
});

test('missing analysis ignores platform variables and accesses with explicit fallbacks', async () => {
  const c = context(false);
  c.references.push(
    {
      name: 'PATH',
      file: '/r/a.ts',
      line: 3,
      column: 1,
      language: 'typescript',
      accessType: 'process.env.property',
      confidence: 'high',
    },
    {
      name: 'OPTIONAL_URL',
      file: '/r/a.ts',
      line: 4,
      column: 1,
      language: 'typescript',
      accessType: 'process.env.property',
      confidence: 'high',
      optional: true,
    },
  );
  const missing = await new MissingAnalyzer().analyze(c);
  assert(!missing.some((i) => i.name === 'PATH'));
  assert(!missing.some((i) => i.name === 'OPTIONAL_URL'));
});

test('public client variables with credential-like names produce a conservative exposure finding', async () => {
  const c = context(false);
  c.references.push({
    name: 'NEXT_PUBLIC_API_SECRET',
    file: '/r/a.ts',
    line: 5,
    column: 1,
    language: 'typescript',
    accessType: 'process.env.property',
    confidence: 'high',
    public: true,
  });
  const findings = await new PublicExposureAnalyzer().analyze(c);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'secret');
  assert.equal(findings[0].confidence, 'medium');
});
