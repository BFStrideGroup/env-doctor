import path from 'node:path';
import {
  ComparisonAnalyzer,
  MissingAnalyzer,
  ParseAnalyzer,
  PublicExposureAnalyzer,
  SecretAnalyzer,
  UnusedAnalyzer,
  ValidationAnalyzer,
} from '../analyzers';
import { EnvEnvironment, EnvFile, EnvIssue, EnvReport, ScanOptions, Severity } from '../models';
import { loadIgnoreConfig } from '../rules';
import { IncrementalScanner } from '../../scanner';
import { matchesAnyGlob } from '../../utils/glob';
import { relativeDisplay } from '../../utils/paths';

const DEFAULT_OPTIONS: ScanOptions = {
  exclude: [
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/vendor/**',
    '**/.venv/**',
    '**/venv/**',
    '**/generated/**',
  ],
  envFiles: [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
    '.env.production',
    '.env.production.local',
    '.env.test',
    '.env.test.local',
    '.env.example',
    '.env.sample',
  ],
  compareEnvFiles: ['.env.local', '.env.production', '.env.example'],
  maxFileSizeKb: 1024,
  maxFiles: 30000,
  severity: {
    missing: 'warning',
    unused: 'information',
    secret: 'error',
    inconsistent: 'information',
    validation: 'warning',
    parse: 'warning',
  },
  scanGitTrackedEnvFiles: true,
};

export class EnvDoctorEngine {
  readonly scanner = new IncrementalScanner();

  async scanWorkspace(
    root: string,
    partial: Partial<ScanOptions> = {},
    signal?: AbortSignal,
  ): Promise<EnvReport> {
    const started = Date.now();
    const options: ScanOptions = {
      ...DEFAULT_OPTIONS,
      ...partial,
      severity: { ...DEFAULT_OPTIONS.severity, ...(partial.severity ?? {}) },
      exclude: partial.exclude ?? DEFAULT_OPTIONS.exclude,
      envFiles: partial.envFiles ?? DEFAULT_OPTIONS.envFiles,
      compareEnvFiles: partial.compareEnvFiles ?? DEFAULT_OPTIONS.compareEnvFiles,
      scanGitTrackedEnvFiles:
        partial.scanGitTrackedEnvFiles ?? DEFAULT_OPTIONS.scanGitTrackedEnvFiles,
    };
    const { config: ignore, warning } = await loadIgnoreConfig(root);
    const scan = await this.scanner.scan(root, options, ignore, signal);
    if (warning) scan.warnings.push(warning);
    const issues: EnvIssue[] = [];
    const effectiveReferences: typeof scan.references = [];
    const effectiveSecretFindings: typeof scan.secretFindings = [];
    const effectiveEnvFiles: EnvFile[] = [];
    const effectiveEnvPathsByProject = new Map<string, Set<string>>();

    for (const project of scan.projects) {
      const projectIgnore = scan.projectConfigs.get(project.packageRoot) ?? ignore;
      const sourceSet = new Set(project.sourceFiles);
      const ignoredFile = (file: string): boolean =>
        matchesAnyGlob(relativeDisplay(project.packageRoot, file), projectIgnore.ignoredFiles);
      const ignoredVariables = new Set(projectIgnore.ignoredVariables);
      const refs = scan.references.filter(
        (ref) =>
          sourceSet.has(ref.file) &&
          !ignoredFile(ref.file) &&
          !ref.ignored &&
          !ignoredVariables.has(ref.name),
      );
      const envFiles = project.envFiles.filter((file) => !ignoredFile(file.path));
      const projectFileSet = new Set([...sourceSet, ...envFiles.map((file) => file.path)]);
      const secrets = scan.secretFindings.filter(
        (finding) => projectFileSet.has(finding.file) && !ignoredFile(finding.file),
      );
      effectiveReferences.push(...refs);
      effectiveSecretFindings.push(...secrets);
      effectiveEnvFiles.push(...envFiles);
      effectiveEnvPathsByProject.set(
        project.packageRoot,
        new Set(envFiles.map((file) => file.path)),
      );
      const context = {
        workspaceRoot: root,
        project,
        references: refs,
        envFiles,
        secretFindings: secrets,
        ignore: projectIgnore,
        dynamicReferencePresent: refs.some((r) => r.dynamic && !r.ignored),
      };
      const analyzers = [
        new MissingAnalyzer(),
        new UnusedAnalyzer(),
        new ComparisonAnalyzer(options.compareEnvFiles),
        new ValidationAnalyzer(),
        new SecretAnalyzer(),
        new PublicExposureAnalyzer(),
        new ParseAnalyzer(),
      ];
      const ignoredRules = new Set(projectIgnore.ignoredRules);
      for (const analyzer of analyzers) {
        const analyzed = await analyzer.analyze(context);
        issues.push(
          ...analyzed.filter(
            (issue) => !ignoredRules.has(issue.kind) && !ignoredRules.has(issue.ruleId ?? ''),
          ),
        );
      }
    }

    const filtered = this.applySeverity(issues, options);
    const environments: EnvEnvironment[] = effectiveEnvFiles.map((file) => ({
      name: path.basename(file.path),
      file: file.path,
      variables: [...new Set(file.definitions.map((def) => def.name))].sort(),
    }));
    const redactedEnvFiles = effectiveEnvFiles.map(redactEnvFile);
    const redactedByPath = new Map(redactedEnvFiles.map((file) => [file.path, file]));
    const redactedProjects = scan.projects.map((project) => {
      const allowed = effectiveEnvPathsByProject.get(project.packageRoot) ?? new Set<string>();
      return {
        ...project,
        envFiles: project.envFiles
          .filter((file) => allowed.has(file.path))
          .map((file) => redactedByPath.get(file.path) ?? redactEnvFile(file)),
      };
    });
    const missingNames = new Set(
      filtered.filter((issue) => issue.kind === 'missing').map((i) => `${i.packageRoot}:${i.name}`),
    );
    const allReferenceNames = new Set(
      effectiveReferences
        .filter((r) => !r.dynamic)
        .map((r) => `${this.projectRootForFile(scan.projects, r.file)}:${r.name}`),
    );
    const valid = [...allReferenceNames].filter((key) => !missingNames.has(key)).length;

    return {
      workspaceRoot: root,
      generatedAt: new Date().toISOString(),
      projects: redactedProjects,
      references: effectiveReferences,
      envFiles: redactedEnvFiles,
      issues: filtered,
      secretFindings: effectiveSecretFindings,
      environments,
      summary: {
        valid,
        missing: filtered.filter((i) => i.kind === 'missing').length,
        unused: filtered.filter((i) => i.kind === 'unused').length,
        secrets: filtered.filter((i) => i.kind === 'secret').length,
        inconsistent: filtered.filter((i) => i.kind === 'inconsistent').length,
        validation: filtered.filter((i) => i.kind === 'validation').length,
        parse: filtered.filter((i) => i.kind === 'parse').length,
      },
      scan: {
        filesConsidered: scan.filesConsidered,
        filesParsed: scan.filesParsed,
        cacheHits: scan.cacheHits,
        durationMs: Date.now() - started,
        warnings: scan.warnings,
      },
    };
  }

  private applySeverity(issues: EnvIssue[], options: ScanOptions): EnvIssue[] {
    const byKind: Partial<Record<EnvIssue['kind'], Severity | 'off'>> = {
      missing: options.severity.missing,
      unused: options.severity.unused,
      secret: options.severity.secret,
      inconsistent: options.severity.inconsistent,
      validation: options.severity.validation,
      parse: options.severity.parse,
    };
    return issues.flatMap((issue) => {
      const configured = byKind[issue.kind];
      if (configured === 'off') return [];
      if (configured) return [{ ...issue, severity: configured }];
      return [issue];
    });
  }

  private projectRootForFile(projects: EnvReport['projects'], file: string): string {
    return (
      projects.find((p) => p.sourceFiles.includes(file))?.packageRoot ??
      projects[0]?.packageRoot ??
      ''
    );
  }
}

function redactEnvFile(file: EnvFile): EnvFile {
  return {
    ...file,
    definitions: file.definitions.map((definition) => ({ ...definition, value: '' })),
  };
}

export function defaultScanOptions(): ScanOptions {
  return JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as ScanOptions;
}
