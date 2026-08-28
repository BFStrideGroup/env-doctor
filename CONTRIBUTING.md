# Contributing to Env Doctor

Thanks for helping improve Env Doctor. Changes should preserve the project's priorities: accuracy, privacy, developer UX, and maintainability.

## Setup

```bash
npm install
npm run compile
npm test
npm run lint
npm run format
```

## Architecture rules

- Keep analysis/domain code independent of the VS Code API.
- Add language support through `LanguageDetector` implementations instead of special-casing the scanner.
- Never make a concrete missing/used claim for unresolved dynamic access.
- Never place environment values or complete detected secrets in diagnostics, logs, test snapshots, serialized reports, or telemetry.
- Add tests for every parser/analyzer bug fix.
- Prefer native VS Code surfaces over custom dashboard UI.

## Adding a detector

1. implement `LanguageDetector`;
2. return normalized `EnvReference` records with file/line/column/access type/confidence;
3. register it in `WorkspaceScanner`;
4. add positive, negative, ignore-directive, and dynamic-access tests;
5. document the syntax in README.

## Pull requests

Keep PRs focused. Describe correctness trade-offs and false-positive behavior explicitly. Security-sensitive changes should include a note explaining how secret values are prevented from reaching external output.
