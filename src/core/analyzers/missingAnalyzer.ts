import { Analyzer, AnalysisContext, EnvIssue } from '../models';
import { stableId } from '../../utils/ids';
import { isRuntimeProvidedVariable } from '../services/runtimeVariables';

export class MissingAnalyzer implements Analyzer {
  readonly id = 'missing';
  async analyze(context: AnalysisContext): Promise<EnvIssue[]> {
    const ignored = new Set(context.ignore.ignoredVariables);
    const runtimeDefs = new Set(
      context.envFiles.flatMap((f) => f.definitions.filter((d) => !d.isExample).map((d) => d.name)),
    );
    const exampleDefs = new Set(
      context.envFiles.flatMap((f) => f.definitions.filter((d) => d.isExample).map((d) => d.name)),
    );
    const refs = context.references.filter(
      (r) =>
        !r.dynamic &&
        !r.optional &&
        !r.ignored &&
        !ignored.has(r.name) &&
        !isRuntimeProvidedVariable(r.name),
    );
    const byName = new Map<string, typeof refs>();
    for (const ref of refs) byName.set(ref.name, [...(byName.get(ref.name) ?? []), ref]);

    const issues: EnvIssue[] = [];
    for (const [name, usages] of byName) {
      if (runtimeDefs.has(name)) continue;
      const onlyDocumented = exampleDefs.has(name);
      const first = usages[0];
      issues.push({
        id: stableId(this.id, context.project.packageRoot, name),
        kind: 'missing',
        name,
        message: onlyDocumented
          ? `${name} is referenced but only documented in an example env file.`
          : `${name} is referenced but not defined in a runtime env file.`,
        severity: 'warning',
        confidence: onlyDocumented ? 'medium' : 'high',
        location: first,
        related: usages.slice(1),
        packageRoot: context.project.packageRoot,
        ruleId: this.id,
        details: { documentedInExample: onlyDocumented },
      });
    }

    for (const [name, rule] of Object.entries(context.ignore.rules)) {
      if (rule.required && !runtimeDefs.has(name) && !ignored.has(name) && !byName.has(name)) {
        issues.push({
          id: stableId('required', context.project.packageRoot, name),
          kind: 'missing',
          name,
          message: `${name} is required by .envdoctorrc but is not defined.`,
          severity: 'error',
          confidence: 'high',
          packageRoot: context.project.packageRoot,
          ruleId: 'required',
        });
      }
    }
    return issues;
  }
}
