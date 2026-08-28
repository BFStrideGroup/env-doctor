# Security Policy

## Supported versions

The current `1.x` line receives security fixes while it is the latest maintained release.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose credentials or source code. Before publication, replace the repository placeholder in `package.json` with the real project repository and configure a private security-reporting channel (for example GitHub Private Vulnerability Reporting or a dedicated security email).

Until that project-specific channel is configured, distribute builds only to trusted testers.

## Security design

Env Doctor is local-first. Core analysis does not require a backend, account, telemetry service, or AI API.

Security invariants:

- `.env` and source contents are read locally only for analysis.
- Environment values are never written to the Env Doctor output channel.
- Git awareness uses only the local `git ls-files` command; no repository data is transmitted.
- Public/CLI report serialization uses `toSafeReport()` and excludes environment values and complete detected literal secrets.
- Secret findings contain only metadata and a masked preview; the UI does not display complete detected secrets.
- `.env.example` generation starts from names and uses empty values unless an explicitly configured placeholder or narrowly recognized non-secret default is allowed.
- Existing `.env.example` content is not overwritten without confirmation.
- Credential-like configured placeholders are accepted only when they use an obvious placeholder form.
- Quick Fixes never write a production secret; they add empty placeholders/definitions or suppression policy.
- The scanner does not follow symlinks during repository traversal.
- Default exclusions include `.git`, `node_modules`, build output, coverage, vendor, Python virtual environments, and generated directories.
- File count and file size limits bound accidental expensive scans.
- No telemetry is implemented.
- The report webview uses a per-render cryptographic Content Security Policy nonce and has no network source permissions.

## Threat model notes

Env Doctor cannot determine whether an externally injected deployment variable exists. Missing-variable findings describe local/repository evidence, not external platform state. Secret detection is heuristic and should not be treated as proof that a credential is valid.
