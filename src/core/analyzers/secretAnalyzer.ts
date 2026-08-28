import { Analyzer, AnalysisContext, EnvIssue } from '../models';
import { stableId } from '../../utils/ids';

export class SecretAnalyzer implements Analyzer {
  readonly id = 'secret';
  async analyze(context: AnalysisContext): Promise<EnvIssue[]> {
    const ignoredRules = new Set(context.ignore.ignoredRules);
    return context.secretFindings
      .filter((finding) => !ignoredRules.has(finding.ruleId))
      .map((finding) => ({
        id: stableId(this.id, finding.file, finding.line, finding.column, finding.ruleId),
        kind: 'secret' as const,
        name: finding.variableName,
        message: finding.message,
        severity: 'error' as const,
        confidence: finding.confidence,
        location: finding,
        packageRoot: context.project.packageRoot,
        ruleId: finding.ruleId,
        details: { maskedPreview: finding.maskedPreview },
      }));
  }
}
