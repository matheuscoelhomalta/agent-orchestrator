# Changelog

## 0.1.0 — 2026-09-28

Initial public release of the local agent supervisor.

- Coordinate native Codex and Claude Code workers through ACPX and pinned ACP adapters; optionally use the installed Antigravity CLI subject to its provider terms.
- Start independent tasks, monitor progress and events, wait for settlement, request cancellation, and continue the same native session.
- Keep private task records, validate structured responses, allow one explicit formatting correction, and record acceptance only for a reviewed current request.
- Reconcile unknown outcomes before continuing. Apply verified, harness-specific restrictions with `--strict`; consult the permission limits before use.
- Install locally from a GitHub checkout. Includes an optional coordinator skill, documentation website, contributor guidance, and MIT license for project source.

Verification: 48 Node fixture tests and 3 Python installer tests, with CI on Linux and macOS using Node 22.13.0 and 24. Native checks and unverified behavior are recorded separately in [the live test report](docs/MULTI-HARNESS-TEST-2026-09-27.md).

This is an early-stage release. Native tools, models, and services have separate licenses, account requirements, permission behavior, and usage charges. Windows native support and unattended long-running supervision are unverified. No npm package is published.
