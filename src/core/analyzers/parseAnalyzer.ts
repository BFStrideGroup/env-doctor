import { Analyzer, AnalysisContext, EnvIssue } from '../models';
import { stableId } from '../../utils/ids';

export class ParseAnalyzer implements Analyzer {
  readonly id = 'parse';
  async analyze(context: AnalysisContext): Promise<EnvIssue[]> {
    return context.envFiles.flatMap((f) =>
      f.errors.map((e) => ({
        id: stableId(this.id, e.file, e.line, e.code),
        kind: 'parse' as const,
        message: e.message,
        severity: 'warning' as const,
        confidence: 'high' as const,
        location: e,
        packageRoot: context.project.packageRoot,
        ruleId: e.code,
      })),
    );
  }
}
