import * as vscode from 'vscode';
import { EnvIssue, EnvReport, IssueKind } from '../../core/models';
import { relativeDisplay } from '../../utils/paths';

type Node =
  | { type: 'overview' }
  | { type: 'category'; kind: IssueKind; label: string; icon: string }
  | { type: 'issue'; issue: EnvIssue };

const CATEGORIES: Array<{ kind: IssueKind; label: string; icon: string }> = [
  { kind: 'missing', label: 'Missing', icon: 'error' },
  { kind: 'unused', label: 'Unused', icon: 'warning' },
  { kind: 'secret', label: 'Possible Secrets', icon: 'shield' },
  { kind: 'inconsistent', label: 'Environment Differences', icon: 'diff' },
  { kind: 'validation', label: 'Validation', icon: 'checklist' },
  { kind: 'parse', label: 'Parse Problems', icon: 'symbol-key' },
];

export class EnvTreeProvider implements vscode.TreeDataProvider<Node> {
  private report?: EnvReport;
  private readonly emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  setReport(report: EnvReport | undefined): void {
    this.report = report;
    this.emitter.fire();
  }
  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element.type === 'overview') {
      const r = this.report;
      const item = new vscode.TreeItem('Overview', vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(
        r && r.summary.missing + r.summary.secrets + r.summary.validation === 0
          ? 'pass-filled'
          : 'pulse',
      );
      item.description = r
        ? `${r.summary.valid} valid · ${r.issues.length} findings`
        : 'Not scanned';
      item.tooltip = r
        ? `Scanned ${r.scan.filesConsidered} files in ${r.scan.durationMs}ms`
        : 'Run Env Doctor: Scan Project';
      item.command = { command: 'envDoctor.showReport', title: 'Show Report' };
      return item;
    }
    if (element.type === 'category') {
      const count = this.report?.issues.filter((i) => i.kind === element.kind).length ?? 0;
      const item = new vscode.TreeItem(
        element.label,
        count ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
      );
      item.description = String(count);
      item.iconPath = new vscode.ThemeIcon(element.icon);
      item.accessibilityInformation = { label: `${element.label}, ${count} findings` };
      return item;
    }
    const issue = element.issue;
    const item = new vscode.TreeItem(
      issue.name ?? issue.message,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description =
      issue.location && this.report
        ? `${relativeDisplay(this.report.workspaceRoot, issue.location.file)}:${issue.location.line}`
        : issue.confidence;
    item.tooltip = new vscode.MarkdownString(
      `**${issue.kind.toUpperCase()}** · confidence: ${issue.confidence}\n\n${issue.message}`,
    );
    item.iconPath = new vscode.ThemeIcon(
      issue.kind === 'missing'
        ? 'error'
        : issue.kind === 'secret'
          ? 'shield'
          : issue.kind === 'unused'
            ? 'warning'
            : 'info',
    );
    item.command = { command: 'envDoctor.openIssue', title: 'Open', arguments: [issue.id] };
    item.contextValue = issue.name ? 'envDoctor.issue.variable' : 'envDoctor.issue.file';
    item.accessibilityInformation = { label: `${issue.kind}: ${issue.name ?? issue.message}` };
    return item;
  }

  getChildren(element?: Node): Node[] {
    if (!element)
      return [
        { type: 'overview' },
        ...CATEGORIES.map((c) => ({ type: 'category' as const, ...c })),
      ];
    if (element.type !== 'category' || !this.report) return [];
    return this.report.issues
      .filter((i) => i.kind === element.kind)
      .map((issue) => ({ type: 'issue', issue }));
  }

  getParent(): Node | undefined {
    return undefined;
  }
}
