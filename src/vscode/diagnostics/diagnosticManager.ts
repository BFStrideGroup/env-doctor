import * as vscode from 'vscode';
import { EnvIssue, EnvReport } from '../../core/models';

function toSeverity(severity: EnvIssue['severity']): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

export class DiagnosticManager implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('envDoctor');

  update(report: EnvReport | undefined): void {
    this.collection.clear();
    if (!report) return;
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const issue of report.issues) {
      if (!issue.location) continue;
      const line = Math.max(0, issue.location.line - 1);
      const col = Math.max(0, issue.location.column - 1);
      const length = Math.max(1, issue.name?.length ?? 1);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(line, col, line, col + length),
        issue.message,
        toSeverity(issue.severity),
      );
      diagnostic.source = 'Env Doctor';
      diagnostic.code = issue.id;
      diagnostic.tags =
        issue.kind === 'unused' && issue.confidence === 'high'
          ? [vscode.DiagnosticTag.Unnecessary]
          : undefined;
      diagnostic.relatedInformation = issue.related?.map(
        (related) =>
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              vscode.Uri.file(related.file),
              new vscode.Position(Math.max(0, related.line - 1), Math.max(0, related.column - 1)),
            ),
            'Additional usage',
          ),
      );
      const list = byFile.get(issue.location.file) ?? [];
      list.push(diagnostic);
      byFile.set(issue.location.file, list);
    }
    for (const [file, diagnostics] of byFile)
      this.collection.set(vscode.Uri.file(file), diagnostics);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
