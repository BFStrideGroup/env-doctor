import { stableId } from '../../utils/ids';
import { isSensitiveName } from '../../utils/security';
import { AnalysisContext, Analyzer, EnvIssue } from '../models';

const EXPLICITLY_PUBLIC_NAME = /(PUBLISHABLE|PUBLIC_KEY|CLIENT_ID|ANALYTICS)/i;

export class PublicExposureAnalyzer implements Analyzer {
  readonly id = 'secret.publicEnvironmentVariable';

  async analyze(context: AnalysisContext): Promise<EnvIssue[]> {
    const byName = new Map<string, typeof context.references>();
    for (const reference of context.references) {
      if (
        !reference.public ||
        reference.dynamic ||
        !isSensitiveName(reference.name) ||
        EXPLICITLY_PUBLIC_NAME.test(reference.name)
      ) {
        continue;
      }
      const references = byName.get(reference.name) ?? [];
      references.push(reference);
      byName.set(reference.name, references);
    }

    const issues: EnvIssue[] = [];
    for (const [name, references] of byName) {
      const first = references[0];
      issues.push({
        id: stableId(this.id, context.project.packageRoot, name),
        kind: 'secret',
        name,
        message: `${name} uses a client-visible environment prefix and has a credential-like name. Verify that its value is safe to bundle into client code.`,
        severity: 'error',
        confidence: 'medium',
        location: first,
        related: references.slice(1),
        packageRoot: context.project.packageRoot,
        ruleId: this.id,
      });
    }
    return issues;
  }
}
