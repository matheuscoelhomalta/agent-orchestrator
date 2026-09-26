# ACPX orchestration trial — 2026-09-26

## Decision

Reuse ACPX for ACP transport and native session controls. The live trial supports an ACPX-based thin supervisor; it does not justify rebuilding native harness adapters. ACPX alone is not a complete supervisor for the user's desired workflow. No production CLI or installed orchestration skill was created by this trial.

The main agent needs a small, explicit task contract and supervision loop: record worker/session/request IDs, distinguish transport settlement from task acceptance, collect final output, detect malformed or needs-input responses, send corrective feedback, and continue checking every active worker until verified completion or a reported blocker.

## Environment

- macOS; Node 26.9.0.
- ACPX 0.19.3, Codex ACP 1.13.1, Claude ACP 0.76.0.
- Native Codex CLI 0.157.1: ChatGPT authentication, gpt-5.6-sol/high, Auto-review (`mode=agent`).
- Native Claude Code 2.1.283: existing subscription authentication, claude-opus-5-5/medium, Auto (`mode=auto`). Adapter reports canonical alias `opus` with label Opus 5.5, and final usage reports claude-opus-5-5. Quota metadata also reports auxiliary Haiku usage; exclusively Opus execution is not claimed.
- Temporary dependencies installed with lifecycle scripts disabled. Existing native binaries selected explicitly through child-only CODEX_PATH and CLAUDE_CODE_EXECUTABLE overrides.
- ACPX embedded persistent runtime with temporary file stores, same-session-only resume, deny-all client permissions, and no ACP filesystem/terminal callbacks. Native Auto-review/Auto settings were checked before prompting. No permission bypass flags were used.
- Prompts explicitly prohibited tools, edits, shell commands, browsing, configuration changes, and further delegation.

## Results

| Behavior | Codex | Claude |
|---|---|---|
| Streaming output and settled turn result | Passed | Passed |
| Reject intentionally invalid JSON and request correction | Passed | Passed |
| Validate corrected response and original context token | Passed | Passed |
| Detect simulated needs-input response despite completed transport turn | Passed | Passed |
| Supply predetermined fixture answer in the same native session | Passed | Passed |
| Cancel after first output chunk; distinguish cancelled from completed | Passed | Passed |
| Follow up after cancellation with original context | Passed | Passed |
| Resume after supervisor process exit and run both workers concurrently | Passed | Passed |
| Preserve native session IDs | Passed | Passed |
| Observe exit for all recorded adapter process launches | Passed | Passed |

The supervisor was a deterministic temporary test script, not an LLM-driven production coordinator. The question was a structured fixture, not an actual permission dialog. These tests establish invocation, monitoring, result validation, and follow-up mechanics; they do not establish design quality, autonomous planning, arbitrary tool execution, or unattended operation across machine failure.

## Failures and corrections

1. Codex initially could not initialize its native SQLite state database under the host sandbox. Retrying outside the sandbox resolved the access restriction; authentication was already valid.
2. A Claude session initialized and shut down before its first model prompt was unavailable to native resume. The embedded runtime failed with SESSION_RESUME_REQUIRED rather than silently starting fresh. A new explicitly identified trial session was created, given a real first turn, and successfully resumed later.
3. The first process-restart attempt reported Claude mode `default` in the status config snapshot despite saved desired Auto preference and use of legacy setMode. The trial stopped before prompting that worker. Applying `mode=auto` through setConfigOption, checking its authoritative accepted response, and validating status resolved the observed mismatch. The subsequent parallel restart trial passed. No upstream code was patched, and the exact root cause of the legacy-path mismatch was not proven.
4. On resume, the Claude adapter's advertised catalogue omitted the explicit claude-opus-5-5 slug but included the `opus` alias labelled Opus 5.5. ACPX warned and forwarded the explicit slug; final model usage confirmed it. Treat alias/catalog discrepancies as evidence to verify, not permission to silently switch models.

## Grok

Installed Grok Build 1.0.41 provides `grok agent stdio`, the entry point registered by ACPX. No Grok model task was run. The read-only configuration inspection did not reference x_search; that absence does not establish whether X search is unavailable. X access remains unverified and must be established before routing X research to it.

## Adoption boundary

Use the embedded persistent runtime when exact session continuity is required; the generic CLI can allow fresh-session fallback. Set model, effort, and mode explicitly and verify accepted values on reconnect. Keep task status separate from transport status. Ask workers to return `needs_input` for material questions to the main agent rather than relying on unsupported interactive dialogs.

A thin supervisor over ACPX is the next implementation candidate. It can expose start/status/events/result/reply/cancel while reusing ACPX. It should keep explicit worker state and bounded waits; observe tool permissions without auto-accepting denied requests; preserve native IDs; distinguish missing output, unknown outcomes, cancellation, and completion; and use acceptance checks rather than formatting alone to decide success.

## Files and side effects

Trial files and dependencies live in /private/tmp/mc-root-investigation/acpx-smoke. Native harnesses created normal session history in their existing user stores as part of authenticated execution. No global installation or persistent configuration edit was performed. No repository files were changed by this trial. Concurrent repository changes appeared during the task and were left untouched: mc-skills/decision-research/mc-learn-topic/ and mc-skills/decision-research/ai-leak-investigator/SKILL.md.

## Evidence

- live-results-codex.json: Codex core trial, plus failed empty Claude resume.
- live-results-claude.json: Claude core trial.
- live-results-restart-attempt.json: first restart attempt and mode mismatch.
- live-results-mode-diagnostic.json: authoritative accepted mode and status check.
- live-results-final-restart.json: final parallel restart success.
- live-results-sandbox.json: initial sandbox setup failure.
- live-trial.mjs: temporary pilot harness; not production supervisor code.

Upstream: https://github.com/openclaw/acpx ; https://github.com/agentclientprotocol/codex-acp ; https://github.com/agentclientprotocol/claude-agent-acp
