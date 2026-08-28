#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { EnvDoctorEngine, toSafeReport } from '../core/services';
import { relativeDisplay } from '../utils/paths';

interface Args {
  command: string;
  format: 'human' | 'json' | 'github';
  root: string;
  help: boolean;
  scanGitTrackedEnvFiles: boolean;
}

function parseArgs(argv: string[]): Args {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'check';
  let format: Args['format'] = 'human';
  let root = process.cwd();
  let help = false;
  let scanGitTrackedEnvFiles = true;
  for (let i = 0; i < argv.length; i++) {
    if (i === 0 && argv[i] === command && command !== 'check') continue;
    if (i === 0 && argv[i] === 'check') continue;
    if (argv[i] === '--help' || argv[i] === '-h') help = true;
    else if (argv[i] === '--no-git') scanGitTrackedEnvFiles = false;
    else if (argv[i] === '--format' && argv[i + 1]) format = argv[++i] as Args['format'];
    else if (argv[i].startsWith('--format='))
      format = argv[i].slice('--format='.length) as Args['format'];
    else if (argv[i] === '--root' && argv[i + 1]) root = path.resolve(argv[++i]);
    else if (argv[i].startsWith('--root=')) root = path.resolve(argv[i].slice('--root='.length));
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!['human', 'json', 'github'].includes(format))
    throw new Error('Supported formats: human, json, github.');
  if (command !== 'check' && !help)
    throw new Error(
      'Usage: env-doctor check [--format human|json|github] [--root PATH] [--no-git]',
    );
  return { command, format, root, help, scanGitTrackedEnvFiles };
}

function printHelp(): void {
  console.log(`Env Doctor

Usage:
  env-doctor check [--format human|json|github] [--root PATH] [--no-git]

Options:
  --format   Select human, sanitized JSON, or GitHub annotation output.
  --root     Scan a specific workspace root (defaults to the current directory).
  --no-git   Disable detection of credential-like values in Git-tracked env files.
  -h, --help Show this help.`);
}

function printHuman(report: Awaited<ReturnType<EnvDoctorEngine['scanWorkspace']>>): void {
  console.log('Env Doctor');
  console.log('');
  const failure =
    report.summary.missing ||
    report.summary.secrets ||
    report.summary.validation ||
    report.summary.parse;
  console.log(failure ? '❌ Configuration validation failed' : '✓ Configuration validation passed');
  console.log('');
  const sections: Array<[string, typeof report.issues]> = [
    ['Missing', report.issues.filter((i) => i.kind === 'missing')],
    ['Unused', report.issues.filter((i) => i.kind === 'unused')],
    ['Secrets', report.issues.filter((i) => i.kind === 'secret')],
    ['Inconsistent', report.issues.filter((i) => i.kind === 'inconsistent')],
    ['Validation', report.issues.filter((i) => i.kind === 'validation')],
    ['Parse problems', report.issues.filter((i) => i.kind === 'parse')],
  ];
  for (const [title, issues] of sections) {
    if (!issues.length) continue;
    console.log(`${title}:`);
    for (const issue of issues) {
      const loc = issue.location
        ? ` (${relativeDisplay(report.workspaceRoot, issue.location.file)}:${issue.location.line})`
        : '';
      console.log(`  ${issue.name ?? issue.ruleId ?? issue.kind}${loc}`);
    }
    console.log('');
  }
  console.log(
    `Scanned ${report.scan.filesConsidered} files in ${report.scan.durationMs}ms (${report.scan.cacheHits} cache hits).`,
  );
}

function printGithub(report: Awaited<ReturnType<EnvDoctorEngine['scanWorkspace']>>): void {
  const escapeData = (value: string): string =>
    value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escapeProperty = (value: string): string =>
    escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
  for (const issue of report.issues) {
    const level =
      issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'notice';
    const loc = issue.location;
    const metadata = loc
      ? ` file=${escapeProperty(relativeDisplay(report.workspaceRoot, loc.file))},line=${loc.line},col=${loc.column}`
      : '';
    const message = escapeData(issue.message);
    console.log(`::${level}${metadata}::Env Doctor: ${message}`);
  }
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }
    const engine = new EnvDoctorEngine();
    const report = await engine.scanWorkspace(args.root, {
      scanGitTrackedEnvFiles: args.scanGitTrackedEnvFiles,
    });
    if (args.format === 'json') console.log(JSON.stringify(toSafeReport(report), null, 2));
    else if (args.format === 'github') printGithub(report);
    else printHuman(report);
    process.exitCode =
      report.summary.missing > 0 ||
      report.summary.secrets > 0 ||
      report.summary.validation > 0 ||
      report.summary.parse > 0
        ? 1
        : 0;
  } catch (error) {
    console.error(`Env Doctor: ${error instanceof Error ? error.message : 'Unknown CLI error'}`);
    process.exitCode = 2;
  }
}

void main();
