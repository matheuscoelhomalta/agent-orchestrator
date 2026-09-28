---
title: "CLI for Codex and Claude Code agents"
description: "Coordinate Codex and Claude Code from your terminal. Run parallel tasks, resume native sessions, and accept results only after verification. Open source under MIT."
permalink: /
---

<p class="eyebrow">Open source · Local CLI · MIT licensed</p>

# Coordinate coding agents. Verify their work.

<p class="lead">Run Codex and Claude Code in parallel from your terminal. Keep task records, continue native sessions, and make verification part of every handoff.</p>

<div class="actions">
  <a class="button primary" href="{{ '/getting-started/' | relative_url }}">Get started →</a>
  <a class="button" href="{{ '/workflows/' | relative_url }}">Run a parallel review</a>
</div>

```sh
agent-orchestrator --json status
agent-orchestrator --json wait WORKER_ID --timeout 600
agent-orchestrator --json result WORKER_ID
```

Agent Orchestrator is a small local supervisor for native coding agents. Use it for independent reviews, scoped edits, and follow-up work. It runs in your existing terminal, including Ghostty, with a private local task ledger and one runner per worker.

## From delegation to evidence

1. **Start bounded work.** Give each worker a prompt file, a working directory, a scope, and completion criteria. Use disjoint scopes for parallel edits.
2. **Keep track of every worker.** Monitor progress, collect results, and continue the same native session. Interrupted work with uncertain side effects requires reconciliation before continuing.
3. **Accept verified results.** A completed model turn becomes `needs_review`. Inspect the evidence, then explicitly record acceptance for the current request.

[Follow the parallel Codex and Claude Code workflow →](WORKFLOWS.md)

## Install from GitHub

Requires Node.js 22.13.0+, npm, Git, Python 3, Make, and a POSIX shell. Install and authenticate the native Codex and Claude Code commands for the default configuration. Model calls use your provider account and quota.

```sh
git clone https://github.com/matheuscoelhomalta/agent-orchestrator.git
cd agent-orchestrator
npm ci --ignore-scripts --no-audit --no-fund
make install-local
export PATH="$HOME/.local/bin:$PATH"
agent-orchestrator --json doctor
```

`doctor` checks installation and configuration without calling a model; it does not verify authentication. Keep the checkout in place: the installed wrapper points to it. Releases are available on [GitHub](https://github.com/matheuscoelhomalta/agent-orchestrator/releases); this package is not published to npm.

[Installation, first task, updates, and uninstalling →](GETTING-STARTED.md)

## Know the boundaries

This is an early-stage supervisor. `--scope` is advisory, and `--strict` applies native restrictions with harness-specific exceptions. Read-only prompts do not enforce a read-only filesystem. Review the [permission boundary](CLI.md#permission-boundary) before running edits.

macOS has recorded native harness checks; Linux CI covers fixtures and installation. Native Windows support is unverified. The optional Antigravity integration has separate [provider-terms considerations](https://github.com/matheuscoelhomalta/agent-orchestrator/blob/main/THIRD-PARTY.md#antigravity-integration). See the [verification report](MULTI-HARNESS-TEST-2026-09-27.md) for observed behavior and remaining gaps.

## Built to stay small

[ACPX](https://github.com/openclaw/acpx) and the native ACP adapters handle execution. Agent Orchestrator adds task accounting, response validation, bounded correction, explicit acceptance, and unknown-outcome handling. No daemon, port, or dashboard is required.

Read the [CLI reference](CLI.md), install the [coordinator skill](DAILY-WORKFLOW.md), or learn [why the project exists](PROJECT-BRIEF.md).
