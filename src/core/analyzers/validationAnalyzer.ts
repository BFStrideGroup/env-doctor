import { Analyzer, AnalysisContext, EnvIssue } from '../models';
import { stableId } from '../../utils/ids';
import { validateValue } from '../validators';

export class ValidationAnalyzer implements Analyzer {
  readonly id = 'validation';
  async analyze(context: AnalysisContext): Promise<EnvIssue[]> {
    const defs = new Map<string, ReturnType<typeof firstDefinition>>();
    for (const name of Object.keys(context.ignore.rules))
      defs.set(name, firstDefinition(context, name));
    const issues: EnvIssue[] = [];
    for (const [name, rule] of Object.entries(context.ignore.rules)) {
      const def = defs.get(name);
      if (!def) continue;
      const result = validateValue(name, def.value, rule);
      for (const check of result.checks.filter((c) => !c.valid)) {
        issues.push({
          id: stableId(this.id, context.project.packageRoot, name, check.rule),
          kind: 'validation',
          name,
          message: `${name}: ${check.message}`,
          severity: 'warning',
          confidence: 'high',
          location: def,
          packageRoot: context.project.packageRoot,
          ruleId: `validation.${check.rule}`,
        });
      }
    }
    return issues;
  }
}

function firstDefinition(context: AnalysisContext, name: string) {
  return context.envFiles
    .flatMap((file) => file.definitions)
    .find((def) => def.name === name && !def.isExample);
}
