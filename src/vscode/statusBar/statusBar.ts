import * as vscode from 'vscode';
import { EnvReport } from '../../core/models';
import { strings } from '../strings';

export class EnvDoctorStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);

  constructor() {
    this.item.command = 'envDoctor.showReport';
    this.item.name = 'Env Doctor';
    this.item.tooltip = 'Open the Env Doctor report';
  }

  setScanning(): void {
    if (!this.enabled()) return;
    this.item.text = '$(sync~spin) Env Doctor';
    this.item.tooltip = strings.scanRunning;
    this.item.show();
  }

  update(report: EnvReport | undefined): void {
    if (!this.enabled()) {
      this.item.hide();
      return;
    }
    if (!report) {
      this.item.text = '$(beaker) Env Doctor';
      this.item.show();
      return;
    }
    const problems = report.summary.missing + report.summary.secrets + report.summary.validation;
    const warnings = report.summary.unused + report.summary.inconsistent + report.summary.parse;
    if (problems > 0) {
      this.item.text = `$(error) Env Doctor: ${problems} problem${problems === 1 ? '' : 's'}`;
    } else if (warnings > 0) {
      this.item.text = `$(warning) Env Doctor: ${warnings}`;
    } else {
      this.item.text = '$(pass-filled) Env Doctor: ✓';
    }
    this.item.tooltip = `${report.summary.missing} missing, ${report.summary.unused} unused, ${report.summary.secrets} possible secrets, ${report.summary.inconsistent} inconsistencies, ${report.summary.parse} parse problems`;
    this.item.show();
  }

  private enabled(): boolean {
    return vscode.workspace.getConfiguration('envDoctor').get<boolean>('showStatusBar', true);
  }
  dispose(): void {
    this.item.dispose();
  }
}
