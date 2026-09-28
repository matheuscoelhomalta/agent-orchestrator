# Contributing to Agent Orchestrator

Bug reports, focused fixes, and documentation improvements are welcome. Discuss changes to permissions, persistence, supported harnesses, or the CLI contract in an issue before implementing them.

## Local development

Use Node.js 22.13.0 or newer, npm, Python 3, and Make in a POSIX environment. Clone the repository, then run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
make test
```

The Node integration tests use local ACP and Antigravity fixtures. They do not call paid models or require native account credentials. Python tests exercise the local installer. Native harness checks are separate, opt-in work that consumes the tester's own quota.

Keep runtime changes small and preserve the documented command output, session identity, request identity, permissions, and unknown-outcome handling. Add a regression test when behavior changes. Update the [CLI contract](docs/CLI.md) when its behavior changes. Do not edit historical test reports to imply new native verification.

## Pull requests

Explain the problem, resulting behavior, and the checks you ran. Mention unverified behavior explicitly. Keep unrelated changes separate. CI must pass before merging; dependency updates also need compatibility review because adapter changes can affect native permissions and session continuation.

Use only code and other material you have the right to contribute, and preserve third-party notices. Do not submit credentials, private prompts, native session stores, or raw task logs. Use minimal synthetic reproductions. Follow the [code of conduct](CODE_OF_CONDUCT.md).

## Reports and support

Use [GitHub issues](https://github.com/matheuscoelhomalta/agent-orchestrator/issues) for reproducible bugs and focused feature requests. Include the OS, Node version, project revision, adapter/native CLI versions, and sanitized error code. Review any `doctor` output before sharing it: local paths may be personal.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue. Maintenance is best effort; there is no guaranteed response time. Current limitations are listed in the [getting started guide](docs/GETTING-STARTED.md#supported-environments).
