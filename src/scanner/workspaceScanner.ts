import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DotenvParser } from '../parsers/dotenv';
import { JsTsDetector } from '../parsers/javascript';
import { PythonDetector } from '../parsers/python';
import { PhpDetector } from '../parsers/php';
import { DockerDetector } from '../parsers/docker';
import { ShellDetector } from '../parsers/shell';
import {
  EnvFile,
  EnvProject,
  EnvReference,
  IgnoreConfig,
  LanguageDetector,
  ScanOptions,
  SecretFinding,
} from '../core/models';
import { loadIgnoreConfig } from '../core/rules';
import { detectFrameworks } from '../core/services/frameworkDetector';
import { detectSecrets, detectTrackedEnvSecrets } from '../core/services/secretDetector';
import { nearestRoot, normalizePath } from '../utils/paths';
import { matchesAnyGlob, matchesGlob } from '../utils/glob';

interface CacheEntry {
  mtimeMs: number;
  size: number;
  references: EnvReference[];
  secrets: SecretFinding[];
}

export interface WorkspaceScanResult {
  projects: EnvProject[];
  references: EnvReference[];
  envFiles: EnvFile[];
  secretFindings: SecretFinding[];
  filesConsidered: number;
  filesParsed: number;
  cacheHits: number;
  warnings: string[];
  projectConfigs: Map<string, IgnoreConfig>;
}

const execFileAsync = promisify(execFile);
const SOURCE_EXTENSIONS = new Set([
  '.bash',
  '.cfg',
  '.cjs',
  '.conf',
  '.config',
  '.cs',
  '.cts',
  '.go',
  '.gradle',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.ksh',
  '.mjs',
  '.mts',
  '.php',
  '.properties',
  '.ps1',
  '.py',
  '.rb',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
]);
const PACKAGE_MARKERS = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'composer.json',
]);
const SPECIAL_SOURCE_FILES = new Set(['dockerfile', 'makefile', 'procfile']);
const GENERATED_FILE_RE = /(?:\.min\.(?:js|css)$|\.bundle\.(?:js|css)$|\.map$|(?:^|\.)lock$)/i;
const LOCK_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'composer.lock',
]);

function sourceCandidate(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (GENERATED_FILE_RE.test(base) || LOCK_FILES.has(base)) return false;
  return (
    SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ||
    SPECIAL_SOURCE_FILES.has(base) ||
    base.startsWith('dockerfile.')
  );
}

function configuredEnvMatch(rel: string, filePath: string, configured: string[]): boolean {
  const base = path.basename(filePath);
  return configured.some((entry) => {
    const normalized = entry.replace(/\\/g, '/');
    if (/[*?]/.test(normalized)) return matchesGlob(rel, normalized);
    return normalized.includes('/') ? rel === normalized : base === normalized;
  });
}

async function walkMatchingFiles(
  root: string,
  exclude: string[],
  maxMatches: number,
  accepts: (relativePath: string, absolutePath: string, name: string) => boolean,
  signal?: AbortSignal,
): Promise<{ files: string[]; hitLimit: boolean }> {
  const files: string[] = [];
  let hitLimit = false;
  const stack = [''];
  while (stack.length) {
    if (signal?.aborted) throw new Error('ScanCancelled');
    const relDir = stack.pop()!;
    const absDir = path.join(root, relDir);
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = path.posix.join(relDir.replace(/\\/g, '/'), entry.name);
      if (entry.isSymbolicLink()) continue;
      if (matchesAnyGlob(rel, exclude)) continue;
      if (entry.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      const abs = normalizePath(path.join(root, rel));
      const candidate = accepts(rel, abs, entry.name);
      if (!candidate) continue;
      files.push(abs);
      if (files.length >= maxMatches) {
        hitLimit = true;
        return { files, hitLimit };
      }
    }
  }
  return { files, hitLimit };
}

async function walkFiles(
  root: string,
  exclude: string[],
  maxMatches: number,
  envFiles: string[],
  signal?: AbortSignal,
): Promise<{ files: string[]; hitLimit: boolean }> {
  return walkMatchingFiles(
    root,
    exclude,
    maxMatches,
    (relativePath, absolutePath, name) =>
      sourceCandidate(absolutePath) ||
      configuredEnvMatch(relativePath, absolutePath, envFiles) ||
      PACKAGE_MARKERS.has(name),
    signal,
  );
}

function mergeIgnoreConfig(base: IgnoreConfig, local: IgnoreConfig): IgnoreConfig {
  return {
    ignoredVariables: [...new Set([...base.ignoredVariables, ...local.ignoredVariables])],
    ignoredFiles: [...new Set([...base.ignoredFiles, ...local.ignoredFiles])],
    ignoredRules: [...new Set([...base.ignoredRules, ...local.ignoredRules])],
    rules: { ...base.rules, ...local.rules },
    compareEnvFiles: local.compareEnvFiles?.length ? local.compareEnvFiles : base.compareEnvFiles,
    envFiles: local.envFiles?.length ? local.envFiles : base.envFiles,
  };
}

async function gitTrackedFiles(
  root: string,
  enabled: boolean,
  signal?: AbortSignal,
): Promise<Set<string>> {
  if (!enabled) return new Set();
  try {
    await fs.access(path.join(root, '.git'));
    if (signal?.aborted) throw new Error('ScanCancelled');
    const result = await execFileAsync('git', ['-C', root, 'ls-files', '-z', '--cached'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      signal,
      windowsHide: true,
    });
    return new Set(
      result.stdout
        .split('\0')
        .filter(Boolean)
        .map((relativePath) => normalizePath(path.join(root, relativePath))),
    );
  } catch (error) {
    if (signal?.aborted) throw new Error('ScanCancelled', { cause: error });
    return new Set();
  }
}

export class WorkspaceScanner {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly dotenv = new DotenvParser();
  private readonly detectors: LanguageDetector[] = [
    new JsTsDetector(),
    new PythonDetector(),
    new PhpDetector(),
    new DockerDetector(),
    new ShellDetector(),
  ];

  invalidate(filePath?: string): void {
    if (!filePath) this.cache.clear();
    else this.cache.delete(normalizePath(filePath));
  }
  cacheSize(): number {
    return this.cache.size;
  }

  async scan(
    rootInput: string,
    options: ScanOptions,
    ignore: IgnoreConfig,
    signal?: AbortSignal,
  ): Promise<WorkspaceScanResult> {
    const root = normalizePath(rootInput);
    const warnings: string[] = [];
    let rootStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      rootStat = await fs.stat(root);
    } catch (error) {
      throw new Error('Workspace root must be a readable directory.', { cause: error });
    }
    if (!rootStat.isDirectory()) throw new Error('Workspace root must be a readable directory.');
    const configuredEnvFiles = ignore.envFiles?.length ? ignore.envFiles : options.envFiles;
    const exclude = [...options.exclude, ...ignore.ignoredFiles];
    const walked = await walkFiles(root, exclude, options.maxFiles, configuredEnvFiles, signal);
    if (walked.hitLimit)
      warnings.push(
        `File safety limit reached: considering the first ${options.maxFiles} matching files.`,
      );
    const packageRoots = await this.discoverPackageRoots(root, walked.files);
    const projectConfigs = new Map<string, IgnoreConfig>([[root, ignore]]);
    const rootsWithCustomEnvFiles: string[] = [];
    for (const packageRoot of packageRoots) {
      if (packageRoot === root) continue;
      const loaded = await loadIgnoreConfig(packageRoot);
      projectConfigs.set(packageRoot, mergeIgnoreConfig(ignore, loaded.config));
      if (loaded.config.envFiles?.length) rootsWithCustomEnvFiles.push(packageRoot);
      if (loaded.warning)
        warnings.push(`${path.relative(root, packageRoot).replace(/\\/g, '/')}: ${loaded.warning}`);
    }

    const allFiles = new Set(walked.files);
    for (const packageRoot of rootsWithCustomEnvFiles) {
      const remaining = options.maxFiles - allFiles.size;
      if (remaining <= 0) break;
      const projectConfig = projectConfigs.get(packageRoot) ?? ignore;
      const configured = projectConfig.envFiles ?? configuredEnvFiles;
      const extra = await walkMatchingFiles(
        packageRoot,
        [...options.exclude, ...projectConfig.ignoredFiles],
        remaining,
        (relativePath, absolutePath) => configuredEnvMatch(relativePath, absolutePath, configured),
        signal,
      );
      for (const file of extra.files) {
        if (nearestRoot(file, packageRoots, root) !== packageRoot) continue;
        const workspaceRelative = path.relative(root, file).replace(/\\/g, '/');
        if (matchesAnyGlob(workspaceRelative, exclude)) continue;
        allFiles.add(file);
      }
      if (extra.hitLimit)
        warnings.push(
          `File safety limit reached while discovering custom env files in ${path.relative(root, packageRoot).replace(/\\/g, '/')}.`,
        );
    }

    const absFiles = [...allFiles];
    const ignoredForProject = (file: string): boolean => {
      const packageRoot = nearestRoot(file, packageRoots, root);
      const config = projectConfigs.get(packageRoot) ?? ignore;
      return matchesAnyGlob(
        path.relative(packageRoot, file).replace(/\\/g, '/'),
        config.ignoredFiles,
      );
    };
    const envPaths = absFiles.filter((file) => {
      const packageRoot = nearestRoot(file, packageRoots, root);
      const config = projectConfigs.get(packageRoot) ?? ignore;
      const configured = config.envFiles?.length ? config.envFiles : options.envFiles;
      return (
        !ignoredForProject(file) &&
        configuredEnvMatch(path.relative(packageRoot, file).replace(/\\/g, '/'), file, configured)
      );
    });
    const envPathSet = new Set(envPaths);
    const sourcePaths = absFiles.filter(
      (file) => !envPathSet.has(file) && sourceCandidate(file) && !ignoredForProject(file),
    );
    const analyzable = [...envPaths, ...sourcePaths];
    const analyzableSet = new Set(analyzable);
    for (const cachedPath of this.cache.keys()) {
      if (!analyzableSet.has(cachedPath)) this.cache.delete(cachedPath);
    }
    const trackedFiles = await gitTrackedFiles(root, options.scanGitTrackedEnvFiles, signal);

    let filesParsed = 0;
    let cacheHits = 0;
    const envFiles: EnvFile[] = [];
    const references: EnvReference[] = [];
    const secretFindings: SecretFinding[] = [];

    for (let index = 0; index < analyzable.length; index++) {
      if (signal?.aborted) throw new Error('ScanCancelled');
      const file = analyzable[index];
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile()) continue;
        if (stat.size > options.maxFileSizeKb * 1024) {
          warnings.push(`Skipped oversized file: ${path.relative(root, file).replace(/\\/g, '/')}`);
          continue;
        }
        const cached = envPathSet.has(file) ? undefined : this.cache.get(file);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
          cacheHits += 1;
          references.push(...cached.references);
          secretFindings.push(...cached.secrets);
          continue;
        }
        const content = await fs.readFile(file, 'utf8');
        if (content.includes('\u0000')) continue;
        filesParsed += 1;
        let envFile: EnvFile | undefined;
        const fileRefs: EnvReference[] = [];
        let secrets: SecretFinding[] = [];
        if (envPathSet.has(file)) {
          envFile = this.dotenv.parse(content, file);
          envFile.packageRoot = nearestRoot(file, packageRoots, root);
          envFiles.push(envFile);
          if (trackedFiles.has(file)) {
            secretFindings.push(...detectTrackedEnvSecrets(envFile.definitions, file));
          }
        } else {
          for (const detector of this.detectors.filter((detector) => detector.supports(file)))
            fileRefs.push(...(await detector.detectReferences(content, file)));
          secrets = detectSecrets(content, file);
          references.push(...fileRefs);
          secretFindings.push(...secrets);
        }
        if (!envPathSet.has(file))
          this.cache.set(file, {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            references: fileRefs,
            secrets,
          });
      } catch (error) {
        if ((error as Error).message === 'ScanCancelled') throw error;
        warnings.push(
          `Could not analyze ${path.relative(root, file).replace(/\\/g, '/')}; check permissions or file encoding.`,
        );
      }
      if (index % 50 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
    }

    const projects = await this.buildProjects(root, packageRoots, sourcePaths, envFiles);
    return {
      projects,
      references,
      envFiles,
      secretFindings,
      filesConsidered: absFiles.length,
      filesParsed,
      cacheHits,
      warnings,
      projectConfigs,
    };
  }

  private async discoverPackageRoots(root: string, absFiles: string[]): Promise<string[]> {
    const roots = new Set<string>([root]);
    for (const file of absFiles)
      if (PACKAGE_MARKERS.has(path.basename(file))) roots.add(normalizePath(path.dirname(file)));
    return [...roots].sort((a, b) => a.length - b.length);
  }

  private async buildProjects(
    root: string,
    packageRoots: string[],
    sourcePaths: string[],
    envFiles: EnvFile[],
  ): Promise<EnvProject[]> {
    const projects: EnvProject[] = [];
    for (const packageRoot of packageRoots) {
      const sourceFiles = sourcePaths.filter(
        (file) => nearestRoot(file, packageRoots, root) === packageRoot,
      );
      const projectEnvFiles = envFiles.filter((file) => file.packageRoot === packageRoot);
      if (packageRoot !== root && sourceFiles.length === 0 && projectEnvFiles.length === 0)
        continue;
      let name = path.basename(packageRoot);
      try {
        const pkg = JSON.parse(
          await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'),
        ) as { name?: string };
        if (pkg.name) name = pkg.name;
      } catch {
        /* non-node project */
      }
      projects.push({
        root,
        packageRoot,
        name,
        frameworks: await detectFrameworks(packageRoot),
        sourceFiles,
        envFiles: projectEnvFiles,
      });
    }
    return projects;
  }
}
