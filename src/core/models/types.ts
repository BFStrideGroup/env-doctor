export type Confidence = 'high' | 'medium' | 'low';
export type Severity = 'error' | 'warning' | 'information';
export type IssueKind = 'missing' | 'unused' | 'inconsistent' | 'secret' | 'validation' | 'parse';

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface EnvReference extends SourceLocation {
  name: string;
  language: string;
  accessType: string;
  confidence: Confidence;
  public?: boolean;
  optional?: boolean;
  dynamic?: boolean;
  ignored?: boolean;
}

export interface EnvDefinition extends SourceLocation {
  name: string;
  value: string;
  quoted: boolean;
  exported: boolean;
  isExample: boolean;
  ignored?: boolean;
}

export interface EnvFile {
  path: string;
  name: string;
  packageRoot: string;
  definitions: EnvDefinition[];
  errors: ParseError[];
}

export interface ParseError extends SourceLocation {
  message: string;
  code: string;
}

export interface SecretFinding extends SourceLocation {
  ruleId: string;
  variableName?: string;
  confidence: Confidence;
  maskedPreview: string;
  message: string;
}

export interface EnvIssue {
  id: string;
  kind: IssueKind;
  name?: string;
  message: string;
  severity: Severity;
  confidence: Confidence;
  location?: SourceLocation;
  related?: SourceLocation[];
  packageRoot: string;
  ruleId?: string;
  details?: Record<string, unknown>;
}

export interface EnvEnvironment {
  name: string;
  file: string;
  variables: string[];
}

export interface EnvProject {
  root: string;
  packageRoot: string;
  name: string;
  frameworks: string[];
  sourceFiles: string[];
  envFiles: EnvFile[];
}

export interface EnvReportSummary {
  valid: number;
  missing: number;
  unused: number;
  secrets: number;
  inconsistent: number;
  validation: number;
  parse: number;
}

export interface EnvReport {
  workspaceRoot: string;
  generatedAt: string;
  projects: EnvProject[];
  references: EnvReference[];
  envFiles: EnvFile[];
  issues: EnvIssue[];
  secretFindings: SecretFinding[];
  environments: EnvEnvironment[];
  summary: EnvReportSummary;
  scan: {
    filesConsidered: number;
    filesParsed: number;
    cacheHits: number;
    durationMs: number;
    warnings: string[];
  };
}

export interface Rule {
  required?: boolean;
  optional?: boolean;
  secret?: boolean;
  url?: boolean;
  integer?: boolean;
  boolean?: boolean;
  regex?: string;
  allowedValues?: string[];
}

export interface ValidationResult {
  name: string;
  valid: boolean;
  checks: Array<{ rule: string; valid: boolean; message: string }>;
}

export interface LicenseInfo {
  tier: 'free' | 'pro';
  source: 'none' | 'development' | 'license';
  expiresAt?: string;
}

export interface IgnoreConfig {
  ignoredVariables: string[];
  ignoredFiles: string[];
  ignoredRules: string[];
  rules: Record<string, Rule>;
  compareEnvFiles?: string[];
  envFiles?: string[];
}

export interface AnalysisContext {
  workspaceRoot: string;
  project: EnvProject;
  references: EnvReference[];
  envFiles: EnvFile[];
  secretFindings: SecretFinding[];
  ignore: IgnoreConfig;
  dynamicReferencePresent: boolean;
}

export interface ScanOptions {
  exclude: string[];
  envFiles: string[];
  compareEnvFiles: string[];
  maxFileSizeKb: number;
  maxFiles: number;
  severity: {
    missing: Severity | 'off';
    unused: Severity | 'off';
    secret: Severity | 'off';
    inconsistent: Severity | 'off';
    validation: Severity | 'off';
    parse: Severity | 'off';
  };
  scanGitTrackedEnvFiles: boolean;
}

export interface LanguageDetector {
  id: string;
  supports(filePath: string): boolean;
  detectReferences(source: string, filePath: string): Promise<EnvReference[]>;
}

export interface EnvFileParser {
  supports(filePath: string): boolean;
  parse(content: string, filePath: string): EnvFile;
}

export interface Analyzer {
  id: string;
  analyze(context: AnalysisContext): Promise<EnvIssue[]>;
}
