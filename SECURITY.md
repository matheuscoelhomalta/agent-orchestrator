# Security policy

## Supported versions

Security fixes target the latest release and the current `main` branch. Older versions do not have a separate backport commitment. This is an early-stage local supervisor, not a multi-user service or an OS security boundary.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/matheuscoelhomalta/agent-orchestrator/security/advisories/new) for this repository. Include the affected revision, environment, a minimal reproduction, impact, and any suggested fix. Do not attach real credentials, private prompts, or native session databases. If the private reporting form is unavailable, open an issue requesting a private contact without disclosing the vulnerability.

Reports are handled on a best-effort basis; no response deadline or bounty is promised. Coordinate public disclosure with the maintainer while a report is investigated. Report vulnerabilities in a native harness or dependency to its upstream maintainer as appropriate.

## Operational boundaries

- `--scope` is advisory. Read-only task instructions do not enforce read-only access.
- `--strict` applies harness-specific native restrictions, with exceptions such as Codex's writable temporary directories. Read the [permission boundary](docs/CLI.md#permission-boundary).
- Configuration is trusted executable argv. Use only configurations and repositories you trust. Do not store credentials in configuration or prompts.
- Native harnesses retain their own authentication, tool permissions, network behavior, histories, and provider data policies. Tasks can consume paid quota.
- The private task ledger can contain sensitive prompts, output, paths, and session identifiers. `evidence/` is ignored by Git, but other custom state directories are not automatically excluded.
- An `unknown` result can include side effects. Reconcile it before retrying; acceptance requires independent inspection of evidence.

Secret scanning and tests reduce risk but do not establish that model output, a repository, or a native tool is safe.
