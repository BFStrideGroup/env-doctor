import * as vscode from 'vscode';
import { EnvReport } from '../../core/models';

export class EnvCodeActionProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];
  constructor(private readonly getReport: () => EnvReport | undefined) {}

  provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const report = this.getReport();
    if (!report) return [];
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics.filter((d) => d.source === 'Env Doctor')) {
      const id = typeof diagnostic.code === 'string' ? diagnostic.code : undefined;
      const issue = id ? report.issues.find((i) => i.id === id) : undefined;
      if (!issue) continue;
      if (issue.kind === 'missing' && issue.name) {
        const example = new vscode.CodeAction(
          `Create ${issue.name} in .env.example`,
          vscode.CodeActionKind.QuickFix,
        );
        example.command = {
          command: 'envDoctor.addVariableToExample',
          title: 'Create in .env.example',
          arguments: [issue.id],
        };
        example.diagnostics = [diagnostic];
        actions.push(example);
        const local = new vscode.CodeAction(
          `Create ${issue.name} in .env`,
          vscode.CodeActionKind.QuickFix,
        );
        local.command = {
          command: 'envDoctor.addVariableToEnv',
          title: 'Create in .env',
          arguments: [issue.id],
        };
        local.diagnostics = [diagnostic];
        actions.push(local);
      }
      if (issue.name) {
        const ignore = new vscode.CodeAction(
          `Env Doctor: Ignore ${issue.name}`,
          vscode.CodeActionKind.QuickFix,
        );
        ignore.command = {
          command: 'envDoctor.ignoreVariable',
          title: 'Ignore variable',
          arguments: [issue.id],
        };
        ignore.diagnostics = [diagnostic];
        actions.push(ignore);
      }
      if (issue.location) {
        const ignoreFile = new vscode.CodeAction(
          'Env Doctor: Ignore this file',
          vscode.CodeActionKind.QuickFix,
        );
        ignoreFile.command = {
          command: 'envDoctor.ignoreFile',
          title: 'Ignore file',
          arguments: [issue.id],
        };
        ignoreFile.diagnostics = [diagnostic];
        actions.push(ignoreFile);
      }
    }
    return actions;
  }
}
