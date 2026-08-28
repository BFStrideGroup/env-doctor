import path from 'node:path';
import { Analyzer, AnalysisContext, EnvIssue } from '../models';
import { stableId } from '../../utils/ids';

export class ComparisonAnalyzer implements Analyzer {
  readonly id = 'inconsistent';
  constructor(private readonly compareNames: string[]) {}

  async analyze(context: AnalysisContext): Promise<EnvIssue[]> {
    const wanted = context.ignore.compareEnvFiles?.length
      ? context.ignore.compareEnvFiles
      : this.compareNames;
    const files = context.envFiles.filter((f) => wanted.includes(path.basename(f.path)));
    if (files.length < 2) return [];
    const allNames = new Set(files.flatMap((f) => f.definitions.map((d) => d.name)));
    const issues: EnvIssue[] = [];
    for (const name of allNames) {
      const present = files.filter((f) => f.definitions.some((d) => d.name === name));
      const missing = files.filter((f) => !f.definitions.some((d) => d.name === name));
      if (!missing.length) continue;
      const location = present[0]?.definitions.find((d) => d.name === name);
      issues.push({
        id: stableId(
          this.id,
          context.project.packageRoot,
          name,
          missing.map((f) => f.name).join(','),
        ),
        kind: 'inconsistent',
        name,
        message: `${name} is missing from ${missing.map((f) => f.name).join(', ')}.`,
        severity: 'information',
        confidence: 'high',
        location,
        packageRoot: context.project.packageRoot,
        ruleId: this.id,
        details: { presentIn: present.map((f) => f.name), missingFrom: missing.map((f) => f.name) },
      });
    }
    return issues;
  }
}
