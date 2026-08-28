import path from 'node:path';
import { EnvReport } from '../models';
import { relativeDisplay } from '../../utils/paths';

export function toSafeReport(report: EnvReport): Record<string, unknown> {
  const root = report.workspaceRoot;
  return {
    workspaceRoot: path.basename(root),
    generatedAt: report.generatedAt,
    projects: report.projects.map((p) => ({
      name: p.name,
      packageRoot: relativeDisplay(root, p.packageRoot),
      frameworks: p.frameworks,
      sourceFileCount: p.sourceFiles.length,
      envFiles: p.envFiles.map((f) => relativeDisplay(root, f.path)),
    })),
    issues: report.issues.map((i) => ({
      id: i.id,
      kind: i.kind,
      name: i.name,
      message: i.message,
      severity: i.severity,
      confidence: i.confidence,
      ruleId: i.ruleId,
      packageRoot: relativeDisplay(root, i.packageRoot),
      location: i.location
        ? {
            file: relativeDisplay(root, i.location.file),
            line: i.location.line,
            column: i.location.column,
          }
        : undefined,
      related: i.related?.map((r) => ({
        file: relativeDisplay(root, r.file),
        line: r.line,
        column: r.column,
      })),
    })),
    environments: report.environments.map((e) => ({
      name: e.name,
      file: relativeDisplay(root, e.file),
      variables: e.variables,
    })),
    summary: report.summary,
    scan: report.scan,
  };
}
