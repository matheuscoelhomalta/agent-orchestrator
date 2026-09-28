---
title: "Coordinate coding agents from your terminal"
description: "Use the coordinator skill to delegate scoped tasks, monitor workers, handle blockers, and accept verified results."
permalink: /coordinator/
---

# Coordinate coding agents from your terminal

The installed CLI needs no daemon or UI. Link the coordinator skill for each main agent that should use it: `ln -s /path/to/agent-orchestrator/skills/agent-orchestrator ~/.agents/skills/agent-orchestrator` for Codex and the same target under `~/.claude/skills/` for Claude. Open a new native agent session afterwards so its skill catalog refreshes. The skill is explicitly invoked: ask the main agent to use `$agent-orchestrator` with an objective, authorized paths, and concrete completion criteria. In Claude Code, the skill is also available as `/agent-orchestrator`. It does not select itself automatically. Claude Code is the verified main agent; a Codex main agent's sandbox blocked worker startup in testing.

Example request: “Use agent-orchestrator to delegate a read-only correctness review to Codex and an accessibility review to Claude. Monitor both, resolve routine blockers, inspect each finding, and report only independently verified results. Do not modify files.”

For direct CLI use, create a task prompt file and keep the IDs returned by start:

```sh
agent-orchestrator --json doctor
agent-orchestrator --json start --harness codex --cwd /path/to/project --prompt-file /path/to/task.txt --criteria 'Concrete evidence proving the task is complete' --scope 'Read-only src/pricing.js'
agent-orchestrator --json status
agent-orchestrator --json events WORKER_ID --after 0 --limit 100
agent-orchestrator --json result WORKER_ID
```

Add `--strict` to `start` for any task that edits files. It applies native write restrictions with [harness-specific exceptions](CLI.md#permission-boundary), including writable temporary directories for Codex. A read-only prompt is an instruction, not an enforced sandbox.

For waiting, event cursors, per-state handling, cancellation, and reconciliation, follow the coordinator skill's [Monitor all workers](https://github.com/matheuscoelhomalta/agent-orchestrator/blob/main/skills/agent-orchestrator/SKILL.md#monitor-all-workers) guidance. Follow [Accept only verified results](https://github.com/matheuscoelhomalta/agent-orchestrator/blob/main/skills/agent-orchestrator/SKILL.md#accept-only-verified-results) before accepting a result or ending the overall task.

State normally lives under `~/.local/state/agent-orchestrator`. For experiments, create a private directory with `mktemp -d` and pass it with `--state-dir` on every command. Prompts, outputs and native histories can contain private data; keep them local.

Both installed skill links point into this checkout. Moving or deleting it breaks those links and the installed CLI wrapper. Installation never replaces conflicting client entries. To install the same existing package on another local machine, verify the two client roots are real directories and target names are absent before linking the package; preserve any conflict.

Codex and Claude are the CLI defaults, plus Antigravity (`agy`) when installed; see the [CLI contract](CLI.md) for agy permission limits and other harnesses. Grok cannot run through the CLI; do not work around the permission-configuration check to enable it. The system is a bounded local supervisor with coordinator verification, not an unattended crash-proof service or an OS sandbox.
