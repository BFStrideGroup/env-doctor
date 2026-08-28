import * as vscode from 'vscode';
import { ScanOptions, Severity } from '../core/models';
import { defaultScanOptions } from '../core/services';

function severity(value: string, fallback: Severity): Severity | 'off' {
  return ['error', 'warning', 'information', 'off'].includes(value)
    ? (value as Severity | 'off')
    : fallback;
}

export function readScanOptions(): ScanOptions {
  const base = defaultScanOptions();
  const cfg = vscode.workspace.getConfiguration('envDoctor');
  return {
    exclude: cfg.get<string[]>('exclude', base.exclude),
    envFiles: cfg.get<string[]>('envFiles', base.envFiles),
    compareEnvFiles: cfg.get<string[]>('compareEnvFiles', base.compareEnvFiles),
    maxFileSizeKb: cfg.get<number>('maxFileSizeKb', base.maxFileSizeKb),
    maxFiles: cfg.get<number>('maxFiles', base.maxFiles),
    scanGitTrackedEnvFiles: cfg.get<boolean>('scanGitTrackedEnvFiles', base.scanGitTrackedEnvFiles),
    severity: {
      missing: severity(cfg.get<string>('missingSeverity', 'warning'), 'warning'),
      unused: severity(cfg.get<string>('unusedSeverity', 'information'), 'information'),
      secret: severity(cfg.get<string>('secretSeverity', 'error'), 'error'),
      inconsistent: severity(cfg.get<string>('inconsistentSeverity', 'information'), 'information'),
      validation: severity(cfg.get<string>('validationSeverity', 'warning'), 'warning'),
      parse: severity(cfg.get<string>('parseSeverity', 'warning'), 'warning'),
    },
  };
}
