---
title: "CLI reference and permission boundaries"
description: "Commands, flags, JSON output, native configuration, task states, session recovery, and permission limits for Agent Orchestrator."
permalink: /cli/
---

# CLI contract

Version 0.1.0 is a local, terminal-first supervisor. Node 22.13.0+ and existing native Codex/Claude logins are required for the default configuration; an Antigravity login is needed only when `agy` is installed and used. Dependencies are pinned: ACPX 0.19.3, codex-acp 1.13.1, and claude-agent-acp 0.81.2. No Grok/X capability is claimed. See [getting started](GETTING-STARTED.md) for installation prerequisites, supported environments, and account/model availability limits.

## Setup

```sh
npm ci --ignore-scripts --no-audit --no-fund
make install-local
agent-orchestrator --json doctor
```

The installer creates a wrapper at `~/.local/bin/agent-orchestrator`, refuses conflicting commands, and requires this checkout and Node to remain available. Ensure `~/.local/bin` is on PATH. The coordinator skill lives at `skills/agent-orchestrator/`; the installer creates no skill links (see the [daily workflow](DAILY-WORKFLOW.md)).

## Commands

| Command | Behavior |
|---|---|
| `doctor` | Static dependency/configuration/native-command checks; no model call and no authentication verification |
| `start --harness NAME --prompt-file FILE --criteria TEXT --scope TEXT` | Record a task and start an asynchronous runner; returns worker/request IDs before task completion |
| `status [ID]` | Compact worker summaries with identity, task state, heartbeat/progress, and blockers; reconcile missing/stale runner into unknown |
| `wait [ID...] [--timeout N]` | Block until those workers (or all) leave starting/running, reconciling each second; returns `settled` false at the timeout (1–3600 seconds, default 300) |
| `events ID --after N --limit N` | Sequenced page with nextCursor; limit 1–1000, default 100 |
| `result ID` | Current full text transcript, validated response text, response, execution settlement, task state, acceptance, reconciliation, and prior-turn history |
| `reply ID --prompt-file FILE` | New request in the same native session; prior result saved in record history |
| `reply ID --prompt-file FILE --correction` | One explicitly requested formatting correction per task, only from invalid_output; ordinary reply cannot bypass it |
| `cancel ID` | Write request-scoped cancellation marker, including for a live unknown runner; poll for settlement |
| `accept ID --request REQUEST --note TEXT` | Record coordinator verification of the current settled needs_review result |
| `resolve ID --request REQUEST --note TEXT` | Record side-effect reconciliation of the specified unknown request and settle it as failed; runner must no longer exist |

Common flags: `--state-dir DIR`, `--json`, `--help`. Start also takes `--cwd`, `--config`, `--objective`, `--strict`, and `--timeout` (1–3600 seconds, default 300). The timeout applies to the model turn; native initialization/load and owned cleanup can extend wall time. `--config` selects a trusted harness map at start; its snapshot is retained for subsequent replies.

Machine-readable command output uses `{ "ok": true, "data": ... }`; failures under `--json` use `{ "ok": false, "error": { "code": "...", "message": "..." } }` on stdout and nonzero exit status. Without `--json`, data remains readable JSON and errors go to stderr. A failed doctor also returns top-level ok=false with error code DOCTOR_FAILED and its detailed check data. Empty configurations and nonexecutable commands are rejected or reported unhealthy. Help is plain text. A successful read can report a failed worker: command success and task success are distinct.

```json
{"ok":true,"data":{"id":"worker-id","requestId":"request-id","state":"starting"}}
```

```json
{"ok":true,"data":{"events":[{"seq":1,"type":"runner_started"}],"nextCursor":1}}
```

```json
{"ok":false,"error":{"code":"INVALID_STATE","message":"Worker is active or has an unresolved outcome."}}
```

`wait` returns `{"settled":true|false,"workers":[...]}`. A worker counts as unsettled while it is starting or running, or while it is unknown with a still-live runner. Without IDs it waits on every worker in the state directory.

Event types include `runner_started`, `adapter_spawned`, `configuration_verified` (ACP) or `configuration_reported` (agy), `prompt_dispatched`, `text_delta`, `tool_call` (with the tool's name and status), `status`, `permission_denied`, `cancel_requested`, `adapter_exited`, and `turn_settled`. Thought chunks and raw tool payloads are never stored.

## Response and acceptance

Workers are prompted to return one strict JSON object:

```json
{"status":"completed","summary":"What changed or was found","evidence":["Check or artifact reference"]}
```

```json
{"status":"needs_input","question":"Material decision needed"}
```

```json
{"status":"failed","reason":"Why the objective was not completed"}
```

Completed JSON becomes needs_review. Only an explicit accept command with the current request ID marks it accepted. The caller must actually inspect evidence: a note is an audit record, not an automated semantic verifier. Invalid JSON or valid JSON that fails the response schema becomes invalid_output. No automatic task retry or semantic correction is performed.

### Response framing

`result.output` retains the full non-thought text transcript. `responseOutput` is the text subjected to strict JSON validation; `responseMessageId` identifies its producer message when available. For ACP harnesses (Codex and Claude both send progress notes as separate messages), distinct non-interleaved message IDs allow progress messages to remain auditable while validating the last message. Missing, blank, or interleaved IDs fall back to validating the whole stream. For agy, the final `result.response` is validated. Prose within the final message is still invalid; JSON is never extracted from arbitrary text. Message IDs are framing hints, not permission or authenticity evidence. Replies archive these fields with the prior request.

## Native configuration

Defaults: Codex gpt-5.6-sol/high in agent Auto-review mode; Claude claude-opus-5-5/medium in auto mode; agy (below) when installed. Configuration is applied via ACPX before the task prompt and verified from accepted mode/status responses. Claude's advertised `opus` alias is accepted only as the explicitly configured canonical alias. Changing versions or providers may require configuration changes and fresh verification.

### Antigravity (`agy`)

The `agy` harness (`protocol: "agy-print"`) runs the unmodified, logged-in CLI through its headless interface: `agy --print PROMPT --output-format stream-json --model MODEL --effort EFFORT --print-timeout Ns`, adding `--conversation ID` for replies. Google's separate `agy_acp_server` connector and Antigravity OAuth tokens are deliberately not used. This does not establish provider authorization: review the [Antigravity terms considerations](https://github.com/matheuscoelhomalta/agent-orchestrator/blob/main/THIRD-PARTY.md#antigravity-integration) before use. The default is `gemini-3.8-flash-medium`/medium. The harness is offered only when an `agy` executable is on PATH. It is spawned without a shell, so shell aliases (such as one adding `--dangerously-skip-permissions`) never apply, and that flag is rejected in configured commands.

- Permissions come from the user's native `toolPermission` setting; no per-run override exists. The reported mode is recorded as `configuration.mode` but not enforced, by explicit user choice: under `always-proceed`, agy acts without any check the CLI can see. Under `request-review`, refused actions arrive as `denied_actions` and the task becomes needs_input; agy commonly tries shell verification commands, so otherwise complete turns may stop there.
- Model and effort are passed as flags but not reported back, so they are recorded as requested, not verified.
- The final `result.response` is validated; streamed progress text remains in `output`.
- The prompt is passed in argv, so dispatch is recorded when the process starts, and its PID is kept as `adapterPid` until it exits.
- agy reports its own print timeout as SUCCESS with partial output and a stderr notice; the CLI records a TIMEOUT failure. Cancellation sends SIGINT, escalates to SIGKILL after 5 seconds, and settles as cancelled, including a cancel requested while the process is starting.
- Refused actions produce needs_input only when the turn otherwise settles; a failed turn with a refused action is unknown.
- A reply whose `--conversation` fails or returns a different conversation ID fails without substituting a new conversation.

A custom config file is a harness-name-to-spec map:

```json
{"codex":{"command":["/absolute/path/to/node","/absolute/path/to/codex-acp/dist/index.js"],"model":"gpt-5.6-sol","effort":"high","effortKey":"reasoning_effort","mode":"agent","env":{"CODEX_PATH":"/absolute/path/to/codex","INITIAL_AGENT_MODE":"agent","NO_BROWSER":"1"}}}
```

Config is trusted code execution through argv, not a sandbox. Do not put credentials in argv or config. Persisted environment keys are limited to native executable paths and the tested nonsecret startup settings. Permission-bypass modes (`bypassPermissions`, `dontAsk`, `agent-full-access`, and similar) and bypass flags (`--dangerously-skip-permissions`, `--always-approve`, `--yolo`, and similar) are rejected. Use native authentication stores; no API key setup is performed. Arbitrary custom adapter support is a configuration mechanism, not a compatibility guarantee.

### Other harnesses

- **OpenCode** runs through a custom config entry. Live checks passed a verified file edit and a format correction with `opencode-go/deepseek-v4.1-flash` (its advertised default `opencode/deepseek-v4.1-flash` was unavailable); needs_input, recall, and cancellation were not tested live.
- **Grok** (1.0.41, `grok agent stdio`) cannot run through the CLI. Its ACP session advertises `model` and `reasoning_effort` but no `mode` option, so start fails with `ACP_BACKEND_UNSUPPORTED_CONTROL` before any prompt is dispatched. Its native harness did complete model turns, same-session resume, and a verified X search standalone. Supporting it would need an acknowledged, effective native permission policy that ACPX can pass through and verify; exempting it from the mode check is deliberately not done.
- **Gemini CLI** 0.32.1 is rejected at login (`IneligibleTierError`); Antigravity (`agy`) is the Google harness.

## Persistence and recovery

State defaults to `~/.local/state/agent-orchestrator`; use `--state-dir` for isolated runs. Existing state directories must be real private directories (no group/other permissions); insecure directories are rejected without changing their permissions. Records and event files have private permissions and atomic replacement with per-worker locks. Every worker has a small detached runner; ACPX owns its adapter and native session. No service, port, or dashboard is installed.

Replies require the original native record and session ID. Failed resume does not silently substitute a new session. Cancel markers are request-scoped and the runner polls them. Closing a terminal or reading results does not cancel work. Native histories may be created and model quota consumed by starts/replies.

Missing runners or heartbeat expiry (45 seconds) produce unknown outcome. Disconnection/backend-uncertainty errors also produce unknown, as does a failed execution (including a timeout) after confirmed prompt dispatch when the turn recorded any tool call or permission request. A dispatched turn that failed with no tool activity settles as failed and can be replied to directly; this relies on the harness reporting its tool calls. The heartbeat is not evidence that model work is progressing. Unknown work cannot be replied to until explicitly reconciled with its current request ID; a still-live unknown runner can receive a cancellation request; resolve is refused while the recorded runner or native adapter process (`adapterPid`) still exists; no PID is killed from a saved record. There is no arbitrary process-kill command. Runner writes wait up to two seconds for transient lock contention; ordinary CLI writes still report contention immediately. Stale lock files require manual inspection; do not remove a lock while a writer is active.

Atomic writes protect process-level consistency, not power-loss durability: no fsync guarantee is made. Event files are retained and rewritten on append; this is suitable for the bounded pilot, not unbounded streams. State, prompts, results, and native histories can contain task data. Reconciliation notes are bound to request IDs and archived on follow-up. The supervisor omits thought chunks and raw tool payloads from its event archive, but cannot guarantee model text is secret-free.

## Permission boundary

Native Auto/Auto-review remains enabled; the ACP client denies permission callbacks it cannot authorize and surfaces them as needs_input. A turn the harness ends as cancelled after such a refusal (Codex does this) also settles as needs_input; only a coordinator `cancel` produces cancelled. ACP filesystem/terminal callbacks are disabled. These settings are not an OS sandbox for native tools. Recognized native questions may fail before the permission callback and require a native client capable of handling them. The CLI does not approve a suspended native dialog or automatically broaden policy.

Under the defaults, `--scope` is advisory: live tests showed Codex (Auto-review), Claude (auto), OpenCode (build), and agy (`always-proceed`) all writing outside the working directory when asked, with Codex's own reviewer approving the escalation. For tasks that need tighter native restrictions, `start --strict` applies these settings to that worker (replies keep them); a `--config` file can set them too. Each was verified live on 2026-09-27 (in-directory edit succeeded; a shell write to the home directory was blocked). These checks do not prove that every outside path is inaccessible. `--strict` fails for harnesses without verified settings:

| Harness | Config change | Effect |
|---|---|---|
| Codex | `"mode": "read-only"` and `"INITIAL_AGENT_MODE": "read-only"` | Adapter's "Ask for approval" preset (despite its id, the working directory stays writable): the workspace-write sandbox fails outside writes ("Operation not permitted"), and any escalation Codex requests reaches the CLI, which refuses it (needs_input). Both outcomes were observed live. `/tmp` and `$TMPDIR` stay writable because codex-acp hard-codes its sandbox policy. |
| Claude | `"mode": "acceptEdits"` | Edits inside the working directory are automatic; other edits and most shell commands ask, and the CLI refuses (needs_input). Expect more stops. |
| agy | append `"--sandbox"` to `command` | OS sandbox (Seatbelt on macOS) makes shell writes outside the workspace fail ("Operation not permitted"); agy reports the failure and continues. Google documents that network access is also off by default in this mode (not verified live). |

These replace the default modes only for workers started with that config. Codex's `exclude_slash_tmp`/`exclude_tmpdir_env_var` cannot be set through codex-acp. This CLI cannot pass Claude `--settings` per worker, but claude-agent-acp loads the user, project, and local Claude settings files, so a project `.claude/settings.json` with `{"sandbox":{"enabled":true,"allowUnsandboxedCommands":false}}` reaches workers: verified live on 2026-09-28 in default auto mode, a shell write to the home directory failed ("Operation not permitted") while the task completed without stops. It covers shell commands only (not Claude's Edit/Write tools), and it also applies to interactive Claude sessions in that repository.

## Verification

`make test` runs syntax checks, ledger and core tests, subprocess integration tests against ACP and agy fixtures, and installer tests. Fixtures verify protocol behavior without paid calls; they do not establish native adapter parity. The [live test report](MULTI-HARNESS-TEST-2026-09-27.md) records the bounded native checks and remaining gaps.
