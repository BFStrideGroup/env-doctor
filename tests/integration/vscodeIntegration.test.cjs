const test = require('node:test');
const assert = require('node:assert/strict');
const vscode = require('vscode');
const { EnvDoctorController } = require('../../dist/vscode/controller');
const { EnvTreeProvider } = require('../../dist/vscode/treeView/envTreeProvider');
const { DiagnosticManager } = require('../../dist/vscode/diagnostics/diagnosticManager');
const { EnvCodeActionProvider } = require('../../dist/vscode/codeActions/envCodeActionProvider');
const extension = require('../../dist/extension');

function report() {
  return {
    workspaceRoot: '/r',
    generatedAt: new Date().toISOString(),
    projects: [],
    references: [],
    envFiles: [],
    secretFindings: [],
    environments: [],
    scan: { filesConsidered: 1, filesParsed: 1, cacheHits: 0, durationMs: 1, warnings: [] },
    summary: {
      valid: 0,
      missing: 1,
      unused: 0,
      secrets: 0,
      inconsistent: 0,
      validation: 0,
      parse: 0,
    },
    issues: [
      {
        id: 'i1',
        kind: 'missing',
        name: 'API_URL',
        message: 'API_URL is missing',
        severity: 'warning',
        confidence: 'high',
        location: { file: '/r/a.ts', line: 2, column: 3 },
        packageRoot: '/r',
        ruleId: 'missing',
      },
    ],
  };
}

test('controller registers documented VS Code commands without a workspace', () => {
  const controller = new EnvDoctorController({ subscriptions: [] });
  const expected = [
    'envDoctor.scanProject',
    'envDoctor.showReport',
    'envDoctor.generateExample',
    'envDoctor.compareEnvironments',
    'envDoctor.findMissing',
    'envDoctor.findUnused',
    'envDoctor.scanSecrets',
    'envDoctor.validate',
    'envDoctor.refresh',
  ];
  for (const cmd of expected) assert(vscode.__state.commands.has(cmd), `missing command ${cmd}`);
  controller.dispose();
});

test('Tree View exposes overview, categories and navigable issues', () => {
  const tree = new EnvTreeProvider();
  tree.setReport(report());
  const roots = tree.getChildren();
  assert(roots.length >= 2);
  const missingCategory = roots.find((n) => n.type === 'category' && n.kind === 'missing');
  const children = tree.getChildren(missingCategory);
  assert.equal(children.length, 1);
  const item = tree.getTreeItem(children[0]);
  assert.equal(item.label, 'API_URL');
  assert.equal(item.command.command, 'envDoctor.openIssue');
  assert.equal(item.contextValue, 'envDoctor.issue.variable');
});

test('diagnostics and Quick Fixes are generated from issues', () => {
  const r = report();
  const diagnostics = new DiagnosticManager();
  diagnostics.update(r);
  const collection = vscode.__state.collections.at(-1);
  const list = collection._data.get('/r/a.ts');
  assert.equal(list.length, 1);
  assert.equal(list[0].source, 'Env Doctor');
  assert.equal(list[0].code, 'i1');
  const provider = new EnvCodeActionProvider(() => r);
  const actions = provider.provideCodeActions({}, {}, { diagnostics: list });
  assert(actions.some((a) => a.command?.command === 'envDoctor.addVariableToExample'));
  assert(actions.some((a) => a.command?.command === 'envDoctor.ignoreVariable'));
  diagnostics.dispose();
});

test('extension entry point activates and disposes safely without a workspace', async () => {
  const context = { subscriptions: [] };
  await extension.activate(context);
  assert(context.subscriptions.length > 0);
  extension.deactivate();
});
