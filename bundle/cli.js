#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli/index.ts
var import_node_process = __toESM(require("node:process"));
var import_node_path15 = __toESM(require("node:path"));

// src/core/services/secretDetector.ts
var import_node_path = __toESM(require("node:path"));

// src/utils/security.ts
var SECRET_NAME_RE = /(secret|token|password|passwd|pwd|private[_-]?key|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?key)/i;
function isSensitiveName(name) {
  return SECRET_NAME_RE.test(name);
}
function maskSecret(value) {
  if (!value) return "<empty>";
  if (value.length <= 4) return "****";
  const visiblePrefix = Math.min(3, Math.max(1, Math.floor(value.length / 8)));
  const visibleSuffix = value.length > 8 ? 2 : 1;
  return `${value.slice(0, visiblePrefix)}${"*".repeat(Math.min(12, value.length - visiblePrefix - visibleSuffix))}${value.slice(-visibleSuffix)}`;
}

// src/core/services/secretDetector.ts
var PROVIDER_PATTERNS = [
  {
    id: "secret.stripe.live",
    regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g,
    confidence: "high",
    variableName: "STRIPE_SECRET_KEY"
  },
  {
    id: "secret.github.token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    confidence: "high",
    variableName: "GITHUB_TOKEN"
  },
  {
    id: "secret.aws.accessKey",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    confidence: "high",
    variableName: "AWS_ACCESS_KEY_ID"
  },
  {
    id: "secret.privateKey",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    confidence: "high",
    variableName: "PRIVATE_KEY"
  }
];
var ASSIGNMENT = /(?:^|[,{;\s])([A-Za-z_][A-Za-z0-9_.-]{2,})\s*(?:=|:)\s*(["'`])([^\n"'`]{6,})\2/g;
var JSON_ASSIGNMENT = /["']([A-Za-z_][A-Za-z0-9_.-]{2,})["']\s*:\s*(["'])([^\n"']{6,})\2/g;
var YAML_ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_.-]{2,})\s*:\s*([^#\s][^#\n]{5,})\s*(?:#.*)?$/g;
var SAFE_PLACEHOLDER = /^(?:<.*>|your[-_ ]|change[-_ ]?me|example|sample|dummy|test|xxx+|\*+|\$\{)/i;
var URL_WITH_CREDENTIALS = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]+@/i;
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".bash",
  ".cfg",
  ".conf",
  ".config",
  ".cs",
  ".cts",
  ".go",
  ".gradle",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".ksh",
  ".mjs",
  ".mts",
  ".php",
  ".properties",
  ".ps1",
  ".py",
  ".rb",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh"
]);
var TEXT_FILE_NAMES = /* @__PURE__ */ new Set(["dockerfile", "makefile", "procfile"]);
function sourceKindSupported(filePath) {
  const ext = import_node_path.default.extname(filePath).toLowerCase();
  const base = import_node_path.default.basename(filePath).toLowerCase();
  if (base.startsWith(".env")) return false;
  if (/\.(?:lock|min\.js|min\.css)$/.test(base)) return false;
  return TEXT_EXTENSIONS.has(ext) || TEXT_FILE_NAMES.has(base) || base.startsWith("dockerfile.");
}
function lineCol(source, index) {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}
function ignoredAt(source, index) {
  const { line } = lineCol(source, index);
  const lines = source.split(/\r?\n/);
  return /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line - 1] ?? "") || /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line - 2] ?? "");
}
function detectSecrets(source, filePath) {
  if (!sourceKindSupported(filePath)) return [];
  const findings = [];
  for (const provider of PROVIDER_PATTERNS) {
    provider.regex.lastIndex = 0;
    let match2;
    while (match2 = provider.regex.exec(source)) {
      if (ignoredAt(source, match2.index)) continue;
      const loc = lineCol(source, match2.index);
      findings.push({
        file: filePath,
        ...loc,
        ruleId: provider.id,
        variableName: provider.variableName,
        confidence: provider.confidence,
        maskedPreview: maskSecret(match2[0]),
        message: "Potential credential detected in source. Move the value to an environment variable or secret store."
      });
    }
  }
  ASSIGNMENT.lastIndex = 0;
  let match;
  while (match = ASSIGNMENT.exec(source)) {
    const name = match[1];
    const value = match[3].trim();
    if (!isSensitiveName(name) || SAFE_PLACEHOLDER.test(value) || value.length < 8 || ignoredAt(source, match.index))
      continue;
    const loc = lineCol(source, match.index + match[0].indexOf(name));
    findings.push({
      file: filePath,
      ...loc,
      ruleId: "secret.suspiciousAssignment",
      variableName: name.toUpperCase().replace(/[.-]/g, "_"),
      confidence: value.length >= 16 ? "medium" : "low",
      maskedPreview: maskSecret(value),
      message: "A value assigned to a credential-like name may be a secret. Verify it and move real credentials out of source."
    });
  }
  JSON_ASSIGNMENT.lastIndex = 0;
  while (match = JSON_ASSIGNMENT.exec(source)) {
    const name = match[1];
    const value = match[3].trim();
    if (!isSensitiveName(name) || SAFE_PLACEHOLDER.test(value) || value.length < 8 || ignoredAt(source, match.index))
      continue;
    const loc = lineCol(source, match.index + match[0].indexOf(name));
    findings.push({
      file: filePath,
      ...loc,
      ruleId: "secret.suspiciousJson",
      variableName: name.toUpperCase().replace(/[.-]/g, "_"),
      confidence: value.length >= 16 ? "medium" : "low",
      maskedPreview: maskSecret(value),
      message: "A credential-like JSON property may contain a secret. Verify it and use an environment variable or secret store."
    });
  }
  if ([".yaml", ".yml"].includes(import_node_path.default.extname(filePath).toLowerCase())) {
    const lines = source.split(/\r?\n/);
    lines.forEach((line, idx) => {
      YAML_ASSIGNMENT.lastIndex = 0;
      const yaml = YAML_ASSIGNMENT.exec(line);
      if (!yaml || !isSensitiveName(yaml[1])) return;
      const value = yaml[2].trim().replace(/^['"]|['"]$/g, "");
      if (SAFE_PLACEHOLDER.test(value) || value.length < 8 || /ENV_DOCTOR_IGNORE/.test(line) || /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? ""))
        return;
      findings.push({
        file: filePath,
        line: idx + 1,
        column: line.indexOf(yaml[1]) + 1,
        ruleId: "secret.suspiciousYaml",
        variableName: yaml[1].toUpperCase().replace(/[.-]/g, "_"),
        confidence: "medium",
        maskedPreview: maskSecret(value),
        message: "A credential-like YAML value may contain a secret. Verify it and use an environment variable or secret store."
      });
    });
  }
  const unique = /* @__PURE__ */ new Map();
  for (const finding of findings)
    unique.set(`${finding.file}:${finding.line}:${finding.column}:${finding.ruleId}`, finding);
  return [...unique.values()];
}
function detectTrackedEnvSecrets(definitions, filePath) {
  const findings = [];
  for (const definition of definitions) {
    const value = definition.value.trim();
    const providerMatch = PROVIDER_PATTERNS.some((provider) => {
      provider.regex.lastIndex = 0;
      return provider.regex.test(value);
    });
    if (definition.isExample || definition.ignored || !value || !isSensitiveName(definition.name) && !providerMatch && !URL_WITH_CREDENTIALS.test(value) || SAFE_PLACEHOLDER.test(value)) {
      continue;
    }
    findings.push({
      file: filePath,
      line: definition.line,
      column: definition.column,
      ruleId: "secret.trackedEnvFile",
      variableName: definition.name,
      confidence: "high",
      maskedPreview: maskSecret(value),
      message: "A Git-tracked environment file contains a credential-like value. Remove the file from version control and rotate exposed credentials if necessary."
    });
  }
  return findings;
}

// src/core/services/frameworkDetector.ts
var import_promises = __toESM(require("node:fs/promises"));
var import_node_path2 = __toESM(require("node:path"));
async function readJson(file) {
  try {
    return JSON.parse(await import_promises.default.readFile(file, "utf8"));
  } catch {
    return void 0;
  }
}
async function exists(file) {
  try {
    await import_promises.default.access(file);
    return true;
  } catch {
    return false;
  }
}
async function detectFrameworks(packageRoot) {
  const result = /* @__PURE__ */ new Set();
  const pkg = await readJson(import_node_path2.default.join(packageRoot, "package.json"));
  if (pkg) {
    const deps = { ...pkg.dependencies ?? {}, ...pkg.devDependencies ?? {} };
    if (deps.next) result.add("Next.js");
    if (deps.vite) result.add("Vite");
    if (deps.react) result.add("React");
    if (deps["@nestjs/core"]) result.add("NestJS");
    if (deps.express) result.add("Express");
    if (deps.nuxt) result.add("Nuxt");
    if (!result.has("Next.js") && !result.has("Nuxt")) result.add("Node.js");
  }
  const pyFiles = ["requirements.txt", "pyproject.toml"];
  for (const name of pyFiles) {
    try {
      const text = (await import_promises.default.readFile(import_node_path2.default.join(packageRoot, name), "utf8")).toLowerCase();
      if (/\bdjango\b/.test(text)) result.add("Django");
      if (/\bflask\b/.test(text)) result.add("Flask");
      if (text) result.add("Python");
    } catch {
    }
  }
  const composer = await readJson(import_node_path2.default.join(packageRoot, "composer.json"));
  if (composer) {
    const deps = { ...composer.require ?? {}, ...composer["require-dev"] ?? {} };
    if (deps["laravel/framework"]) result.add("Laravel");
    else result.add("PHP");
  }
  const composeCandidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml"
  ];
  if ((await Promise.all(composeCandidates.map((name) => exists(import_node_path2.default.join(packageRoot, name))))).some(
    Boolean
  )) {
    result.add("Docker Compose");
  }
  if (await exists(import_node_path2.default.join(packageRoot, "Dockerfile"))) result.add("Docker");
  return [...result];
}

// src/core/services/engine.ts
var import_node_path13 = __toESM(require("node:path"));

// src/utils/ids.ts
var import_node_crypto = __toESM(require("node:crypto"));
function stableId(...parts) {
  return import_node_crypto.default.createHash("sha1").update(parts.map((p) => p ?? "").join("|")).digest("hex").slice(0, 16);
}

// src/core/services/runtimeVariables.ts
var RUNTIME_PROVIDED = /* @__PURE__ */ new Set([
  "CI",
  "GITHUB_ACTIONS",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOSTNAME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "NODE_ENV",
  "OLDPWD",
  "PATH",
  "PATHEXT",
  "PWD",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "USERDOMAIN",
  "USERNAME",
  "WINDIR"
]);
var UNUSED_RUNTIME_NAMES = /* @__PURE__ */ new Set(["DEBUG", "HOST", "PORT"]);
function isRuntimeProvidedVariable(name) {
  return RUNTIME_PROVIDED.has(name) || name.startsWith("GITHUB_") || name.startsWith("npm_");
}
function isConventionallyRuntimeConsumed(name) {
  return isRuntimeProvidedVariable(name) || UNUSED_RUNTIME_NAMES.has(name);
}

// src/core/analyzers/missingAnalyzer.ts
var MissingAnalyzer = class {
  id = "missing";
  async analyze(context) {
    const ignored2 = new Set(context.ignore.ignoredVariables);
    const runtimeDefs = new Set(
      context.envFiles.flatMap((f) => f.definitions.filter((d) => !d.isExample).map((d) => d.name))
    );
    const exampleDefs = new Set(
      context.envFiles.flatMap((f) => f.definitions.filter((d) => d.isExample).map((d) => d.name))
    );
    const refs = context.references.filter(
      (r) => !r.dynamic && !r.optional && !r.ignored && !ignored2.has(r.name) && !isRuntimeProvidedVariable(r.name)
    );
    const byName = /* @__PURE__ */ new Map();
    for (const ref of refs) byName.set(ref.name, [...byName.get(ref.name) ?? [], ref]);
    const issues = [];
    for (const [name, usages] of byName) {
      if (runtimeDefs.has(name)) continue;
      const onlyDocumented = exampleDefs.has(name);
      const first = usages[0];
      issues.push({
        id: stableId(this.id, context.project.packageRoot, name),
        kind: "missing",
        name,
        message: onlyDocumented ? `${name} is referenced but only documented in an example env file.` : `${name} is referenced but not defined in a runtime env file.`,
        severity: "warning",
        confidence: onlyDocumented ? "medium" : "high",
        location: first,
        related: usages.slice(1),
        packageRoot: context.project.packageRoot,
        ruleId: this.id,
        details: { documentedInExample: onlyDocumented }
      });
    }
    for (const [name, rule] of Object.entries(context.ignore.rules)) {
      if (rule.required && !runtimeDefs.has(name) && !ignored2.has(name) && !byName.has(name)) {
        issues.push({
          id: stableId("required", context.project.packageRoot, name),
          kind: "missing",
          name,
          message: `${name} is required by .envdoctorrc but is not defined.`,
          severity: "error",
          confidence: "high",
          packageRoot: context.project.packageRoot,
          ruleId: "required"
        });
      }
    }
    return issues;
  }
};

// src/core/analyzers/unusedAnalyzer.ts
var UnusedAnalyzer = class {
  id = "unused";
  async analyze(context) {
    const ignored2 = new Set(context.ignore.ignoredVariables);
    const used = new Set(
      context.references.filter((r) => !r.dynamic && !r.ignored).map((r) => r.name)
    );
    const defs = context.envFiles.flatMap((f) => f.definitions).filter((d) => !d.ignored && !ignored2.has(d.name));
    const firstByName = /* @__PURE__ */ new Map();
    for (const def of defs) if (!firstByName.has(def.name)) firstByName.set(def.name, def);
    const issues = [];
    for (const [name, def] of firstByName) {
      if (used.has(name) || isConventionallyRuntimeConsumed(name)) continue;
      const uncertain = context.dynamicReferencePresent || def.isExample;
      issues.push({
        id: stableId(this.id, context.project.packageRoot, name),
        kind: "unused",
        name,
        message: uncertain ? `${name} may be unused; dynamic access or example-file semantics prevent certainty.` : `${name} is defined but no usage was detected.`,
        severity: "information",
        confidence: uncertain ? "low" : "high",
        location: def,
        packageRoot: context.project.packageRoot,
        ruleId: this.id
      });
    }
    return issues;
  }
};

// src/core/analyzers/comparisonAnalyzer.ts
var import_node_path3 = __toESM(require("node:path"));
var ComparisonAnalyzer = class {
  constructor(compareNames) {
    this.compareNames = compareNames;
  }
  compareNames;
  id = "inconsistent";
  async analyze(context) {
    const wanted = context.ignore.compareEnvFiles?.length ? context.ignore.compareEnvFiles : this.compareNames;
    const files = context.envFiles.filter((f) => wanted.includes(import_node_path3.default.basename(f.path)));
    if (files.length < 2) return [];
    const allNames = new Set(files.flatMap((f) => f.definitions.map((d) => d.name)));
    const issues = [];
    for (const name of allNames) {
      const present = files.filter((f) => f.definitions.some((d) => d.name === name));
      const missing = files.filter((f) => !f.definitions.some((d) => d.name === name));
      if (!missing.length) continue;
      const location = present[0]?.definitions.find((d) => d.name === name);
      issues.push({
        id: stableId(
          this.id,
          context.project.packageRoot,
          name,
          missing.map((f) => f.name).join(",")
        ),
        kind: "inconsistent",
        name,
        message: `${name} is missing from ${missing.map((f) => f.name).join(", ")}.`,
        severity: "information",
        confidence: "high",
        location,
        packageRoot: context.project.packageRoot,
        ruleId: this.id,
        details: { presentIn: present.map((f) => f.name), missingFrom: missing.map((f) => f.name) }
      });
    }
    return issues;
  }
};

// src/core/validators/valueValidator.ts
var TRUE_FALSE = /* @__PURE__ */ new Set(["true", "false", "1", "0", "yes", "no", "on", "off"]);
function isValidUrl(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.hostname);
  } catch {
    return false;
  }
}
function validateConfiguredRegex(value, pattern) {
  const unsafe = pattern.length > 256 || /\\[1-9]/.test(pattern) || /\(\?/.test(pattern) || /\([^)]*\|[^)]*\)[+*{]/.test(pattern) || /\([^)]*[+*{][^)]*\)[+*{]/.test(pattern) || /\.\*[^\n]*\.\*/.test(pattern);
  if (unsafe) {
    return {
      valid: false,
      message: "Configured regex is too complex or potentially unsafe."
    };
  }
  try {
    const valid = new RegExp(pattern).test(value.slice(0, 4096));
    return {
      valid,
      message: valid ? "Matches configured pattern." : "Does not match configured pattern."
    };
  } catch {
    return { valid: false, message: "Configured regex is invalid." };
  }
}
function validateValue(name, value, rule) {
  const checks = [];
  if (rule.url) {
    const valid = isValidUrl(value);
    checks.push({
      rule: "url",
      valid,
      message: valid ? "Valid URL format." : "Expected a valid URL."
    });
  }
  if (rule.integer) {
    const valid = /^[-+]?\d+$/.test(value.trim());
    checks.push({
      rule: "integer",
      valid,
      message: valid ? "Valid integer." : "Expected an integer."
    });
  }
  if (rule.boolean) {
    const valid = TRUE_FALSE.has(value.trim().toLowerCase());
    checks.push({
      rule: "boolean",
      valid,
      message: valid ? "Valid boolean." : "Expected a boolean value."
    });
  }
  if (rule.regex) {
    const result = validateConfiguredRegex(value, rule.regex);
    checks.push({
      rule: "regex",
      valid: result.valid,
      message: result.message
    });
  }
  if (rule.allowedValues?.length) {
    const valid = rule.allowedValues.includes(value);
    const safeExpectation = rule.secret || isSensitiveName(name) ? "Expected one of the configured allowed values." : `Expected one of: ${rule.allowedValues.join(" | ")}`;
    checks.push({
      rule: "allowedValues",
      valid,
      message: valid ? "Value is allowed." : safeExpectation
    });
  }
  return { name, valid: checks.every((check) => check.valid), checks };
}

// src/core/analyzers/validationAnalyzer.ts
var ValidationAnalyzer = class {
  id = "validation";
  async analyze(context) {
    const defs = /* @__PURE__ */ new Map();
    for (const name of Object.keys(context.ignore.rules))
      defs.set(name, firstDefinition(context, name));
    const issues = [];
    for (const [name, rule] of Object.entries(context.ignore.rules)) {
      const def = defs.get(name);
      if (!def) continue;
      const result = validateValue(name, def.value, rule);
      for (const check of result.checks.filter((c) => !c.valid)) {
        issues.push({
          id: stableId(this.id, context.project.packageRoot, name, check.rule),
          kind: "validation",
          name,
          message: `${name}: ${check.message}`,
          severity: "warning",
          confidence: "high",
          location: def,
          packageRoot: context.project.packageRoot,
          ruleId: `validation.${check.rule}`
        });
      }
    }
    return issues;
  }
};
function firstDefinition(context, name) {
  return context.envFiles.flatMap((file) => file.definitions).find((def) => def.name === name && !def.isExample);
}

// src/core/analyzers/secretAnalyzer.ts
var SecretAnalyzer = class {
  id = "secret";
  async analyze(context) {
    const ignoredRules = new Set(context.ignore.ignoredRules);
    return context.secretFindings.filter((finding) => !ignoredRules.has(finding.ruleId)).map((finding) => ({
      id: stableId(this.id, finding.file, finding.line, finding.column, finding.ruleId),
      kind: "secret",
      name: finding.variableName,
      message: finding.message,
      severity: "error",
      confidence: finding.confidence,
      location: finding,
      packageRoot: context.project.packageRoot,
      ruleId: finding.ruleId,
      details: { maskedPreview: finding.maskedPreview }
    }));
  }
};

// src/core/analyzers/parseAnalyzer.ts
var ParseAnalyzer = class {
  id = "parse";
  async analyze(context) {
    return context.envFiles.flatMap(
      (f) => f.errors.map((e) => ({
        id: stableId(this.id, e.file, e.line, e.code),
        kind: "parse",
        message: e.message,
        severity: "warning",
        confidence: "high",
        location: e,
        packageRoot: context.project.packageRoot,
        ruleId: e.code
      }))
    );
  }
};

// src/core/analyzers/publicExposureAnalyzer.ts
var EXPLICITLY_PUBLIC_NAME = /(PUBLISHABLE|PUBLIC_KEY|CLIENT_ID|ANALYTICS)/i;
var PublicExposureAnalyzer = class {
  id = "secret.publicEnvironmentVariable";
  async analyze(context) {
    const byName = /* @__PURE__ */ new Map();
    for (const reference of context.references) {
      if (!reference.public || reference.dynamic || !isSensitiveName(reference.name) || EXPLICITLY_PUBLIC_NAME.test(reference.name)) {
        continue;
      }
      const references = byName.get(reference.name) ?? [];
      references.push(reference);
      byName.set(reference.name, references);
    }
    const issues = [];
    for (const [name, references] of byName) {
      const first = references[0];
      issues.push({
        id: stableId(this.id, context.project.packageRoot, name),
        kind: "secret",
        name,
        message: `${name} uses a client-visible environment prefix and has a credential-like name. Verify that its value is safe to bundle into client code.`,
        severity: "error",
        confidence: "medium",
        location: first,
        related: references.slice(1),
        packageRoot: context.project.packageRoot,
        ruleId: this.id
      });
    }
    return issues;
  }
};

// src/core/rules/ignoreConfig.ts
var import_promises2 = __toESM(require("node:fs/promises"));
var import_node_path4 = __toESM(require("node:path"));
var import_typescript = __toESM(require("typescript"));
function emptyConfig() {
  return { ignoredVariables: [], ignoredFiles: [], ignoredRules: [], rules: {} };
}
function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function rules(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw;
    out[name] = {
      required: typeof r.required === "boolean" ? r.required : void 0,
      optional: typeof r.optional === "boolean" ? r.optional : void 0,
      secret: typeof r.secret === "boolean" ? r.secret : void 0,
      url: typeof r.url === "boolean" ? r.url : void 0,
      integer: typeof r.integer === "boolean" ? r.integer : void 0,
      boolean: typeof r.boolean === "boolean" ? r.boolean : void 0,
      regex: typeof r.regex === "string" ? r.regex : void 0,
      allowedValues: strings(r.allowedValues)
    };
  }
  return out;
}
async function loadIgnoreConfig(root) {
  const file = import_node_path4.default.join(root, ".envdoctorrc");
  try {
    const content = await import_promises2.default.readFile(file, "utf8");
    const parsed = import_typescript.default.parseConfigFileTextToJson(file, content);
    if (parsed.error || !parsed.config || typeof parsed.config !== "object") {
      return {
        config: emptyConfig(),
        warning: ".envdoctorrc could not be parsed. The file contents were not logged."
      };
    }
    const raw = parsed.config;
    return {
      config: {
        ignoredVariables: strings(raw.ignoredVariables),
        ignoredFiles: strings(raw.ignoredFiles),
        ignoredRules: strings(raw.ignoredRules),
        rules: rules(raw.rules),
        compareEnvFiles: strings(raw.compareEnvFiles),
        envFiles: strings(raw.envFiles)
      }
    };
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") return { config: emptyConfig() };
    return {
      config: emptyConfig(),
      warning: ".envdoctorrc could not be read. Check file permissions."
    };
  }
}

// src/scanner/workspaceScanner.ts
var import_promises3 = __toESM(require("node:fs/promises"));
var import_node_path12 = __toESM(require("node:path"));
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");

// src/parsers/dotenv/dotenvParser.ts
var import_node_path5 = __toESM(require("node:path"));
var KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
function hasIgnoreDirective(lines, index) {
  const current = lines[index] ?? "";
  const previous = index > 0 ? lines[index - 1] : "";
  return /ENV_DOCTOR_IGNORE(?:\s|$)/.test(current) || /ENV_DOCTOR_IGNORE(?:\s|$)/.test(previous);
}
function stripInlineComment(raw) {
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && double) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !double) single = !single;
    else if (ch === '"' && !single) double = !double;
    else if (ch === "#" && !single && !double && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i).trimEnd();
    }
  }
  return raw.trimEnd();
}
function decodeDoubleQuoted(value) {
  return value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function findClosingQuote(value, quote) {
  let escaped = false;
  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    if (quote === '"' && ch === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === quote && !escaped) return i;
    escaped = false;
  }
  return -1;
}
function isExampleFile(filePath) {
  return /(?:^|\.)(?:example|sample|template)$/i.test(import_node_path5.default.basename(filePath));
}
var DotenvParser = class {
  supports(filePath) {
    const name = import_node_path5.default.basename(filePath);
    return name === ".env" || name.startsWith(".env.") || name === ".env.example" || name === ".env.sample";
  }
  parse(content, filePath) {
    const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
    const definitions = [];
    const errors = [];
    const seenNames = /* @__PURE__ */ new Set();
    for (let i = 0; i < lines.length; i++) {
      const startIndex = i;
      const original = lines[i];
      let line = original.trim();
      if (!line || line.startsWith("#")) continue;
      let exported = false;
      if (/^export\s+/.test(line)) {
        exported = true;
        line = line.replace(/^export\s+/, "");
      }
      const eq = line.indexOf("=");
      if (eq < 1) {
        errors.push({
          file: filePath,
          line: i + 1,
          column: 1,
          message: "Expected KEY=value syntax.",
          code: "dotenv.syntax"
        });
        continue;
      }
      const key = line.slice(0, eq).trim();
      if (!KEY_RE.test(key)) {
        errors.push({
          file: filePath,
          line: i + 1,
          column: 1,
          message: `Invalid environment variable name: ${key}`,
          code: "dotenv.invalidKey"
        });
        continue;
      }
      let rawValue = line.slice(eq + 1).trimStart();
      let quoted = false;
      let value;
      if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
        quoted = true;
        const quote = rawValue[0];
        let combined = rawValue;
        let closing = findClosingQuote(combined, quote);
        while (closing < 0 && i + 1 < lines.length) {
          i += 1;
          combined += `
${lines[i]}`;
          closing = findClosingQuote(combined, quote);
        }
        if (closing < 0) {
          errors.push({
            file: filePath,
            line: startIndex + 1,
            column: eq + 2,
            message: `Unterminated ${quote === '"' ? "double" : "single"}-quoted value.`,
            code: "dotenv.unterminatedQuote"
          });
          continue;
        }
        const inner = combined.slice(1, closing);
        value = quote === '"' ? decodeDoubleQuoted(inner) : inner;
        const trailing = combined.slice(closing + 1).trim();
        if (trailing && !trailing.startsWith("#")) {
          errors.push({
            file: filePath,
            line: startIndex + 1,
            column: eq + closing + 3,
            message: "Unexpected content after quoted value.",
            code: "dotenv.trailingContent"
          });
        }
      } else {
        rawValue = stripInlineComment(rawValue).trim();
        value = rawValue;
      }
      if (seenNames.has(key)) {
        errors.push({
          file: filePath,
          line: startIndex + 1,
          column: Math.max(1, original.indexOf(key) + 1),
          message: `${key} is defined more than once in this file.`,
          code: "dotenv.duplicateKey"
        });
      }
      seenNames.add(key);
      definitions.push({
        name: key,
        value,
        quoted,
        exported,
        file: filePath,
        line: startIndex + 1,
        column: Math.max(1, original.indexOf(key) + 1),
        isExample: isExampleFile(filePath),
        ignored: hasIgnoreDirective(lines, startIndex)
      });
    }
    return {
      path: filePath,
      name: import_node_path5.default.basename(filePath),
      packageRoot: import_node_path5.default.dirname(filePath),
      definitions,
      errors
    };
  }
};

// src/parsers/javascript/jsTsDetector.ts
var import_node_path6 = __toESM(require("node:path"));
var import_typescript2 = __toESM(require("typescript"));
var EXTENSIONS = /* @__PURE__ */ new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
var VITE_BUILTINS = /* @__PURE__ */ new Set(["MODE", "BASE_URL", "PROD", "DEV", "SSR"]);
function languageFor(filePath) {
  const ext = import_node_path6.default.extname(filePath).toLowerCase();
  if (ext.includes("ts")) return "typescript";
  return "javascript";
}
function scriptKindFor(filePath) {
  switch (import_node_path6.default.extname(filePath).toLowerCase()) {
    case ".tsx":
      return import_typescript2.default.ScriptKind.TSX;
    case ".jsx":
      return import_typescript2.default.ScriptKind.JSX;
    case ".ts":
    case ".mts":
    case ".cts":
      return import_typescript2.default.ScriptKind.TS;
    default:
      return import_typescript2.default.ScriptKind.JS;
  }
}
function isProcessEnv(node) {
  return import_typescript2.default.isPropertyAccessExpression(node) && import_typescript2.default.isIdentifier(node.expression) && node.expression.text === "process" && node.name.text === "env";
}
function isImportMetaEnv(node) {
  if (!import_typescript2.default.isPropertyAccessExpression(node) || node.name.text !== "env") return false;
  const expression = node.expression;
  return import_typescript2.default.isMetaProperty(expression) && expression.keywordToken === import_typescript2.default.SyntaxKind.ImportKeyword && expression.name.text === "meta";
}
function ignoreAt(sourceFile, source, node) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lines = source.split(/\r?\n/);
  const current = lines[pos.line] ?? "";
  const previous = pos.line > 0 ? lines[pos.line - 1] : "";
  return /ENV_DOCTOR_IGNORE(?:\s|$)/.test(current) || /ENV_DOCTOR_IGNORE(?:\s|$)/.test(previous);
}
function hasImmediateFallback(node) {
  const parent = node.parent;
  return import_typescript2.default.isBinaryExpression(parent) && parent.left === node && (parent.operatorToken.kind === import_typescript2.default.SyntaxKind.QuestionQuestionToken || parent.operatorToken.kind === import_typescript2.default.SyntaxKind.BarBarToken);
}
function makeReference(sourceFile, source, filePath, node, name, accessType, confidence = "high", dynamic = false, publicVar = false, optional = false) {
  const p = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    name,
    file: filePath,
    line: p.line + 1,
    column: p.character + 1,
    language: languageFor(filePath),
    accessType,
    confidence,
    dynamic,
    public: publicVar,
    optional,
    ignored: ignoreAt(sourceFile, source, node)
  };
}
var JsTsDetector = class {
  id = "javascript-typescript";
  supports(filePath) {
    return EXTENSIONS.has(import_node_path6.default.extname(filePath).toLowerCase());
  }
  async detectReferences(source, filePath) {
    const sourceFile = import_typescript2.default.createSourceFile(
      filePath,
      source,
      import_typescript2.default.ScriptTarget.Latest,
      true,
      scriptKindFor(filePath)
    );
    const refs = [];
    const visit = (node) => {
      if (import_typescript2.default.isPropertyAccessExpression(node)) {
        if (isProcessEnv(node.expression)) {
          const name = node.name.text;
          refs.push(
            makeReference(
              sourceFile,
              source,
              filePath,
              node,
              name,
              "process.env.property",
              "high",
              false,
              name.startsWith("NEXT_PUBLIC_"),
              hasImmediateFallback(node)
            )
          );
        } else if (isImportMetaEnv(node.expression)) {
          const name = node.name.text;
          if (VITE_BUILTINS.has(name)) {
            import_typescript2.default.forEachChild(node, visit);
            return;
          }
          refs.push(
            makeReference(
              sourceFile,
              source,
              filePath,
              node,
              name,
              "import.meta.env.property",
              "high",
              false,
              name.startsWith("VITE_"),
              hasImmediateFallback(node)
            )
          );
        }
      } else if (import_typescript2.default.isElementAccessExpression(node)) {
        if (isProcessEnv(node.expression)) {
          const arg = node.argumentExpression;
          if (arg && (import_typescript2.default.isStringLiteral(arg) || import_typescript2.default.isNoSubstitutionTemplateLiteral(arg))) {
            const name = arg.text;
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                node,
                name,
                "process.env.element",
                "high",
                false,
                name.startsWith("NEXT_PUBLIC_"),
                hasImmediateFallback(node)
              )
            );
          } else {
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                node,
                "<dynamic>",
                "process.env.dynamic",
                "low",
                true
              )
            );
          }
        } else if (isImportMetaEnv(node.expression)) {
          const arg = node.argumentExpression;
          if (arg && (import_typescript2.default.isStringLiteral(arg) || import_typescript2.default.isNoSubstitutionTemplateLiteral(arg))) {
            const name = arg.text;
            if (!VITE_BUILTINS.has(name)) {
              refs.push(
                makeReference(
                  sourceFile,
                  source,
                  filePath,
                  node,
                  name,
                  "import.meta.env.element",
                  "high",
                  false,
                  name.startsWith("VITE_"),
                  hasImmediateFallback(node)
                )
              );
            }
          } else {
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                node,
                "<dynamic>",
                "import.meta.env.dynamic",
                "low",
                true
              )
            );
          }
        }
      } else if (import_typescript2.default.isVariableDeclaration(node) && import_typescript2.default.isObjectBindingPattern(node.name) && node.initializer && isProcessEnv(node.initializer)) {
        for (const element of node.name.elements) {
          if (element.dotDotDotToken) {
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                element,
                "<dynamic>",
                "process.env.destructure.rest",
                "low",
                true
              )
            );
            continue;
          }
          const property = element.propertyName ?? element.name;
          if (import_typescript2.default.isIdentifier(property) || import_typescript2.default.isStringLiteral(property)) {
            const name = property.text;
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                element,
                name,
                "process.env.destructure",
                "high",
                false,
                name.startsWith("NEXT_PUBLIC_"),
                Boolean(element.initializer)
              )
            );
          }
        }
      }
      import_typescript2.default.forEachChild(node, visit);
    };
    visit(sourceFile);
    const seen = /* @__PURE__ */ new Set();
    return refs.filter((ref) => {
      const key = `${ref.file}:${ref.line}:${ref.column}:${ref.name}:${ref.accessType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
};

// src/parsers/python/pythonDetector.ts
var import_node_path7 = __toESM(require("node:path"));
var PATTERNS = [
  { re: /\bos\.getenv\(\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g, accessType: "os.getenv" },
  {
    re: /\bos\.environ\s*\[\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g,
    accessType: "os.environ.element"
  },
  { re: /\bos\.environ\.get\(\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g, accessType: "os.environ.get" }
];
function ignored(lines, line) {
  return /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line] ?? "") || /ENV_DOCTOR_IGNORE(?:\s|$)/.test(lines[line - 1] ?? "");
}
var PythonDetector = class {
  id = "python";
  supports(filePath) {
    return import_node_path7.default.extname(filePath).toLowerCase() === ".py";
  }
  async detectReferences(source, filePath) {
    const refs = [];
    const lines = source.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const text = lines[lineIndex];
      for (const pattern of PATTERNS) {
        pattern.re.lastIndex = 0;
        let match;
        while (match = pattern.re.exec(text)) {
          const optional = pattern.accessType !== "os.environ.element" && /^\s*,/.test(text.slice(pattern.re.lastIndex));
          refs.push({
            name: match[2],
            file: filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            language: "python",
            accessType: pattern.accessType,
            confidence: "high",
            optional,
            ignored: ignored(lines, lineIndex)
          });
        }
      }
      const dynamic = /\bos\.(?:getenv|environ\.get)\(\s*(?!["'])/.exec(text) || /\bos\.environ\s*\[\s*(?!["'])/.exec(text);
      if (dynamic)
        refs.push({
          name: "<dynamic>",
          file: filePath,
          line: lineIndex + 1,
          column: dynamic.index + 1,
          language: "python",
          accessType: "os.env.dynamic",
          confidence: "low",
          dynamic: true,
          ignored: ignored(lines, lineIndex)
        });
    }
    return refs;
  }
};

// src/parsers/php/phpDetector.ts
var import_node_path8 = __toESM(require("node:path"));
var PhpDetector = class {
  id = "php-laravel";
  supports(filePath) {
    return import_node_path8.default.extname(filePath).toLowerCase() === ".php";
  }
  async detectReferences(source, filePath) {
    const refs = [];
    const lines = source.split(/\r?\n/);
    const re = /\benv\(\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g;
    lines.forEach((line, idx) => {
      re.lastIndex = 0;
      let match;
      while (match = re.exec(line)) {
        refs.push({
          name: match[2],
          file: filePath,
          line: idx + 1,
          column: match.index + 1,
          language: "php",
          accessType: "laravel.env",
          confidence: "high",
          ignored: /ENV_DOCTOR_IGNORE/.test(line) || /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? "")
        });
      }
      const dynamic = /\benv\(\s*(?!["'])/.exec(line);
      if (dynamic)
        refs.push({
          name: "<dynamic>",
          file: filePath,
          line: idx + 1,
          column: dynamic.index + 1,
          language: "php",
          accessType: "laravel.env.dynamic",
          confidence: "low",
          dynamic: true
        });
    });
    return refs;
  }
};

// src/parsers/docker/dockerDetector.ts
var import_node_path9 = __toESM(require("node:path"));
function isDockerFile(filePath) {
  const base = import_node_path9.default.basename(filePath).toLowerCase();
  return base === "dockerfile" || base.startsWith("dockerfile.") || /^(docker-)?compose(?:\.[\w-]+)?\.ya?ml$/.test(base);
}
function indentOf(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}
var DockerDetector = class {
  id = "docker";
  supports(filePath) {
    return isDockerFile(filePath);
  }
  async detectReferences(source, filePath) {
    const refs = [];
    const lines = source.split(/\r?\n/);
    const braced = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-+?=])[^}]*)?\}/g;
    let environmentIndent;
    lines.forEach((line, idx) => {
      braced.lastIndex = 0;
      let match;
      while (match = braced.exec(line)) {
        const operator = match[2] ?? "";
        const optional = operator !== "" && !operator.includes("?");
        refs.push({
          name: match[1],
          file: filePath,
          line: idx + 1,
          column: match.index + 1,
          language: "docker",
          accessType: optional ? "compose.interpolation.default" : "compose.interpolation",
          confidence: "high",
          optional,
          ignored: /ENV_DOCTOR_IGNORE/.test(line) || /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? "")
        });
      }
      if (/^\s*environment\s*:\s*(?:#.*)?$/.test(line)) {
        environmentIndent = indentOf(line);
        return;
      }
      if (environmentIndent === void 0 || !line.trim() || line.trimStart().startsWith("#"))
        return;
      const indent = indentOf(line);
      if (indent <= environmentIndent) {
        environmentIndent = void 0;
        return;
      }
      const passThroughList = /^\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:#.*)?$/.exec(line);
      const passThroughMap = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:#.*)?$/.exec(line);
      const pass = passThroughList ?? passThroughMap;
      if (pass)
        refs.push({
          name: pass[1],
          file: filePath,
          line: idx + 1,
          column: line.indexOf(pass[1]) + 1,
          language: "docker",
          accessType: "compose.environment.passthrough",
          confidence: "medium"
        });
    });
    return refs;
  }
};

// src/parsers/shell/shellDetector.ts
var import_node_path10 = __toESM(require("node:path"));
var SHELL_EXT = /* @__PURE__ */ new Set([".sh", ".bash", ".zsh", ".ksh"]);
function maskNonExpandingText(line) {
  const output = [...line];
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (escaped) {
      output[index] = " ";
      escaped = false;
      continue;
    }
    if (character === "\\" && !singleQuoted) {
      output[index] = " ";
      escaped = true;
      continue;
    }
    if (character === "'" && !doubleQuoted) {
      singleQuoted = !singleQuoted;
      output[index] = " ";
      continue;
    }
    if (character === '"' && !singleQuoted) {
      doubleQuoted = !doubleQuoted;
      output[index] = " ";
      continue;
    }
    if (singleQuoted) {
      output[index] = " ";
      continue;
    }
    if (character === "#" && !doubleQuoted && (index === 0 || /\s/.test(line[index - 1]))) {
      output.fill(" ", index);
      break;
    }
  }
  return output.join("");
}
var ShellDetector = class {
  id = "shell";
  supports(filePath) {
    return SHELL_EXT.has(import_node_path10.default.extname(filePath).toLowerCase());
  }
  async detectReferences(source, filePath) {
    const refs = [];
    const lines = source.split(/\r?\n/);
    const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-+?=])[^}]*)?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
    lines.forEach((line, idx) => {
      const analyzable = maskNonExpandingText(line);
      re.lastIndex = 0;
      let match;
      while (match = re.exec(analyzable)) {
        const name = match[1] ?? match[3];
        const operator = match[2] ?? "";
        const optional = Boolean(match[1] && operator && !operator.includes("?"));
        refs.push({
          name,
          file: filePath,
          line: idx + 1,
          column: match.index + 1,
          language: "shell",
          accessType: match[1] ? optional ? "shell.braced.default" : "shell.braced" : "shell.variable",
          confidence: "high",
          optional,
          ignored: /ENV_DOCTOR_IGNORE/.test(line) || /ENV_DOCTOR_IGNORE/.test(lines[idx - 1] ?? "")
        });
      }
    });
    return refs;
  }
};

// src/utils/paths.ts
var import_node_path11 = __toESM(require("node:path"));
function normalizePath(value) {
  return import_node_path11.default.resolve(value).replace(/\\/g, "/");
}
function relativeDisplay(root, file) {
  const rel = import_node_path11.default.relative(root, file).replace(/\\/g, "/");
  return rel || import_node_path11.default.basename(file);
}
function isInside(parent, child) {
  const rel = import_node_path11.default.relative(parent, child);
  return rel === "" || !rel.startsWith("..") && !import_node_path11.default.isAbsolute(rel);
}
function nearestRoot(file, roots, fallback) {
  const candidates = roots.filter((root) => isInside(root, file));
  if (!candidates.length) return fallback;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

// src/utils/glob.ts
function escapeRegex(ch) {
  return /[\\^$+?.()|{}[\]]/.test(ch) ? `\\${ch}` : ch;
}
function globToRegExp(patternInput) {
  let pattern = patternInput.replace(/\\/g, "/").replace(/^\.\//, "");
  let source = "^";
  if (pattern.startsWith("**/")) {
    source += "(?:.*/)?";
    pattern = pattern.slice(3);
  }
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        while (pattern[i + 1] === "*") i++;
        source += ".*";
      } else source += "[^/]*";
    } else if (ch === "?") source += "[^/]";
    else source += escapeRegex(ch);
  }
  source += "$";
  return new RegExp(source);
}
function matchesGlob(valueInput, pattern) {
  const value = valueInput.replace(/\\/g, "/").replace(/^\.\//, "");
  const regex = globToRegExp(pattern);
  return regex.test(value) || regex.test(`${value}/`);
}
function matchesAnyGlob(value, patterns) {
  return patterns.some((pattern) => matchesGlob(value, pattern));
}

// src/scanner/workspaceScanner.ts
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".bash",
  ".cfg",
  ".cjs",
  ".conf",
  ".config",
  ".cs",
  ".cts",
  ".go",
  ".gradle",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".ksh",
  ".mjs",
  ".mts",
  ".php",
  ".properties",
  ".ps1",
  ".py",
  ".rb",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh"
]);
var PACKAGE_MARKERS = /* @__PURE__ */ new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "composer.json"
]);
var SPECIAL_SOURCE_FILES = /* @__PURE__ */ new Set(["dockerfile", "makefile", "procfile"]);
var GENERATED_FILE_RE = /(?:\.min\.(?:js|css)$|\.bundle\.(?:js|css)$|\.map$|(?:^|\.)lock$)/i;
var LOCK_FILES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "composer.lock"
]);
function sourceCandidate(filePath) {
  const base = import_node_path12.default.basename(filePath).toLowerCase();
  if (GENERATED_FILE_RE.test(base) || LOCK_FILES.has(base)) return false;
  return SOURCE_EXTENSIONS.has(import_node_path12.default.extname(filePath).toLowerCase()) || SPECIAL_SOURCE_FILES.has(base) || base.startsWith("dockerfile.");
}
function configuredEnvMatch(rel, filePath, configured) {
  const base = import_node_path12.default.basename(filePath);
  return configured.some((entry) => {
    const normalized = entry.replace(/\\/g, "/");
    if (/[*?]/.test(normalized)) return matchesGlob(rel, normalized);
    return normalized.includes("/") ? rel === normalized : base === normalized;
  });
}
async function walkMatchingFiles(root, exclude, maxMatches, accepts, signal) {
  const files = [];
  let hitLimit = false;
  const stack = [""];
  while (stack.length) {
    if (signal?.aborted) throw new Error("ScanCancelled");
    const relDir = stack.pop();
    const absDir = import_node_path12.default.join(root, relDir);
    let entries;
    try {
      entries = await import_promises3.default.readdir(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = import_node_path12.default.posix.join(relDir.replace(/\\/g, "/"), entry.name);
      if (entry.isSymbolicLink()) continue;
      if (matchesAnyGlob(rel, exclude)) continue;
      if (entry.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      const abs = normalizePath(import_node_path12.default.join(root, rel));
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
async function walkFiles(root, exclude, maxMatches, envFiles, signal) {
  return walkMatchingFiles(
    root,
    exclude,
    maxMatches,
    (relativePath, absolutePath, name) => sourceCandidate(absolutePath) || configuredEnvMatch(relativePath, absolutePath, envFiles) || PACKAGE_MARKERS.has(name),
    signal
  );
}
function mergeIgnoreConfig(base, local) {
  return {
    ignoredVariables: [.../* @__PURE__ */ new Set([...base.ignoredVariables, ...local.ignoredVariables])],
    ignoredFiles: [.../* @__PURE__ */ new Set([...base.ignoredFiles, ...local.ignoredFiles])],
    ignoredRules: [.../* @__PURE__ */ new Set([...base.ignoredRules, ...local.ignoredRules])],
    rules: { ...base.rules, ...local.rules },
    compareEnvFiles: local.compareEnvFiles?.length ? local.compareEnvFiles : base.compareEnvFiles,
    envFiles: local.envFiles?.length ? local.envFiles : base.envFiles
  };
}
async function gitTrackedFiles(root, enabled, signal) {
  if (!enabled) return /* @__PURE__ */ new Set();
  try {
    await import_promises3.default.access(import_node_path12.default.join(root, ".git"));
    if (signal?.aborted) throw new Error("ScanCancelled");
    const result = await execFileAsync("git", ["-C", root, "ls-files", "-z", "--cached"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      signal,
      windowsHide: true
    });
    return new Set(
      result.stdout.split("\0").filter(Boolean).map((relativePath) => normalizePath(import_node_path12.default.join(root, relativePath)))
    );
  } catch (error) {
    if (signal?.aborted) throw new Error("ScanCancelled", { cause: error });
    return /* @__PURE__ */ new Set();
  }
}
var WorkspaceScanner = class {
  cache = /* @__PURE__ */ new Map();
  dotenv = new DotenvParser();
  detectors = [
    new JsTsDetector(),
    new PythonDetector(),
    new PhpDetector(),
    new DockerDetector(),
    new ShellDetector()
  ];
  invalidate(filePath) {
    if (!filePath) this.cache.clear();
    else this.cache.delete(normalizePath(filePath));
  }
  cacheSize() {
    return this.cache.size;
  }
  async scan(rootInput, options, ignore, signal) {
    const root = normalizePath(rootInput);
    const warnings = [];
    let rootStat;
    try {
      rootStat = await import_promises3.default.stat(root);
    } catch (error) {
      throw new Error("Workspace root must be a readable directory.", { cause: error });
    }
    if (!rootStat.isDirectory()) throw new Error("Workspace root must be a readable directory.");
    const configuredEnvFiles = ignore.envFiles?.length ? ignore.envFiles : options.envFiles;
    const exclude = [...options.exclude, ...ignore.ignoredFiles];
    const walked = await walkFiles(root, exclude, options.maxFiles, configuredEnvFiles, signal);
    if (walked.hitLimit)
      warnings.push(
        `File safety limit reached: considering the first ${options.maxFiles} matching files.`
      );
    const packageRoots = await this.discoverPackageRoots(root, walked.files);
    const projectConfigs = /* @__PURE__ */ new Map([[root, ignore]]);
    const rootsWithCustomEnvFiles = [];
    for (const packageRoot of packageRoots) {
      if (packageRoot === root) continue;
      const loaded = await loadIgnoreConfig(packageRoot);
      projectConfigs.set(packageRoot, mergeIgnoreConfig(ignore, loaded.config));
      if (loaded.config.envFiles?.length) rootsWithCustomEnvFiles.push(packageRoot);
      if (loaded.warning)
        warnings.push(`${import_node_path12.default.relative(root, packageRoot).replace(/\\/g, "/")}: ${loaded.warning}`);
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
        signal
      );
      for (const file of extra.files) {
        if (nearestRoot(file, packageRoots, root) !== packageRoot) continue;
        const workspaceRelative = import_node_path12.default.relative(root, file).replace(/\\/g, "/");
        if (matchesAnyGlob(workspaceRelative, exclude)) continue;
        allFiles.add(file);
      }
      if (extra.hitLimit)
        warnings.push(
          `File safety limit reached while discovering custom env files in ${import_node_path12.default.relative(root, packageRoot).replace(/\\/g, "/")}.`
        );
    }
    const absFiles = [...allFiles];
    const ignoredForProject = (file) => {
      const packageRoot = nearestRoot(file, packageRoots, root);
      const config = projectConfigs.get(packageRoot) ?? ignore;
      return matchesAnyGlob(
        import_node_path12.default.relative(packageRoot, file).replace(/\\/g, "/"),
        config.ignoredFiles
      );
    };
    const envPaths = absFiles.filter((file) => {
      const packageRoot = nearestRoot(file, packageRoots, root);
      const config = projectConfigs.get(packageRoot) ?? ignore;
      const configured = config.envFiles?.length ? config.envFiles : options.envFiles;
      return !ignoredForProject(file) && configuredEnvMatch(import_node_path12.default.relative(packageRoot, file).replace(/\\/g, "/"), file, configured);
    });
    const envPathSet = new Set(envPaths);
    const sourcePaths = absFiles.filter(
      (file) => !envPathSet.has(file) && sourceCandidate(file) && !ignoredForProject(file)
    );
    const analyzable = [...envPaths, ...sourcePaths];
    const analyzableSet = new Set(analyzable);
    for (const cachedPath of this.cache.keys()) {
      if (!analyzableSet.has(cachedPath)) this.cache.delete(cachedPath);
    }
    const trackedFiles = await gitTrackedFiles(root, options.scanGitTrackedEnvFiles, signal);
    let filesParsed = 0;
    let cacheHits = 0;
    const envFiles = [];
    const references = [];
    const secretFindings = [];
    for (let index = 0; index < analyzable.length; index++) {
      if (signal?.aborted) throw new Error("ScanCancelled");
      const file = analyzable[index];
      try {
        const stat = await import_promises3.default.stat(file);
        if (!stat.isFile()) continue;
        if (stat.size > options.maxFileSizeKb * 1024) {
          warnings.push(`Skipped oversized file: ${import_node_path12.default.relative(root, file).replace(/\\/g, "/")}`);
          continue;
        }
        const cached = envPathSet.has(file) ? void 0 : this.cache.get(file);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
          cacheHits += 1;
          references.push(...cached.references);
          secretFindings.push(...cached.secrets);
          continue;
        }
        const content = await import_promises3.default.readFile(file, "utf8");
        if (content.includes("\0")) continue;
        filesParsed += 1;
        let envFile;
        const fileRefs = [];
        let secrets = [];
        if (envPathSet.has(file)) {
          envFile = this.dotenv.parse(content, file);
          envFile.packageRoot = nearestRoot(file, packageRoots, root);
          envFiles.push(envFile);
          if (trackedFiles.has(file)) {
            secretFindings.push(...detectTrackedEnvSecrets(envFile.definitions, file));
          }
        } else {
          for (const detector of this.detectors.filter((detector2) => detector2.supports(file)))
            fileRefs.push(...await detector.detectReferences(content, file));
          secrets = detectSecrets(content, file);
          references.push(...fileRefs);
          secretFindings.push(...secrets);
        }
        if (!envPathSet.has(file))
          this.cache.set(file, {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            references: fileRefs,
            secrets
          });
      } catch (error) {
        if (error.message === "ScanCancelled") throw error;
        warnings.push(
          `Could not analyze ${import_node_path12.default.relative(root, file).replace(/\\/g, "/")}; check permissions or file encoding.`
        );
      }
      if (index % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
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
      projectConfigs
    };
  }
  async discoverPackageRoots(root, absFiles) {
    const roots = /* @__PURE__ */ new Set([root]);
    for (const file of absFiles)
      if (PACKAGE_MARKERS.has(import_node_path12.default.basename(file))) roots.add(normalizePath(import_node_path12.default.dirname(file)));
    return [...roots].sort((a, b) => a.length - b.length);
  }
  async buildProjects(root, packageRoots, sourcePaths, envFiles) {
    const projects = [];
    for (const packageRoot of packageRoots) {
      const sourceFiles = sourcePaths.filter(
        (file) => nearestRoot(file, packageRoots, root) === packageRoot
      );
      const projectEnvFiles = envFiles.filter((file) => file.packageRoot === packageRoot);
      if (packageRoot !== root && sourceFiles.length === 0 && projectEnvFiles.length === 0)
        continue;
      let name = import_node_path12.default.basename(packageRoot);
      try {
        const pkg = JSON.parse(
          await import_promises3.default.readFile(import_node_path12.default.join(packageRoot, "package.json"), "utf8")
        );
        if (pkg.name) name = pkg.name;
      } catch {
      }
      projects.push({
        root,
        packageRoot,
        name,
        frameworks: await detectFrameworks(packageRoot),
        sourceFiles,
        envFiles: projectEnvFiles
      });
    }
    return projects;
  }
};

// src/scanner/incrementalScanner.ts
var IncrementalScanner = class extends WorkspaceScanner {
  markChanged(filePath) {
    this.invalidate(filePath);
  }
  reset() {
    this.invalidate();
  }
};

// src/core/services/engine.ts
var DEFAULT_OPTIONS = {
  exclude: [
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/vendor/**",
    "**/.venv/**",
    "**/venv/**",
    "**/generated/**"
  ],
  envFiles: [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
    ".env.test",
    ".env.test.local",
    ".env.example",
    ".env.sample"
  ],
  compareEnvFiles: [".env.local", ".env.production", ".env.example"],
  maxFileSizeKb: 1024,
  maxFiles: 3e4,
  severity: {
    missing: "warning",
    unused: "information",
    secret: "error",
    inconsistent: "information",
    validation: "warning",
    parse: "warning"
  },
  scanGitTrackedEnvFiles: true
};
var EnvDoctorEngine = class {
  scanner = new IncrementalScanner();
  async scanWorkspace(root, partial = {}, signal) {
    const started = Date.now();
    const options = {
      ...DEFAULT_OPTIONS,
      ...partial,
      severity: { ...DEFAULT_OPTIONS.severity, ...partial.severity ?? {} },
      exclude: partial.exclude ?? DEFAULT_OPTIONS.exclude,
      envFiles: partial.envFiles ?? DEFAULT_OPTIONS.envFiles,
      compareEnvFiles: partial.compareEnvFiles ?? DEFAULT_OPTIONS.compareEnvFiles,
      scanGitTrackedEnvFiles: partial.scanGitTrackedEnvFiles ?? DEFAULT_OPTIONS.scanGitTrackedEnvFiles
    };
    const { config: ignore, warning } = await loadIgnoreConfig(root);
    const scan = await this.scanner.scan(root, options, ignore, signal);
    if (warning) scan.warnings.push(warning);
    const issues = [];
    const effectiveReferences = [];
    const effectiveSecretFindings = [];
    const effectiveEnvFiles = [];
    const effectiveEnvPathsByProject = /* @__PURE__ */ new Map();
    for (const project of scan.projects) {
      const projectIgnore = scan.projectConfigs.get(project.packageRoot) ?? ignore;
      const sourceSet = new Set(project.sourceFiles);
      const ignoredFile = (file) => matchesAnyGlob(relativeDisplay(project.packageRoot, file), projectIgnore.ignoredFiles);
      const ignoredVariables = new Set(projectIgnore.ignoredVariables);
      const refs = scan.references.filter(
        (ref) => sourceSet.has(ref.file) && !ignoredFile(ref.file) && !ref.ignored && !ignoredVariables.has(ref.name)
      );
      const envFiles = project.envFiles.filter((file) => !ignoredFile(file.path));
      const projectFileSet = /* @__PURE__ */ new Set([...sourceSet, ...envFiles.map((file) => file.path)]);
      const secrets = scan.secretFindings.filter(
        (finding) => projectFileSet.has(finding.file) && !ignoredFile(finding.file)
      );
      effectiveReferences.push(...refs);
      effectiveSecretFindings.push(...secrets);
      effectiveEnvFiles.push(...envFiles);
      effectiveEnvPathsByProject.set(
        project.packageRoot,
        new Set(envFiles.map((file) => file.path))
      );
      const context = {
        workspaceRoot: root,
        project,
        references: refs,
        envFiles,
        secretFindings: secrets,
        ignore: projectIgnore,
        dynamicReferencePresent: refs.some((r) => r.dynamic && !r.ignored)
      };
      const analyzers = [
        new MissingAnalyzer(),
        new UnusedAnalyzer(),
        new ComparisonAnalyzer(options.compareEnvFiles),
        new ValidationAnalyzer(),
        new SecretAnalyzer(),
        new PublicExposureAnalyzer(),
        new ParseAnalyzer()
      ];
      const ignoredRules = new Set(projectIgnore.ignoredRules);
      for (const analyzer of analyzers) {
        const analyzed = await analyzer.analyze(context);
        issues.push(
          ...analyzed.filter(
            (issue) => !ignoredRules.has(issue.kind) && !ignoredRules.has(issue.ruleId ?? "")
          )
        );
      }
    }
    const filtered = this.applySeverity(issues, options);
    const environments = effectiveEnvFiles.map((file) => ({
      name: import_node_path13.default.basename(file.path),
      file: file.path,
      variables: [...new Set(file.definitions.map((def) => def.name))].sort()
    }));
    const redactedEnvFiles = effectiveEnvFiles.map(redactEnvFile);
    const redactedByPath = new Map(redactedEnvFiles.map((file) => [file.path, file]));
    const redactedProjects = scan.projects.map((project) => {
      const allowed = effectiveEnvPathsByProject.get(project.packageRoot) ?? /* @__PURE__ */ new Set();
      return {
        ...project,
        envFiles: project.envFiles.filter((file) => allowed.has(file.path)).map((file) => redactedByPath.get(file.path) ?? redactEnvFile(file))
      };
    });
    const missingNames = new Set(
      filtered.filter((issue) => issue.kind === "missing").map((i) => `${i.packageRoot}:${i.name}`)
    );
    const allReferenceNames = new Set(
      effectiveReferences.filter((r) => !r.dynamic).map((r) => `${this.projectRootForFile(scan.projects, r.file)}:${r.name}`)
    );
    const valid = [...allReferenceNames].filter((key) => !missingNames.has(key)).length;
    return {
      workspaceRoot: root,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      projects: redactedProjects,
      references: effectiveReferences,
      envFiles: redactedEnvFiles,
      issues: filtered,
      secretFindings: effectiveSecretFindings,
      environments,
      summary: {
        valid,
        missing: filtered.filter((i) => i.kind === "missing").length,
        unused: filtered.filter((i) => i.kind === "unused").length,
        secrets: filtered.filter((i) => i.kind === "secret").length,
        inconsistent: filtered.filter((i) => i.kind === "inconsistent").length,
        validation: filtered.filter((i) => i.kind === "validation").length,
        parse: filtered.filter((i) => i.kind === "parse").length
      },
      scan: {
        filesConsidered: scan.filesConsidered,
        filesParsed: scan.filesParsed,
        cacheHits: scan.cacheHits,
        durationMs: Date.now() - started,
        warnings: scan.warnings
      }
    };
  }
  applySeverity(issues, options) {
    const byKind = {
      missing: options.severity.missing,
      unused: options.severity.unused,
      secret: options.severity.secret,
      inconsistent: options.severity.inconsistent,
      validation: options.severity.validation,
      parse: options.severity.parse
    };
    return issues.flatMap((issue) => {
      const configured = byKind[issue.kind];
      if (configured === "off") return [];
      if (configured) return [{ ...issue, severity: configured }];
      return [issue];
    });
  }
  projectRootForFile(projects, file) {
    return projects.find((p) => p.sourceFiles.includes(file))?.packageRoot ?? projects[0]?.packageRoot ?? "";
  }
};
function redactEnvFile(file) {
  return {
    ...file,
    definitions: file.definitions.map((definition) => ({ ...definition, value: "" }))
  };
}

// src/core/services/safeReport.ts
var import_node_path14 = __toESM(require("node:path"));
function toSafeReport(report) {
  const root = report.workspaceRoot;
  return {
    workspaceRoot: import_node_path14.default.basename(root),
    generatedAt: report.generatedAt,
    projects: report.projects.map((p) => ({
      name: p.name,
      packageRoot: relativeDisplay(root, p.packageRoot),
      frameworks: p.frameworks,
      sourceFileCount: p.sourceFiles.length,
      envFiles: p.envFiles.map((f) => relativeDisplay(root, f.path))
    })),
    issues: report.issues.map((i) => ({
      id: i.id,
      kind: i.kind,
      name: i.name,
      message: i.message,
      severity: i.severity,
      confidence: i.confidence,
      ruleId: i.ruleId,
      packageRoot: relativeDisplay(root, i.packageRoot),
      location: i.location ? {
        file: relativeDisplay(root, i.location.file),
        line: i.location.line,
        column: i.location.column
      } : void 0,
      related: i.related?.map((r) => ({
        file: relativeDisplay(root, r.file),
        line: r.line,
        column: r.column
      }))
    })),
    environments: report.environments.map((e) => ({
      name: e.name,
      file: relativeDisplay(root, e.file),
      variables: e.variables
    })),
    summary: report.summary,
    scan: report.scan
  };
}

// src/cli/index.ts
function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "check";
  let format = "human";
  let root = import_node_process.default.cwd();
  let help = false;
  let scanGitTrackedEnvFiles = true;
  for (let i = 0; i < argv.length; i++) {
    if (i === 0 && argv[i] === command && command !== "check") continue;
    if (i === 0 && argv[i] === "check") continue;
    if (argv[i] === "--help" || argv[i] === "-h") help = true;
    else if (argv[i] === "--no-git") scanGitTrackedEnvFiles = false;
    else if (argv[i] === "--format" && argv[i + 1]) format = argv[++i];
    else if (argv[i].startsWith("--format="))
      format = argv[i].slice("--format=".length);
    else if (argv[i] === "--root" && argv[i + 1]) root = import_node_path15.default.resolve(argv[++i]);
    else if (argv[i].startsWith("--root=")) root = import_node_path15.default.resolve(argv[i].slice("--root=".length));
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!["human", "json", "github"].includes(format))
    throw new Error("Supported formats: human, json, github.");
  if (command !== "check" && !help)
    throw new Error(
      "Usage: env-doctor check [--format human|json|github] [--root PATH] [--no-git]"
    );
  return { command, format, root, help, scanGitTrackedEnvFiles };
}
function printHelp() {
  console.log(`Env Doctor

Usage:
  env-doctor check [--format human|json|github] [--root PATH] [--no-git]

Options:
  --format   Select human, sanitized JSON, or GitHub annotation output.
  --root     Scan a specific workspace root (defaults to the current directory).
  --no-git   Disable detection of credential-like values in Git-tracked env files.
  -h, --help Show this help.`);
}
function printHuman(report) {
  console.log("Env Doctor");
  console.log("");
  const failure = report.summary.missing || report.summary.secrets || report.summary.validation || report.summary.parse;
  console.log(failure ? "\u274C Configuration validation failed" : "\u2713 Configuration validation passed");
  console.log("");
  const sections = [
    ["Missing", report.issues.filter((i) => i.kind === "missing")],
    ["Unused", report.issues.filter((i) => i.kind === "unused")],
    ["Secrets", report.issues.filter((i) => i.kind === "secret")],
    ["Inconsistent", report.issues.filter((i) => i.kind === "inconsistent")],
    ["Validation", report.issues.filter((i) => i.kind === "validation")],
    ["Parse problems", report.issues.filter((i) => i.kind === "parse")]
  ];
  for (const [title, issues] of sections) {
    if (!issues.length) continue;
    console.log(`${title}:`);
    for (const issue of issues) {
      const loc = issue.location ? ` (${relativeDisplay(report.workspaceRoot, issue.location.file)}:${issue.location.line})` : "";
      console.log(`  ${issue.name ?? issue.ruleId ?? issue.kind}${loc}`);
    }
    console.log("");
  }
  console.log(
    `Scanned ${report.scan.filesConsidered} files in ${report.scan.durationMs}ms (${report.scan.cacheHits} cache hits).`
  );
}
function printGithub(report) {
  const escapeData = (value) => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const escapeProperty = (value) => escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
  for (const issue of report.issues) {
    const level = issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "notice";
    const loc = issue.location;
    const metadata = loc ? ` file=${escapeProperty(relativeDisplay(report.workspaceRoot, loc.file))},line=${loc.line},col=${loc.column}` : "";
    const message = escapeData(issue.message);
    console.log(`::${level}${metadata}::Env Doctor: ${message}`);
  }
}
async function main() {
  try {
    const args = parseArgs(import_node_process.default.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }
    const engine = new EnvDoctorEngine();
    const report = await engine.scanWorkspace(args.root, {
      scanGitTrackedEnvFiles: args.scanGitTrackedEnvFiles
    });
    if (args.format === "json") console.log(JSON.stringify(toSafeReport(report), null, 2));
    else if (args.format === "github") printGithub(report);
    else printHuman(report);
    import_node_process.default.exitCode = report.summary.missing > 0 || report.summary.secrets > 0 || report.summary.validation > 0 || report.summary.parse > 0 ? 1 : 0;
  } catch (error) {
    console.error(`Env Doctor: ${error instanceof Error ? error.message : "Unknown CLI error"}`);
    import_node_process.default.exitCode = 2;
  }
}
void main();
//# sourceMappingURL=cli.js.map
