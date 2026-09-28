# refactor: Simplify agent-orchestrator

**Mode:** default

**Baseline:** main@2bf1fc7 — fresh (local `main` equals `origin/main` per `git ls-remote`, 2026-09-28)

## Summary

The codebase is already small and well-bounded: 5 source modules (665 lines), an acyclic import graph, no pass-through layers, no unused dependencies. Its complexity comes from a few concepts that are defined more than once rather than from structure. Examples: the set of "live" task states, the way coded errors are built, and the cancel-marker path that two processes must agree on. There is also one documented task state (`cancelling`) that no code ever writes, and some dead or derivable code in `src/worker.mjs`. This plan gives each of those concepts a single definition, deletes the unreachable pieces, and deduplicates test setup. Nothing about the module layout changes. After this plan, each state rule, error style and cross-process path has one place to read, and the public docs no longer mention a state that never happens.

## Complexity Assessment

- **Structure is not the problem.** `src/cli.mjs` → `src/core.mjs`, `src/store.mjs`, and it spawns `src/worker.mjs`. `src/worker.mjs` → `core`, `store`, `agy`, `acpx/runtime`. `core`, `store` and `agy` import only Node builtins. The largest file is 165 lines. All 3 npm dependencies are used: `acpx` by import, and both `@agentclientprotocol/*` adapters by path in `src/core.mjs:26-29`. No plugin or registry machinery exists beyond acpx's required `createAgentRegistry`.
- **The worker state machine is encoded in 4 places.** `activeStates` (`src/core.mjs:11`), a literal copy plus `unknown` (`src/worker.mjs:17`), `activeStates.has(s) || s === 'unknown'` (`src/cli.mjs:134`), and a test copy (`test/cli.test.mjs:17`). The "runner may still change state" rule is also written out twice (`src/cli.mjs:100`, and negated at `src/cli.mjs:110`). One of the listed states, `cancelling`, is never assigned by any code path.
- **Coded errors are built 3 ways.** `core.fail` returns an error and callers write `throw fail(...)` (27 sites in `core` and `cli`). `store.fail` is a different function with the same name that throws on its own (19 sites). Four more sites in `worker` and `agy` build the error by hand with `Object.assign(new Error(...), { code })`. With two same-named helpers that behave oppositely, a bare `fail(...)` written in `core` or `cli` would silently do nothing.
- **`runWorker` (`src/worker.mjs:9-140`) is the densest function.** It is 132 lines with 14 mutable closure variables. Its ACP stream loop tests the same `text_delta`/non-thought condition twice (L93 and L109) and nests the message-framing logic 5 levels deep. Its `finally` block contains fallback expressions (L123) that the next line always overrides.
- **Tracing an operation.** `start` (ACP) crosses 4 modules; with agy, 5. `cancel` is the only flow whose contract is split: the marker path is built independently in `src/cli.mjs:111`, `src/worker.mjs:25` and `test/cli.test.mjs:139-140`.

The honest measure of this plan: about 6 duplicated definitions become 1 each, and 1 phantom state is removed from the code and from 2 public docs. `runWorker` loses one duplicated branch and 2 nesting levels. Line savings are incidental.

## Simplification Units

### S1. Remove unused module surface

- **Strength:** Strong
- **Goal:** Stop exporting and guarding things that nothing imports.
- **Evidence:**
  - `runWorker` (`src/worker.mjs:9`) is exported, but nothing imports `src/worker.mjs`. It is only spawned by path (`src/cli.mjs:50`).
  - The worker's entry guard (`src/worker.mjs:142-144`, plus the `pathToFileURL` import on L3) exists only to make importing the file safe.
  - `defaults` (`src/core.mjs:25`) is exported, but its only caller is `readConfig` in the same file (L44).
  - Criteria passed: deletion test, usage test.
- **Approach:**
  - Make `runWorker` module-private.
  - Replace the guarded entry block with an unconditional call to `runWorker(...process.argv.slice(2))`, keeping the existing `.catch` handling.
  - Drop the now-unused `pathToFileURL` import.
  - Drop the `export` from `defaults`.
  - Leave `src/cli.mjs:149`'s guard alone: tests import `main`, so that guard is load-bearing.
- **Files:** `src/worker.mjs`, `src/core.mjs`
- **Blast radius:** Internal only. The worker is still started the same way. Any out-of-repo code importing `worker.mjs` would now start a runner on import, but no such consumer exists in the repo, and the package is `private`.
- **Risk & mitigation:** Low. The URL-punctuation entrypoint test (`test/cli.test.mjs:248`) and every CLI integration test spawn the worker, so a broken entry point fails the suite.
- **Verification:** `npm run check && npm test`. Also `git grep -n "runWorker\|defaults" -- src test` should show only in-module uses.
- **Expected effect:** 2 fewer exports and 1 fewer entry-guard concept. The worker's URL-punctuation failure mode goes away.

### S2. Simplify `runWorker`'s stream loop and settlement

- **Strength:** Strong
- **Goal:** Remove a duplicated branch, flatten the message-framing logic, and delete fallbacks that can never take effect.
- **Evidence:**
  - `item.type === 'text_delta' && item.stream !== 'thought'` is tested at `src/worker.mjs:93` and again at L109. The framing logic between them is 5 levels deep.
  - In `finally`, L123 computes `failure?.code || …` and `failure?.message || …`, but L124 always replaces `execution` whenever `failure` is set. There is no `await` between the two lines, so `failure` cannot change in between. I traced all four combinations of execution set or unset and failure set or unset; the final value is the same when L123 keeps only its no-failure fallback.
  - Criteria passed: deletion test (L123 sub-expressions), indirection tax, explanation test.
- **Approach:**
  - Handle a non-thought `text_delta` in one block that, in the current order, does three things: appends to `output`, applies message-ID framing, and emits the `text_delta` event last so that a failed write still happens after accumulation. Then continue to the next item.
  - Flatten the framing with early exits, or with a small local helper inside `runWorker`. Keep its semantics exactly:
    - A missing or blank ID disables framing.
    - A new ID resets `responseOutput`.
    - A repeated earlier ID (interleaving) disables framing.
  - In `finally`: if `failure` is set, build the failed execution from `failure`. Otherwise keep `execution ||= { status: 'failed', error: { code: 'RUNNER_FAILED', message: 'No settled result.' } }`. That defensive fallback stays.
  - Do not merge the agy and ACP branches. See Rejected Findings.
- **Files:** `src/worker.mjs`
- **Blast radius:** Every ACP turn (Codex and Claude). No interface change.
- **Risk & mitigation:**
  - The risk is a change in event ordering or framing edge cases. The `CASE:framed`, `unframed`, `interleaved` and `badframe` fixtures (`test/cli.test.mjs:194-213`) cover framing. The permission and disconnect fixtures cover settlement.
  - Before changing the loop, add one characterization assertion that thought chunks never appear as `text_delta` events or in `output`. The fixture adapter currently sends no thought chunks, so that behavior is untested. Add a `CASE:thought` fixture scenario.
- **Verification:** `npm test`. Confirm the `ACP message framing…` and permission/disconnect tests pass unchanged. Confirm the new thought-chunk assertion passes both before and after the change.
- **Expected effect:** 1 duplicated condition removed, framing depth 5 → about 3, and 2 unreachable sub-expressions deleted.

### S3. Give the live-state rules one definition

- **Strength:** Strong
- **Goal:** Stop spelling out which states are live, and which workers may still change, at several separate sites.
- **Evidence:**
  - The live-state set is encoded 4 times: `src/core.mjs:11`, `src/worker.mjs:17` (as a literal: `activeStates` plus `unknown`), `src/cli.mjs:134` (as an expression: `activeStates` plus `unknown`), and `test/cli.test.mjs:17` (a literal copy).
  - "May still change" (`activeStates.has(s) || (s === 'unknown' && !runnerDone && alive(runnerPid))`) appears at `src/cli.mjs:100` (`wait`) and, negated, at L110 (`cancel`). `summarize` keeps `state`, `runnerDone` and `runnerPid`, so both sites see the same inputs.
  - Criteria passed: rule of three (4 encodings of one set), explanation test.
- **Approach:**
  - `src/worker.mjs:17` should build its `patch` guard from the imported `activeStates` plus `unknown`, not a literal.
  - Export one predicate from `src/core.mjs` for "runner may still change state" and use it in both `wait` and `cancel`.
  - `test/cli.test.mjs` should import `activeStates` instead of redefining it.
  - Leave `src/cli.mjs:134` as an expression over `activeStates`; it already derives from it.
- **Files:** `src/core.mjs`, `src/worker.mjs`, `src/cli.mjs`, `test/cli.test.mjs`
- **Blast radius:** `wait`, `cancel`, and the worker's patch guard. Behavior is the same.
- **Risk & mitigation:** Low. The live-unknown-cancel test (`test/cli.test.mjs:129`) and the `wait` test (`:310`) cover both predicate sites.
- **Verification:** `npm test`. `git grep -n "'cancelling'" -- src test` should show only `src/core.mjs` (until S4 lands).
- **Expected effect:** Live-state set 4 definitions → 1. "May still change" 2 copies → 1. A change to the state machine touches one line.

### S4. Retire the never-written `cancelling` state

- **Strength:** Worth exploring. It is gated on a local-state check and on a user decision (see Open Questions).
- **Goal:** Remove a state that code and docs treat as real but that nothing ever produces.
- **Evidence:**
  - Every `state` assignment in `src/` produces one of `starting`, `running`, `failed`, `accepted`, `unknown`, `cancelled`, `needs_review`, `needs_input` or `invalid_output`. None produces `cancelling`.
  - `cancel` only writes a marker file (`src/cli.mjs:109-113`). The worker's `cancelling` is a local boolean (`src/worker.mjs:26-29`), so a worker stays `running` until it settles as `cancelled`.
  - The value is listed at `src/core.mjs:11`, `src/worker.mjs:17` and `test/cli.test.mjs:17`, and documented as a state to wait on in `docs/CLI.md:22` and `skills/agent-orchestrator/SKILL.md:39`. Coordinators are therefore told to watch for a state they will never see.
  - Criteria passed: deletion test, explanation test.
  - All three lenses flagged one narrow question: could state records written by an earlier version still hold `cancelling`? Git history was not authorized for this run, so it was not checked. The check below answers the question more directly anyway.
- **Approach:**
  - First, run the gate check in Verification against every state directory in use.
  - If no record holds `cancelling`, drop it from `activeStates` (and from any remaining literals, if S3 has not landed).
  - Edit `docs/CLI.md:22` and `skills/agent-orchestrator/SKILL.md:39` to list only `starting`/`running`.
  - If the user instead wants `cancel` to actually set `cancelling`, that is a feature change and out of scope. Drop this unit.
- **Files:** `src/core.mjs` (plus `src/worker.mjs` and `test/cli.test.mjs` if S3 has not landed), `docs/CLI.md`, `skills/agent-orchestrator/SKILL.md`
- **Blast radius:**
  - The public contract text in `docs/CLI.md` and the coordinator skill, which the linked Codex and Claude skill roots read.
  - Any legacy record still holding `cancelling` would stop being reconciled and would be treated as settled by `wait`.
- **Risk & mitigation:** The only risk is legacy records, and the gate check settles it. If any are found, reconcile them first (inspect, then `resolve` if they are unknown), or keep the value.
- **Verification:**
  - Gate (read-only, local private state): `grep -l '"state":"cancelling"' ~/.local/state/agent-orchestrator/records/*.json`. Also run it against any `--state-dir` still in use. Expected: no matches.
  - After the change: `npm test`, and `git grep -n cancelling -- src test docs/CLI.md skills` should show only the worker's local boolean.
- **Expected effect:** 1 phantom state removed from the state machine and from 2 public documents.

### S5. Use one helper for coded errors

- **Strength:** Strong
- **Goal:** Replace two same-named helpers that behave oppositely, plus hand-built copies, with one helper.
- **Evidence:**
  - `core.fail` returns an error and is used as `throw fail(...)` at 27 sites.
  - `store.fail` (`src/store.mjs:5-9`) throws on its own and has 19 call sites, all in statement position.
  - Four more sites build the same error by hand: `src/worker.mjs:79`, `:81` and `src/agy.mjs:18`, `:29`.
  - Adding `store` → `core` and `agy` → `core` imports creates no cycle, because `core` imports no internal modules (`reconcile` receives the store as a parameter).
  - Criteria passed: rule of three, explanation test. Blast radius is about 25 mechanical edits in 3 files.
- **Approach:**
  - Delete `store.fail`. Import `fail` from `src/core.mjs` and convert the 19 call sites to `throw fail(...)`.
  - Replace the 4 hand-built errors in `src/worker.mjs` and `src/agy.mjs` with `fail(...)`, adding `throw` where the original threw.
  - Keep `src/agy.mjs:14`'s `Object.assign(failure, { code: 'SPAWN_FAILED' })` as it is. It tags the original spawn error and keeps its message; it does not construct a new error.
  - Codes and messages must be byte-identical.
- **Files:** `src/store.mjs`, `src/worker.mjs`, `src/agy.mjs`
- **Blast radius:** Every error path in the ledger. Error objects keep the same `code` and `message`. Only stack frames change.
- **Risk & mitigation:** The only real risk is a missed `throw` on a converted store call, which would silently continue. The store tests assert error codes on every guarded path: traversal, corruption, contention and serialization (`test/store.test.mjs`). As an extra check, `git grep -n "^\s*fail(" -- src` must return nothing.
- **Verification:** `npm run check && npm test`, plus the grep above.
- **Expected effect:** 3 ways to build a coded error → 1, and the silent-no-op trap is gone.

### S6. Define the cancel-marker path once

- **Strength:** Strong
- **Goal:** Make the cross-process cancel contract explicit instead of relying on two modules agreeing implicitly.
- **Evidence:**
  - `path.join(stateDir, 'cancel', `${id}-${requestId}.json`)` is built independently at `src/cli.mjs:111`, `src/worker.mjs:25` and `test/cli.test.mjs:139-140`.
  - `privateWrite` (`src/cli.mjs:41-44`) has exactly 1 caller (L112).
  - The marker's contents are never read; the worker only checks that the file exists (`src/worker.mjs:28`).
  - Criteria passed: rule of three (3 sites), usage test (`privateWrite`), indirection tax.
- **Approach:**
  - Export one small path function from `src/core.mjs` and use it in the CLI, the worker and the test.
  - Inline `privateWrite` into `cancel`, keeping `mkdirSync(..., { recursive: true, mode: 0o700 })`, the `wx` flag, `0o600`, and the `EEXIST` tolerance. Keep the marker's JSON body as it is.
  - Do not move markers into `Store`: that would bring `cancel/` under Store's permission check and reject existing non-private directories, which changes behavior.
- **Files:** `src/core.mjs`, `src/cli.mjs`, `src/worker.mjs`, `test/cli.test.mjs`
- **Blast radius:** `cancel` and the worker's cancel polling.
- **Risk & mitigation:** Low. 4 tests exercise cancellation (`test/cli.test.mjs:75, 129, 232, 280`), including cancellation under lock contention and agy cancellation. The shared test teardown also cancels (L41).
- **Verification:** `npm test`. `git grep -n "'cancel'" -- src test` should show only the new helper.
- **Expected effect:** 3 path formulas → 1 and 1 single-use helper removed. The cancel contract can be read in one place.

### S7. Drop derivable parameters and repeated lookups

- **Strength:** Strong
- **Goal:** Remove arguments and repeated computations whose values are already available.
- **Evidence:**
  - `taskPrompt(record, text)` (`src/core.mjs:77`): both callers pass `record.prompt` (`src/worker.mjs:43`, `:88`).
  - `agyTurn({ record, timeoutMs, … })` (`src/agy.mjs:6`): its only caller passes `timeoutMs: record.timeoutMs` alongside `record`.
  - `defaults()` calls `executable('codex')`, `executable('claude')` and `executable('agy')` twice each (`src/core.mjs:28-31`). That is 6 `PATH` scans on every default `start` and `doctor`.
  - The CLI entry block checks `process.argv.includes('--json')` 3 times (`src/cli.mjs:152`, `:153`, `:156`). That raw-argv read is needed, because a `parseArgs` failure leaves no parsed flags, but once is enough.
  - Criteria passed: deletion test, explanation test.
- **Approach:**
  - Change `taskPrompt` to take only `record`.
  - Have `agyTurn` read `record.timeoutMs`.
  - Resolve each executable once into a local inside `defaults()`.
  - In the entry block, compute the `--json` flag once before the `.then`/`.catch` and use it at all 3 sites.
- **Files:** `src/core.mjs`, `src/worker.mjs`, `src/agy.mjs`, `src/cli.mjs`
- **Blast radius:** Internal signatures with single callers, plus the default config path.
- **Risk & mitigation:** The agy `--print-timeout` value has no direct assertion today. Before the change, add one to the existing agy calls test (`test/cli.test.mjs:268`): the first call's `--print-timeout` argument equals `300s`.
- **Verification:** `npm test`, including the new `--print-timeout` assertion. `node src/cli.mjs --json doctor` gives the same harness list and fields before and after. It is static inspection only, with no model calls.
- **Expected effect:** 2 parameters removed from internal APIs, 6 → 3 PATH scans per default config load, and 3 → 1 raw-argv reads.

### S8. Deduplicate test setup

- **Strength:** Strong
- **Goal:** Name repeated arrange/assert snippets once. What each test asserts stays exactly the same.
- **Evidence:**
  - In `test/cli.test.mjs`:
    - `e => e.response.error.code === 'INVALID_STATE'` appears 10 times.
    - `r => r.state === 'running' && r.admission === 'dispatched'` appears 5 times (L76, 98, 132, 234, 286).
    - The dispatched-prompt count `fs.readFileSync(…prompts-${id}.ndjson…).trim().split('\n')` appears 3 times (L101, 107, 115).
  - In `test/core.test.mjs`:
    - 3 hand-written `mkdtempSync` setups use 2 different cleanup styles: `try/finally` at L32 and L61, `t.after` at L81.
    - The base harness spec literal `{ model: 'm', mode: 'default', effort: 'low', effortKey: 'effort' }` is repeated in 5 tests.
  - Criteria passed: rule of three.
- **Approach:**
  - In `test/cli.test.mjs`, add module-level named predicates and a prompt-count helper next to `setup`.
  - In `test/core.test.mjs`, add a temp-dir helper that registers `t.after` cleanup, the same pattern as `test/store.test.mjs:10-14`, and a shared base spec object that tests spread and override.
  - Do not merge the three child-process `Store` snippets (see Rejected Findings).
- **Files:** `test/cli.test.mjs`, `test/core.test.mjs`
- **Blast radius:** Tests only.
- **Risk & mitigation:** The risk is weakening an assertion by accident. Review the diff so that every `assert.*` target and expected value is unchanged, and keep the test count the same.
- **Verification:** `npm test` reports the same 48 tests (28 CLI, 9 core, 11 store), all passing.
- **Expected effect:** About 18 repeated snippets become 5 named helpers, and core tests use one cleanup style.

### S9. Point `docs/DAILY-WORKFLOW.md` to the skill for supervision rules

- **Strength:** Worth exploring. The audience question is still open.
- **Goal:** Stop maintaining two parallel copies of the per-state supervision rules.
- **Evidence:**
  - About 12 directives appear in both `docs/DAILY-WORKFLOW.md` (L3, L17-23, L29) and `skills/agent-orchestrator/SKILL.md` (L13, L33, L35, L39, L46-58). Examples: `--strict` for edits, `wait --timeout 600`, carrying `nextCursor`, the `needs_input`/`invalid_output`/`needs_review`/cancel/`unknown` handling, and accounting for every worker.
  - `docs/CLI.md:93-95` also restates the unknown/resolve semantics. That is its role as the contract, so it stays.
  - Criteria passed: rule of three (3 copies), explanation test.
- **Approach:**
  - Replace the per-state bullet list and repeated monitoring guidance in `docs/DAILY-WORKFLOW.md` with a link to the skill's "Monitor all workers" and "Accept only verified results" sections.
  - Keep what only that doc has: invoking the skill, the example request, `--state-dir` experiments, and skill-link maintenance.
  - Leave `SKILL.md` self-contained, because agents load it through symlinks without the rest of the repo's docs.
- **Files:** `docs/DAILY-WORKFLOW.md`
- **Blast radius:** Human readers of the daily workflow doc.
- **Risk & mitigation:** A human reader loses a standalone page. Accept that only if the user agrees (Open Question 2).
- **Verification:** Manual read-through. Confirm every link target exists: `grep -n "^## " skills/agent-orchestrator/SKILL.md`. `git diff --stat` should touch only `docs/DAILY-WORKFLOW.md`.
- **Expected effect:** 3 copies of the supervision rules → 2 (the contract and the skill), and 1 fewer doc to keep in sync when behavior changes.

## Sequencing

1. **Wave 1: deletions**
   1. S1 (Strong).
   2. S4 (Worth exploring). Start only after the gate check returns no `cancelling` records and the user confirms removal over implementation.
2. **Wave 2: consolidations and inlining**
   1. S3, S5, S6, S7, S2, S8 (all Strong), then S9 (Worth exploring).
   - Land S3 before S4 if you want S4 to be a one-literal code change. Either order works.
   - S2, S3, S5, S6 and S7 all edit `src/worker.mjs`. Land them one at a time and rerun `npm run check && npm test` after each.
   - S2 and S7 each add a characterization assertion first. Land that assertion and see it pass before making the change.
3. **Wave 3:** none. No boundary moves are recommended.

After implementing a unit, stage the changes (`git add`) and stop there; do not commit. Commits are the user's call, not the implementer's.

## Rejected Findings

1. **Deduplicate `Store._write` and `appendEvent`'s atomic temp-write/rename** (`src/store.mjs:58-72`, `:149-161`): rejected by the rule of three. There are 2 sites, and they differ in exclusivity (`linkSync`) and validation.
2. **Extract the expiry check duplicated inside `reconcile`** (`src/core.mjs:102-103`, `:107-108`): rejected by the rule of three (2 copies). The outside-lock / inside-lock double check itself is load-bearing and must stay.
3. **Share one field list for the `result` projection, the `reply` snapshot and the `reply` reset** (`src/cli.mjs:108`, `:138`, `:141-142`): rejected by the rule of three and the explanation test.
   - `result` applies different defaults per field.
   - The reset uses `''` for output fields and `null` for the rest, and history exposes that difference.
   - Only 2 sites actually share the same meaning.
4. **Stop requiring `effortKey`/`mode` on agy specs** (`src/core.mjs:53`, `:31`): rejected as a behavior change. It widens what config validation accepts at a trust boundary and changes `doctor`'s `mode` output.
5. **Delete the persisted `handle`** (`src/worker.mjs:82`): rejected for now under Chesterton's fence.
   - No code reads it.
   - Its purpose is undocumented, and its `acpxRecordId` may help locate native state during manual reconciliation of an `unknown` outcome, which is a safety workflow.
   - The payoff is negligible. See Open Question 3.
6. **Delete the `schema: 1` record field** (`src/cli.mjs:87`): rejected by the blast-radius test. It is a cheap format marker for persisted data, and deleting it saves nothing.
7. **Delete the `?? record.output` fallback in `result`** (`src/cli.mjs:108`): rejected by the blast-radius test. It only matters for records written before `responseOutput` existed, removing it changes `result` output for any such record in private state, and the payoff is negligible.
8. **Deduplicate the agy/ACP lifecycle steps in `runWorker`:** rejected by the rule of three, since each of the 6 parallel steps (pre-dispatch cancel check, `running` patch, spawned/exited hooks, output accumulation) has only 2 copies. The version that would actually help is a rewrite, listed under Deferred.
9. **Merge the three child-process `Store` snippets in tests** (`test/store.test.mjs:16`, `:127`; `test/cli.test.mjs:236`): rejected by the explanation test. They need synchronous, async-handshake and exit-wait behavior respectively, so one helper would be more complex than the three snippets.
10. **Move `docs/` history files into a subfolder:** rejected by the blast-radius test. `README.md` already separates current from dated documents, and moving files changes public paths in a public repository.

## Deferred / Out of Scope

**Referred-out rewrites (not simplification; each needs its own decision):**

1. **Give ACP the same adapter shape as agy.**
   - What changes: move the ACP transport, framing and `configure` out of `runWorker` into an adapter shaped like `agyTurn`, so settlement no longer branches by protocol.
   - What it would buy: a shorter `runWorker` with one settlement path.
   - Cost: it restructures more than half of `src/worker.mjs`, adds a module, and keeps the line count about the same.
2. **Port the installer to Node.**
   - Why: `scripts/install-local.py` and its test (75 lines) are the only Python in the repo, and `make test` needs `python3` only for them. The Node ≥22.13 minimum is stated in `package.json`, `src/core.mjs:6-9` and `scripts/install-local.py:16-18`.
   - What it would buy: one toolchain.
   - Constraint: it must keep the pinned absolute Node path, the refusal to overwrite, and mode `0o755`. `npm link` provides none of these.
   - This replaces the whole installer.

**Observations (bugs, gaps, performance):**

1. `npm run check` hand-lists 4 of the 5 source files and omits `src/store.mjs` (`package.json`).
2. `reply` neither resets nor archives `lastProgressAt`, `lastEventSeq` or `configuration` (`src/cli.mjs:138-142`). `status` for a new request therefore shows the previous turn's values, and if the new request fails before `configure` runs, the old configuration stays current and never reaches `history`.
3. `--strict` picks Codex and Claude settings by harness name (`src/core.mjs:36-41`), so a custom `--config` entry named `codex` or `claude` gets those settings unverified. `configure()` probably fails safe with `CONFIG_MISMATCH`, but this is untested.
4. `spec.protocol` is not validated. A typo silently takes the ACP path (`src/worker.mjs:40`).
5. An existing `cancel/` directory's permissions are not checked the way `records/`, `events/` and `locks/` are (`src/cli.mjs:42` vs `src/store.mjs:28`).
6. ACP's `onExit` silently ignores a failed `adapterPid: null` write (`src/worker.mjs:76`), while agy turns the same failure into a turn failure. A stale `adapterPid` can block `resolve`.
7. Every streamed event rewrites both the whole event log and the record. Per-turn I/O grows quadratically. This is partly documented in `docs/CLI.md`.
8. `status` and `wait` parse every record twice per poll: `store.list()`, then `reconcile` re-reads (`src/cli.mjs:98`, `:105`).
9. `README.md:39` links to `evidence/acpx-trial/README.md`, which is gitignored, so the link is broken in the public repository.

## Open Questions

1. **S4:** For `cancelling`, should the state be removed (this plan) or should `cancel` start setting it (a feature change)? And does the gate check come back clean for every state directory in use?
2. **S9:** Is `docs/DAILY-WORKFLOW.md` meant to stand alone for human readers, or is linking to the skill for per-state handling acceptable?
3. **Rejected finding 5:** Is the persisted `handle` meant as a manual-recovery aid? If not, it can be deleted in a follow-up.
