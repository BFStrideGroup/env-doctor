import fs from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { EnvDoctorEngine, generateEnvExample } from '../core/services';
import { EnvIssue, EnvReport } from '../core/models';
import { loadIgnoreConfig, serializeIgnoreConfig } from '../core/rules';
import { normalizePath, relativeDisplay } from '../utils/paths';
import { readScanOptions } from './config';
import { DiagnosticManager } from './diagnostics/diagnosticManager';
import { EnvTreeProvider } from './treeView/envTreeProvider';
import { EnvDoctorStatusBar } from './statusBar/statusBar';
import { ReportPanel } from './report/reportPanel';
import { PreviewContentProvider } from './report/previewProvider';
import { EnvCodeActionProvider } from './codeActions/envCodeActionProvider';
import { strings } from './strings';
import { safeErrorMessage } from '../utils/security';
import { DotenvParser } from '../parsers/dotenv';

function mergeReports(reports: EnvReport[]): EnvReport | undefined {
  if (!reports.length) return undefined;
  const first = reports[0];
  return {
    workspaceRoot: first.workspaceRoot,
    generatedAt: new Date().toISOString(),
    projects: reports.flatMap((r) => r.projects),
    references: reports.flatMap((r) => r.references),
    envFiles: reports.flatMap((r) => r.envFiles),
    issues: reports.flatMap((r) => r.issues),
    secretFindings: reports.flatMap((r) => r.secretFindings),
    environments: reports.flatMap((r) => r.environments),
    summary: {
      valid: reports.reduce((n, r) => n + r.summary.valid, 0),
      missing: reports.reduce((n, r) => n + r.summary.missing, 0),
      unused: reports.reduce((n, r) => n + r.summary.unused, 0),
      secrets: reports.reduce((n, r) => n + r.summary.secrets, 0),
      inconsistent: reports.reduce((n, r) => n + r.summary.inconsistent, 0),
      validation: reports.reduce((n, r) => n + r.summary.validation, 0),
      parse: reports.reduce((n, r) => n + r.summary.parse, 0),
    },
    scan: {
      filesConsidered: reports.reduce((n, r) => n + r.scan.filesConsidered, 0),
      filesParsed: reports.reduce((n, r) => n + r.scan.filesParsed, 0),
      cacheHits: reports.reduce((n, r) => n + r.scan.cacheHits, 0),
      durationMs: reports.reduce((n, r) => n + r.scan.durationMs, 0),
      warnings: reports.flatMap((r) => r.scan.warnings),
    },
  };
}

export class EnvDoctorController implements vscode.Disposable {
  private readonly engines = new Map<string, EnvDoctorEngine>();
  private readonly diagnostics = new DiagnosticManager();
  readonly tree = new EnvTreeProvider();
  private readonly status = new EnvDoctorStatusBar();
  private readonly reportPanel = new ReportPanel((action, id) =>
    this.handleReportAction(action, id),
  );
  private readonly preview = new PreviewContentProvider();
  private readonly output = vscode.window.createOutputChannel('Env Doctor', { log: true });
  private readonly disposables: vscode.Disposable[] = [];
  private scanAbort?: AbortController;
  private debounce?: NodeJS.Timeout;
  private _report?: EnvReport;

  get report(): EnvReport | undefined {
    return this._report;
  }

  constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      this.diagnostics,
      this.status,
      this.reportPanel,
      this.preview,
      this.output,
      vscode.workspace.registerTextDocumentContentProvider('env-doctor-preview', this.preview),
      vscode.window.registerTreeDataProvider('envDoctor.explorer', this.tree),
      vscode.languages.registerCodeActionsProvider(
        { scheme: 'file' },
        new EnvCodeActionProvider(() => this._report),
        { providedCodeActionKinds: EnvCodeActionProvider.kinds },
      ),
    );
    this.registerCommands();
    this.registerWorkspaceEvents();
  }

  async activate(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('envDoctor');
    if (
      cfg.get<boolean>('autoScan', true) &&
      cfg.get<boolean>('scanOnOpen', true) &&
      vscode.workspace.workspaceFolders?.length
    ) {
      void this.scan(false, false);
    } else {
      this.status.update(undefined);
    }
  }

  async scan(force = false, notify = true): Promise<EnvReport | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      if (notify) void vscode.window.showInformationMessage(strings.noWorkspace);
      return undefined;
    }
    this.scanAbort?.abort();
    const abort = new AbortController();
    this.scanAbort = abort;
    this.status.setScanning();
    const options = readScanOptions();
    try {
      const reports: EnvReport[] = [];
      for (const folder of folders) {
        const root = normalizePath(folder.uri.fsPath);
        let engine = this.engines.get(root);
        if (!engine) {
          engine = new EnvDoctorEngine();
          this.engines.set(root, engine);
        }
        if (force) engine.scanner.reset();
        reports.push(await engine.scanWorkspace(root, options, abort.signal));
      }
      if (abort.signal.aborted) return undefined;
      this._report = mergeReports(reports);
      this.diagnostics.update(this._report);
      this.tree.setReport(this._report);
      this.status.update(this._report);
      if (this._report) {
        this.reportPanel.update(this._report);
        this.output.info(
          `Scan complete: ${this._report.scan.filesConsidered} files, ${this._report.issues.length} findings, ${this._report.scan.cacheHits} cache hits, ${this._report.scan.durationMs}ms.`,
        );
      }
      return this._report;
    } catch (error) {
      if ((error as Error).message === 'ScanCancelled' || abort.signal.aborted) return undefined;
      this.output.error(
        `Scan failed safely (${safeErrorMessage(error)}). No environment values were logged.`,
      );
      this.status.update(this._report);
      if (notify)
        void vscode.window.showErrorMessage(
          'Env Doctor could not complete the scan. Check the Env Doctor output for a safe diagnostic summary.',
        );
      return undefined;
    } finally {
      if (this.scanAbort === abort) this.scanAbort = undefined;
    }
  }

  private registerCommands(): void {
    const register = (name: string, callback: (...args: any[]) => unknown) =>
      this.disposables.push(vscode.commands.registerCommand(name, callback));
    register('envDoctor.scanProject', () => this.scan(false));
    register('envDoctor.refresh', () => this.scan(true));
    register('envDoctor.showReport', async () => {
      const report = this._report ?? (await this.scan(false));
      if (report) this.reportPanel.show(report);
    });
    register('envDoctor.compareEnvironments', async () =>
      this.showFilteredResult('Environment comparison', 'inconsistent'),
    );
    register('envDoctor.findMissing', async () =>
      this.showFilteredResult('Missing variables', 'missing'),
    );
    register('envDoctor.findUnused', async () =>
      this.showFilteredResult('Unused variables', 'unused'),
    );
    register('envDoctor.scanSecrets', async () =>
      this.showFilteredResult('Possible secrets', 'secret'),
    );
    register('envDoctor.validate', async () => {
      const report = await this.scan(false);
      if (!report) return;
      const count = report.issues.filter(
        (i) => i.kind === 'validation' || i.kind === 'missing',
      ).length;
      if (!count)
        void vscode.window.showInformationMessage('Env Doctor: configuration validation passed.');
      else this.reportPanel.show(report);
    });
    register('envDoctor.openIssue', (id: string) => this.openIssue(id));
    register('envDoctor.ignoreVariable', (id: string) => this.ignoreVariable(id));
    register('envDoctor.ignoreFile', (id: string) => this.ignoreFile(id));
    register('envDoctor.addVariableToExample', (id: string) =>
      this.addVariable(id, '.env.example'),
    );
    register('envDoctor.addVariableToEnv', (id: string) => this.addVariable(id, '.env'));
    register('envDoctor.generateExample', () => this.generateExample());
  }

  private registerWorkspaceEvents(): void {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (!vscode.workspace.getConfiguration('envDoctor').get<boolean>('scanOnSave', true))
          return;
        this.invalidate(doc.uri.fsPath);
        this.scheduleScan();
      }),
      vscode.workspace.onDidCreateFiles(() => this.scheduleScan(true)),
      vscode.workspace.onDidDeleteFiles(() => this.scheduleScan(true)),
      vscode.workspace.onDidRenameFiles(() => this.scheduleScan(true)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('envDoctor')) this.scheduleScan(true);
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleScan(true)),
    );
  }

  private scheduleScan(force = false): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.scan(force, false), 400);
  }

  private invalidate(file: string): void {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
    if (!folder) return;
    this.engines.get(normalizePath(folder.uri.fsPath))?.scanner.markChanged(normalizePath(file));
  }

  private issue(id: string): EnvIssue | undefined {
    return this._report?.issues.find((issue) => issue.id === id);
  }

  private async openIssue(id: string): Promise<void> {
    const issue = this.issue(id);
    if (!issue?.location) return;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(issue.location.file));
      const editor = await vscode.window.showTextDocument(doc, { preview: true });
      const pos = new vscode.Position(
        Math.max(0, issue.location.line - 1),
        Math.max(0, issue.location.column - 1),
      );
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport,
      );
    } catch {
      void vscode.window.showErrorMessage(
        'Env Doctor could not open the finding location. The file may have moved or become unreadable.',
      );
    }
  }

  private async showFilteredResult(label: string, kind: EnvIssue['kind']): Promise<void> {
    const report = await this.scan(false);
    if (!report) return;
    const count = report.issues.filter((i) => i.kind === kind).length;
    if (!count)
      void vscode.window.showInformationMessage(`Env Doctor: no ${label.toLowerCase()} found.`);
    else this.reportPanel.show(report, kind);
  }

  private async handleReportAction(action: string, id?: string): Promise<void> {
    if (action === 'refresh') {
      await this.scan(true);
      return;
    }
    if (action === 'generateExample') {
      await this.generateExample();
      return;
    }
    if (!id) return;
    if (action === 'open') await this.openIssue(id);
    else if (action === 'ignore') await this.ignoreVariable(id);
    else if (action === 'fix') await this.chooseFix(id);
  }

  private async chooseFix(id: string): Promise<void> {
    const issue = this.issue(id);
    if (!issue?.name) return;
    const choice = await vscode.window.showQuickPick<{
      label: string;
      description: string;
      target: string;
    }>(
      [
        {
          label: 'Create in .env.example',
          description: 'Adds an empty placeholder; never copies a secret value.',
          target: '.env.example',
        },
        { label: 'Create in .env', description: 'Adds an empty local definition.', target: '.env' },
        {
          label: 'Ignore variable',
          description: 'Adds the variable name to .envdoctorrc.',
          target: 'ignore',
        },
      ],
      { title: `Fix ${issue.name}`, placeHolder: 'Choose a safe action' },
    );
    if (!choice) return;
    if (choice.target === 'ignore') await this.ignoreVariable(id);
    else await this.addVariable(id, choice.target);
  }

  private async addVariable(id: string, filename: string): Promise<void> {
    const issue = this.issue(id);
    if (!issue?.name) return;
    const target = path.join(issue.packageRoot, filename);
    let existing = '';
    try {
      existing = await fs.readFile(target, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        void vscode.window.showErrorMessage(
          `Env Doctor could not write ${filename}. Check file permissions.`,
        );
        return;
      }
    }
    const nameRe = new RegExp(
      `^\\s*(?:export\\s+)?${issue.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`,
      'm',
    );
    if (nameRe.test(existing)) {
      void vscode.window.showInformationMessage(`${issue.name} already exists in ${filename}.`);
      return;
    }
    const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
    try {
      await fs.writeFile(target, `${existing}${prefix}${issue.name}=\n`, 'utf8');
      this.invalidate(target);
      await this.scan(false, false);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      void vscode.window.showErrorMessage(
        `Env Doctor could not update ${filename}. Check file permissions.`,
      );
    }
  }

  private async ignoreVariable(id: string): Promise<void> {
    const issue = this.issue(id);
    if (!issue?.name) return;
    await this.updateIgnoreConfig(issue.packageRoot, (config) => {
      if (!config.ignoredVariables.includes(issue.name!)) config.ignoredVariables.push(issue.name!);
      config.ignoredVariables.sort();
    });
  }

  private async ignoreFile(id: string): Promise<void> {
    const issue = this.issue(id);
    if (!issue?.location) return;
    const rel = relativeDisplay(issue.packageRoot, issue.location.file);
    await this.updateIgnoreConfig(issue.packageRoot, (config) => {
      if (!config.ignoredFiles.includes(rel)) config.ignoredFiles.push(rel);
      config.ignoredFiles.sort();
    });
  }

  private async updateIgnoreConfig(
    root: string,
    mutate: (config: Awaited<ReturnType<typeof loadIgnoreConfig>>['config']) => void,
  ): Promise<void> {
    const loaded = await loadIgnoreConfig(root);
    if (loaded.warning && loaded.warning.includes('could not be parsed')) {
      void vscode.window.showWarningMessage(
        'Env Doctor will not overwrite an invalid .envdoctorrc. Fix the file first.',
      );
      return;
    }
    try {
      mutate(loaded.config);
      const file = path.join(root, '.envdoctorrc');
      await fs.writeFile(file, serializeIgnoreConfig(loaded.config), 'utf8');
      this.invalidate(file);
      await this.scan(true, false);
    } catch {
      void vscode.window.showErrorMessage(
        'Env Doctor could not update .envdoctorrc. Check file permissions.',
      );
    }
  }

  private pickProject(): EnvReport['projects'][number] | undefined {
    const report = this._report;
    if (!report) return undefined;
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (active) {
      return [...report.projects]
        .sort((a, b) => b.packageRoot.length - a.packageRoot.length)
        .find(
          (p) =>
            normalizePath(active).startsWith(`${normalizePath(p.packageRoot)}/`) ||
            normalizePath(active) === normalizePath(p.packageRoot),
        );
    }
    return report.projects.find((p) => p.envFiles.length) ?? report.projects[0];
  }

  private async generateExample(): Promise<void> {
    const report = this._report ?? (await this.scan(false));
    if (!report) return;
    const project = this.pickProject();
    if (!project) {
      void vscode.window.showInformationMessage(
        'Env Doctor found no project to generate an example for.',
      );
      return;
    }
    const cfg = vscode.workspace.getConfiguration('envDoctor');
    const refs = report.references
      .filter((r) => project.sourceFiles.includes(r.file) && !r.dynamic && !r.ignored)
      .map((r) => r.name);
    const parser = new DotenvParser();
    const transientEnvFiles = [];
    for (const envFile of project.envFiles) {
      try {
        const content = await fs.readFile(envFile.path, 'utf8');
        const parsed = parser.parse(content, envFile.path);
        parsed.packageRoot = project.packageRoot;
        transientEnvFiles.push(parsed);
      } catch {
        // The scan already reports unreadable env files; generation can continue from source references.
      }
    }
    const generated = generateEnvExample(transientEnvFiles, {
      preserveNonSecretDefaults: cfg.get<boolean>('preserveNonSecretDefaults', false),
      placeholders: cfg.get<Record<string, string>>('examplePlaceholders', {}),
      additionalNames: refs,
    });
    const target = path.join(project.packageRoot, '.env.example');
    let current = '';
    let exists = true;
    try {
      current = await fs.readFile(target, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false;
      else {
        void vscode.window.showErrorMessage(
          'Env Doctor could not read .env.example. Check file permissions.',
        );
        return;
      }
    }
    const token = encodeURIComponent(project.packageRoot);
    const left = vscode.Uri.parse(`env-doctor-preview:/current/${token}.env`);
    const right = vscode.Uri.parse(`env-doctor-preview:/generated/${token}.env`);
    this.preview.set(left, current);
    this.preview.set(right, generated);
    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      strings.generatedExampleTitle,
      { preview: true },
    );
    const action = await vscode.window.showInformationMessage(
      exists
        ? 'Write the generated .env.example? Existing content will be replaced.'
        : 'Write the generated .env.example?',
      { modal: exists },
      'Write',
    );
    if (action !== 'Write') return;
    try {
      await fs.writeFile(target, generated, 'utf8');
      this.invalidate(target);
      await this.scan(false, false);
      void vscode.window.showInformationMessage(
        'Env Doctor wrote .env.example without copying secret values.',
      );
    } catch {
      void vscode.window.showErrorMessage(
        'Env Doctor could not write .env.example. Check file permissions.',
      );
    }
  }

  dispose(): void {
    this.scanAbort?.abort();
    if (this.debounce) clearTimeout(this.debounce);
    for (const disposable of this.disposables) disposable.dispose();
  }
}
