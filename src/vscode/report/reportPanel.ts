import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { EnvIssue, EnvReport, IssueKind } from '../../core/models';
import { relativeDisplay } from '../../utils/paths';

function esc(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function issueSection(report: EnvReport, title: string, issues: EnvIssue[]): string {
  if (!issues.length) return '';
  return `<section><h2>${esc(title)} <span class="count">${issues.length}</span></h2>${issues
    .map((issue) => {
      const loc = issue.location
        ? `${relativeDisplay(report.workspaceRoot, issue.location.file)}:${issue.location.line}`
        : '';
      return `<article class="issue">
      <div class="issue-main"><strong>${esc(issue.name ?? issue.ruleId ?? issue.kind)}</strong><span class="badge">${esc(issue.confidence)} confidence</span></div>
      <div>${esc(issue.message)}</div>
      ${loc ? `<div class="location">${esc(loc)}</div>` : ''}
      <div class="actions">
        ${issue.location ? `<button data-action="open" data-id="${esc(issue.id)}">Open Source</button>` : ''}
        ${issue.kind === 'missing' ? `<button data-action="fix" data-id="${esc(issue.id)}">Fix</button>` : ''}
        ${issue.name ? `<button data-action="ignore" data-id="${esc(issue.id)}">Ignore</button>` : ''}
      </div>
    </article>`;
    })
    .join('')}</section>`;
}

function envMatrix(report: EnvReport): string {
  return report.projects
    .map((project) => {
      const paths = new Set(project.envFiles.map((file) => file.path));
      const envs = report.environments.filter((environment) => paths.has(environment.file));
      if (envs.length < 2) return '';
      const vars = [...new Set(envs.flatMap((e) => e.variables))].sort();
      if (!vars.length) return '';
      const rows = vars
        .slice(0, 200)
        .map(
          (name) =>
            `<tr><th>${esc(name)}</th>${envs.map((e) => `<td aria-label="${esc(name)} in ${esc(e.name)}">${e.variables.includes(name) ? '✓' : '—'}</td>`).join('')}</tr>`,
        )
        .join('');
      const title =
        report.projects.length > 1 ? `Environment Matrix · ${project.name}` : 'Environment Matrix';
      return `<section><h2>${esc(title)}</h2><div class="table-wrap"><table><thead><tr><th>Variable</th>${envs.map((e) => `<th title="${esc(relativeDisplay(report.workspaceRoot, e.file))}">${esc(e.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${vars.length > 200 ? '<p>Matrix truncated to 200 variables in the report view.</p>' : ''}</section>`;
    })
    .join('');
}

export class ReportPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private report?: EnvReport;
  private filter?: IssueKind;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly onAction: (action: string, id?: string) => Promise<void>) {}

  show(report: EnvReport, filter?: IssueKind): void {
    this.report = report;
    this.filter = filter;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'envDoctor.report',
        'Env Doctor Report',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
        },
        null,
        this.disposables,
      );
      this.panel.webview.onDidReceiveMessage(
        async (message: { action?: string; id?: string }) => {
          if (!message.action) return;
          await this.onAction(message.action, message.id);
        },
        null,
        this.disposables,
      );
    }
    this.panel.title = filter ? `Env Doctor: ${filter}` : 'Env Doctor Report';
    this.panel.webview.html = this.html(report, this.panel.webview);
    this.panel.reveal(vscode.ViewColumn.Active, true);
  }

  update(report: EnvReport): void {
    this.report = report;
    if (this.panel) this.panel.webview.html = this.html(report, this.panel.webview);
  }

  private html(report: EnvReport, _webview: vscode.Webview): string {
    const nonce = randomBytes(18).toString('base64url');
    const s = report.summary;
    const projectNames =
      report.projects.map((p) => p.name).join(', ') || path.basename(report.workspaceRoot);
    const visibleIssues = this.filter
      ? report.issues.filter((issue) => issue.kind === this.filter)
      : report.issues;
    const filterNotice = this.filter
      ? `<div class="muted">Filtered to: ${esc(this.filter)}</div>`
      : '';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
      <style nonce="${nonce}">
      body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;max-width:1100px;margin:auto}h1{margin:0 0 4px}h2{margin-top:28px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:6px}.muted,.location{color:var(--vscode-descriptionForeground)}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.stat{border:1px solid var(--vscode-panel-border);padding:10px 12px;border-radius:4px;min-width:115px}.stat strong{font-size:1.3em;display:block}.issue{border-left:3px solid var(--vscode-panel-border);padding:9px 12px;margin:8px 0;background:var(--vscode-sideBar-background)}.issue-main{display:flex;gap:10px;align-items:center}.badge,.count{font-size:.85em;color:var(--vscode-descriptionForeground);font-weight:normal}.actions{margin-top:7px;display:flex;gap:6px}button{font:inherit;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:4px 9px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}table{border-collapse:collapse;width:100%;font-size:.95em}th,td{border:1px solid var(--vscode-panel-border);padding:5px 8px;text-align:left}td{text-align:center}.table-wrap{overflow:auto;max-height:440px}.toolbar{display:flex;gap:8px;margin:12px 0}
      </style></head><body>
      <h1>ENV DOCTOR</h1><div class="muted">Project: ${esc(projectNames)} · ${esc(report.scan.durationMs)}ms · ${esc(report.scan.cacheHits)} cache hits</div>
      ${filterNotice}
      <div class="toolbar"><button data-action="refresh">Refresh</button><button data-action="generateExample">Generate .env.example</button></div>
      <div class="summary">
        <div class="stat"><strong>${s.valid}</strong>Valid references</div><div class="stat"><strong>${s.missing}</strong>Missing</div><div class="stat"><strong>${s.unused}</strong>Unused</div><div class="stat"><strong>${s.secrets}</strong>Possible secrets</div><div class="stat"><strong>${s.inconsistent}</strong>Differences</div>
      </div>
      ${issueSection(
        report,
        'Missing',
        visibleIssues.filter((i) => i.kind === 'missing'),
      )}
      ${issueSection(
        report,
        'Unused',
        visibleIssues.filter((i) => i.kind === 'unused'),
      )}
      ${issueSection(
        report,
        'Possible Secrets',
        visibleIssues.filter((i) => i.kind === 'secret'),
      )}
      ${issueSection(
        report,
        'Environment Differences',
        visibleIssues.filter((i) => i.kind === 'inconsistent'),
      )}
      ${issueSection(
        report,
        'Validation',
        visibleIssues.filter((i) => i.kind === 'validation'),
      )}
      ${issueSection(
        report,
        'Parse Problems',
        visibleIssues.filter((i) => i.kind === 'parse'),
      )}
      ${!this.filter || this.filter === 'inconsistent' ? envMatrix(report) : ''}
      ${report.scan.warnings.length ? `<section><h2>Scan Notes</h2><ul>${report.scan.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>` : ''}
      <script nonce="${nonce}">const vscode=acquireVsCodeApi();document.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(b)vscode.postMessage({action:b.dataset.action,id:b.dataset.id});});</script>
      </body></html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
