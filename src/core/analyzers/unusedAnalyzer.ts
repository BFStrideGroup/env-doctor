import { Analyzer, AnalysisContext, EnvIssue } from '../models';
import { stableId } from '../../utils/ids';
import { isConventionallyRuntimeConsumed } from '../services/runtimeVariables';

export class UnusedAnalyzer implements Analyzer {
  readonly id = 'unused';
  async analyze(context: AnalysisContext): Promise<EnvIssue[]> {
    const ignored = new Set(context.ignore.ignoredVariables);
    const used = new Set(
      context.references.filter((r) => !r.dynamic && !r.ignored).map((r) => r.name),
    );
    const defs = context.envFiles
      .flatMap((f) => f.definitions)
      .filter((d) => !d.ignored && !ignored.has(d.name));
    const firstByName = new Map<string, (typeof defs)[number]>();
    for (const def of defs) if (!firstByName.has(def.name)) firstByName.set(def.name, def);
    const issues: EnvIssue[] = [];
    for (const [name, def] of firstByName) {
      if (used.has(name) || isConventionallyRuntimeConsumed(name)) continue;
      const uncertain = context.dynamicReferencePresent || def.isExample;
      issues.push({
        id: stableId(this.id, context.project.packageRoot, name),
        kind: 'unused',
        name,
        message: uncertain
          ? `${name} may be unused; dynamic access or example-file semantics prevent certainty.`
          : `${name} is defined but no usage was detected.`,
        severity: 'information',
        confidence: uncertain ? 'low' : 'high',
        location: def,
        packageRoot: context.project.packageRoot,
        ruleId: this.id,
      });
    }
    return issues;
  }
}
