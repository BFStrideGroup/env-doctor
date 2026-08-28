# Changelog

All notable changes to Env Doctor are documented here.

## 1.0.0 - 2026-08-28

### Added

- Local, package-aware workspace scanner with default exclusions, file limits, symlink avoidance, incremental cache, cancellation, and multi-root VS Code orchestration.
- Dotenv parser supporting comments, quoting, escaped double-quoted characters, empty values, `export`, and multiline quoted values.
- JavaScript/TypeScript AST detector for `process.env`, bracket access, destructuring, dynamic-access confidence, and Vite `import.meta.env`.
- Python, PHP/Laravel, Docker/Compose, and Shell environment-reference detectors.
- Missing, unused, environment-comparison, parse, rule-validation, and local secret analyzers.
- Conservative unused-variable confidence when dynamic environment access exists.
- `.envdoctorrc` project policy, ignore lists, validation rules, and inline `ENV_DOCTOR_IGNORE` support.
- Safe `.env.example` generation with diff preview, overwrite protection, placeholders, and optional non-secret defaults.
- VS Code Tree View, diagnostics, status bar, report panel, commands, navigation, context actions, and Quick Fixes.
- CLI with human, sanitized JSON, and GitHub Actions formats.
- Free/development `LicenseProvider` abstraction for future optional Pro capabilities.
- Security tests and static security lint guarding against value logging/serialization.
- Automated unit/integration/security/performance tests and reproducible local VSIX packaging.
- Git-tracked env-file checks, generic config-file secret scanning, and client-public variable exposure warnings.
- Optional-access semantics for JavaScript/TypeScript fallbacks and Python/Docker/Shell defaults to reduce false missing findings.
- Package-local custom env-file discovery, configurable validation/parse severities, filtered command reports, and fixed Tree View context actions.
- Cross-platform build/test scripts, real ESLint/Prettier checks, bundled extension entry points, and deterministic compressed packaging.
