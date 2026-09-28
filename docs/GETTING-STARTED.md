---
title: "Install Agent Orchestrator"
description: "Install the local coding-agent CLI, check your environment, run a first task, and learn how to update or uninstall."
permalink: /getting-started/
---

# Getting started with Agent Orchestrator

Agent Orchestrator coordinates native coding agents from a terminal. It keeps task state and session identities locally while the native harness performs the work. Start with a small repository you are authorized to inspect.

## Supported environments

| Environment | Verification and limits |
|---|---|
| macOS | Local fixture suite, installer, and the recorded native harness pilots were exercised here. |
| Linux | POSIX implementation; CI exercises fixtures and installation. Native harness parity is not established by those tests. |
| Windows | Native Windows installation and process/permission behavior are unverified; there is no Windows installer. WSL native harness behavior is also unverified. |

Node.js 22.13.0 is the minimum. The CI matrix covers that minimum and Node 24 on Linux and macOS. Python 3 and Make are needed for `make install-local` and `make test`; the running CLI uses Node. You also need Git, npm, and a POSIX shell.

The default configuration includes both `codex` and `claude`. Install and sign in to their native CLIs using their official instructions, then confirm they work in a normal terminal. `doctor` reports the health of every configured harness, so a missing unused default can make it fail; a [trusted custom configuration](CLI.md#native-configuration) can limit the harness map to those you use. Antigravity is optional and detected only when `agy` is executable on PATH.

Model access, provider terms, and usage charges remain those of your own native account. Review [third-party terms](https://github.com/matheuscoelhomalta/agent-orchestrator/blob/main/THIRD-PARTY.md), especially before using Antigravity. Do not copy credentials into project files.

## Install from GitHub

```sh
git clone https://github.com/matheuscoelhomalta/agent-orchestrator.git
cd agent-orchestrator
npm ci --ignore-scripts --no-audit --no-fund
make install-local
export PATH="$HOME/.local/bin:$PATH"
agent-orchestrator --json doctor
agent-orchestrator --help
```

Add the PATH setting to your shell configuration if `~/.local/bin` is not already present. The installer refuses to overwrite a conflicting command. Its wrapper contains the current Node executable and checkout path: moving either requires inspecting and replacing that wrapper deliberately.

The dependency install does not install or log in to all native harnesses for you. `doctor` is a static check and makes no paid model call. A successful doctor does not prove account access or model availability.

## First task

Follow the complete [README review example](https://github.com/matheuscoelhomalta/agent-orchestrator/blob/main/README.md#review-a-repository), then read the [parallel review and continuation examples](WORKFLOWS.md). Keep the worker ID and current request ID from each start or reply. `wait` finishing means execution settled, not that the task succeeded. Inspect `result`, handle its state, and accept only independently verified `needs_review` results.

Use `--strict` for editing tasks and understand its [native permission limits](CLI.md#permission-boundary). Neither a read-only prompt nor `--scope` enforces a read-only filesystem.

## Update

From the installed checkout, first inspect `git status` and preserve any local changes. Read the release notes before updating; stop or account for active workers before changing their runtime dependencies. For a checkout following `main`:

```sh
git pull --ff-only
npm ci --ignore-scripts --no-audit --no-fund
make test
make install-local
agent-orchestrator --json doctor
```

`git pull --ff-only` refuses divergent history. If you use a release tag, inspect the desired release and check out its tag after preserving local changes; do not merge `main` into a release checkout by accident.

## Uninstall

Account for active workers with `status`; request cancellation for any work you intend to stop and poll until settled. Inspect `~/.local/bin/agent-orchestrator` and remove it only if it is this project's installed wrapper. Likewise, remove optional coordinator skill links only when they point to this checkout. You may then remove the checkout.

Uninstalling does not remove task records or native histories. Keep or delete `~/.local/state/agent-orchestrator` separately after checking it for data you need. Custom `--state-dir` directories and native provider stores are separate; never delete them indiscriminately.

## Troubleshooting

| Symptom | Next check |
|---|---|
| Command not found | Confirm `~/.local/bin` is on PATH and the wrapper's checkout/Node paths still exist. |
| `DOCTOR_FAILED` | Read the per-harness checks; verify Node, installed dependencies, native commands, and custom config paths. |
| Authentication failure or unavailable model | Test the native CLI directly with your own account. Doctor does not validate authentication or model access. |
| Workers fail only inside a coordinator's sandbox | The sandbox may deny access to native state. The recorded Codex coordinator launch was blocked; do not automatically loosen permissions. |
| `needs_input` | Read the question or denied action. Supply an authorized answer with `reply`; the CLI cannot approve a suspended native dialog. |
| `invalid_output` | Inspect output; one explicitly requested formatting correction is available. Do not repeat task execution to fix formatting. |
| `unknown` | Inspect processes, native history, and possible side effects before resolving. Do not blindly retry. |

For unresolved problems, submit a sanitized reproduction through the [contribution guide](https://github.com/matheuscoelhomalta/agent-orchestrator/blob/main/CONTRIBUTING.md).
