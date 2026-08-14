# Design: STEP_TIMEOUT halt records carry last-tool observation

## Context

When the inactivity watchdog (`src/adapter/shared/inactivity-watchdog.ts`) fires, both local
agent runners build a `STEP_TIMEOUT` error whose message is the fixed
`formatInactivityTimeoutMessage` output: `Step '<name>' inactivity timeout: no agent event for NNNms`.
The killed agent session leaves no usage.json and no transcript, so an operator reading
events.jsonl after the halt has zero material to tell a hung command (e.g. `bun test`) apart
from an API/generation stall.

The "what is running now" signal already exists as a normalized domain event in both runtimes:

- **claude-code** — `emitToolProgress` (agent-runner.ts:346) reads a `tool_use` content-block start
  (`isToolUse`, message-types.ts:29) and emits `step:progress {step, tool, target}`. Called at three
  stream sites: main work loop (658), postWork follow-up `onMessage` (944), output-repair loop (1021).
- **codex** — the `item.started` handler (agent-runner.ts:419) maps a started `ThreadItem` via
  `extractCodexProgress` (227) and emits `step:progress`.

The sole consumer today is the terminal display (`src/cli/progress.ts:102`). Neither the watchdog
nor the halt record receives it.

The persistence path is already sufficient: the `STEP_TIMEOUT` error returned by the runner flows through
`executor.ts:366` → `makeTimeoutHalt` (step-halt.ts:119) which copies `err.hint ?? ""` into
`ErrorInfo.hint`; the event-journal writes the whole `ErrorInfo` (code/message/**hint**) into the
step-attempt record (event-journal.ts:373,450) and reads it back verbatim. So a `hint` set on the
runner's `STEP_TIMEOUT` error reaches events.jsonl unchanged. `ErrorInfo.hint` is a plain string
(types.ts:101). Today the timeout error sets no `hint`, so it lands as `""`.

**Scope note (managed runtime):** `src/adapter/managed-agent` has no inactivity watchdog and no local
tool stream (it polls a remote API and uses `POLL_TIMEOUT`). It is out of scope — the request names the
claude-code and codex adapters only.

## Goals / Non-Goals

**Goals**:

- Each local runner keeps the last observed tool start (tool name, target, observation time) and whether
  its matching completion was observed (claude: `tool_result`; codex: the item's `item.completed`).
- On inactivity `STEP_TIMEOUT`, enrich the halt record so events.jsonl reveals: last tool + target +
  elapsed-since-start, whether it is completed or in-flight, and — when no tool was ever observed — an
  explicit "no tool observed" marker (to separate a command hang from an API stall).
- Preserve every existing behavior: watchdog threshold / `bump` / `clear` / `fired`, the
  awaiting-resume halt transition, `formatInactivityTimeoutMessage` output, and the `step:progress`
  terminal display are all untouched.

**Non-Goals** (from request scope-out):

- No watchdog threshold change and no "exempt in-flight tools from timeout" policy — observation only.
- No OS-level process-tree snapshot at kill time.
- No persistence of the full agent stream.
- No change to codex's 40-char target truncation.
- Managed runtime is unchanged.

## Decisions

### D1: Carry the observation in `ErrorInfo.hint`, leave `message` unchanged

The enriched text is attached as the `hint` of the `STEP_TIMEOUT` error, not appended to the message.

- **Rationale (why hint, not message):** `message` is pinned by TC-013 (`formatInactivityTimeoutMessage`
  must contain "inactivity", step name, elapsedMs) and req.4 requires that output be invariant. `hint` is
  currently `""` for this path, is persisted whole into events.jsonl, and requirement 2 explicitly allows
  "message **or** hint". Using `hint` keeps `message` byte-identical and `formatInactivityTimeoutMessage`
  unchanged, so TC-013 and the wall-clock message stay green with zero edits.
- **Alternatives considered:** (a) Append to `message` via an extended formatter — rejected: forces
  editing `formatInactivityTimeoutMessage`/TC-013 and risks the "message unchanged" invariant.
  (b) Add a new structured field to `ErrorInfo` — rejected: schema change rippling through journal
  read/write and projections for data that a single string conveys (YAGNI).

### D2: A shared last-tool tracker in `src/adapter/shared/last-tool-tracker.ts`

A new small factory `createLastToolTracker(now = Date.now)` holds the single most-recent tool start and a
`done` flag, plus a `timeoutHint()` that renders the hint. Both runners construct one per `run()`
alongside the watchdog and read it in the catch block.

State (single last tool, not a list):

- `last: { tool: string; target?: string; startedAt: number; id?: string; done: boolean } | null`

API:

- `onToolStart(tool, target, id?)` → `last = { tool, target, startedAt: now(), id, done: false }`
- `onToolEnd(id?)` → if `last` exists and `!last.done` and the ids correlate, set `last.done = true`
  (ids correlate when `last.id === undefined` → best-effort for id-less streams, or when
  `id === last.id`; an id-less completion does **not** clear an id-tracked start — a false
  "completed" would mask a hung command, the exact misdiagnosis the tracker exists to prevent).
- `reset()` → `last = null`. Called at the start of each retry attempt (claude-code and codex
  `runMainWorkTurn`) so hints never report elapsed time spanning a previous attempt plus backoff delay.
- `timeoutHint(): string` → renders from `last` and `now() - last.startedAt` (see D4).

- **Rationale (why shared factory, single-last-tool):** two adapters need identical logic; a shared
  factory gives one unit-testable surface and no duplication. Tracking only the **single** last tool with
  a `done` flag directly answers "is the last tool in-flight" and sidesteps the cross-item miscount a
  start/end counter would suffer when non-tool completions or interleaved items appear. A separate file
  (not folded into `inactivity-watchdog.ts`) keeps the watchdog's timer logic and its test file provably
  untouched (req.4, AC #5).
- **Alternatives considered:** (a) In-flight **counter** (`pending++/--`) — rejected: codex
  `item.completed` fires for non-tool items and claude may interleave, so a bare counter can zero out a
  genuinely in-flight tool. (b) Inline per-runner state + only a shared formatter — rejected: duplicates
  the correlation logic across two adapters and splits the test. (c) Extend the watchdog object with tool
  fields — rejected: couples two concerns and touches the invariant-protected file.

### D3: Correlate completion by id, hooked at the existing observation sites

- **claude-code:** at every site that already calls `emitToolProgress` (658, 944, 1021), also call
  `tracker.onToolStart(tool, target, id)` using the same `tool`/`target` plus the `tool_use` block's
  `id`. Add a `tool_result` completion signal: a new guard `isToolResult(msg)` in `message-types.ts`
  (type `"user"` whose `message.content` array contains a `tool_result` block) drives
  `tracker.onToolEnd(tool_use_id)` in the main and repair loops and in the postWork `onMessage` callback.
  A single `observeMessage(msg)` closure in `run()` wraps `emitToolProgress` + both tracker calls so the
  three sites stay in sync.
- **codex:** in the `item.started` tool branch (extractCodexProgress ≠ null) call
  `tracker.onToolStart(p.tool, p.target, item.id)`; in the `item.completed` branch, when the completed
  item is itself a tool item (`extractCodexProgress(item) ≠ null`), call `tracker.onToolEnd(item.id)`.

- **Rationale (why the existing sites + id):** hooking the tracker at exactly the sites `step:progress`
  is emitted guarantees the tracked "last tool" is identical to what the terminal showed, with no new
  event or stream added. id-based correlation is the precise way to decide whether the **last** tool's
  own completion arrived; the id-less-start best-effort fallback keeps it working for the simple
  single-tool streams that tests and older SDKs produce. `tool_result` arrives as a full `user` message
  (independent of `includePartialMessages`), so the completion signal is robust. Replayed prior-session
  messages (`isReplay: true`, SDK session resume) are skipped at the observation site — their tool
  activity belongs to a past session and must not update progress or tracker state.
- **Alternatives considered:** using `content_block_stop` as the claude completion signal — rejected:
  it marks the end of tool-**input** streaming, not tool **execution**, so it would report every started
  tool as completed.
- **`ponytail:` marker for the implementer:** the id-correlation fallback (best-effort match when the
  tracked start has no id) is a known ceiling — interleaved parallel tools **without** ids can mark the
  wrong tool done. Leave a `// ponytail: id-correlated; id-less streams fall back to best-effort (start
  w/o id matches any end), require ids if interleaving matters` note. Real SDK items/blocks carry ids,
  so this only degrades in synthetic/legacy streams.

### D4: Hint wording (three cases)

`timeoutHint()` returns exactly one of:

- **no tool observed:** `no tool observed before timeout (no tool activity in session)`
- **in-flight:** `last tool: <tool>[ <target>] started <elapsed>ms ago; in-flight (no completion observed before timeout)`
- **completed:** `last tool: <tool>[ <target>] started <elapsed>ms ago; completed before timeout`

`<target>` and its leading space are omitted when absent. `<elapsed>` is `now() - last.startedAt`
computed when the hint is built in the catch block (deterministic under vitest fake timers).

- **Rationale (why plain substrings):** the three strings carry every datum req.2 lists — tool, target,
  elapsed, and the completed/in-flight/no-tool distinction — as greppable substrings an operator can read
  directly.
- **Alternatives considered:** a JSON blob in `hint` — rejected: `hint` is a human-readable string
  everywhere else; plain text is enough and matches the field's existing use.

### D5: Attach the hint across the whole `STEP_TIMEOUT` catch branch

In both catch blocks (claude agent-runner.ts:1114-1132, codex 761-778) set
`hint: tracker.timeoutHint()` on the `STEP_TIMEOUT` error object next to `code`. This covers both the
inactivity sub-case (`watchdog.fired`) and the wall-clock sub-case (`timeoutId`), which already share the
same `code: "STEP_TIMEOUT"`.

- **Rationale (why unconditional):** one attach at the single error-construction site is a smaller diff
  than branching, and the last-tool context is equally useful for a wall-clock timeout. The ACs only
  assert the inactivity sub-case; covering the wall-clock sub-case too is a free superset.
- **Alternatives considered:** gate the hint on `watchdog.fired` only — rejected: needless branch for no
  behavioral benefit.

## Existing timeout/watchdog test inventory (AC #5)

All tests touching the watchdog / timeout / halt path, with the update decision and rationale. Only files
marked **UPDATE** may change; every other file MUST stay byte-identical and green. The design keeps
`inactivity-watchdog.ts`, `formatInactivityTimeoutMessage`, `makeTimeoutHalt`'s halt kind/reason, and the
`message` text all unchanged, so nothing below needs an update:

| Test file | Decision | Rationale |
|-----------|----------|-----------|
| `src/adapter/shared/__tests__/inactivity-watchdog.test.ts` (TC-010–013) | **UNCHANGED** | Watchdog timer / `bump` / `clear` / `fired` and `formatInactivityTimeoutMessage` signature+output are untouched (D1/D2 add a separate file). |
| `src/core/step/__tests__/executor-sequential-regression.test.ts` | **UNCHANGED** | Asserts `completionReason: "timeout"` routes to awaiting-resume with `reason: "timeout"`. `makeTimeoutHalt` kind/reason are unchanged; only `hint` content is enriched, which it does not assert. |
| `src/core/step/__tests__/commit-orchestrator.test.ts` | **UNCHANGED** | Asserts `makeTimeoutHalt` produces awaiting-resume + interruption reason + history; does not assert `hint` content. |
| `src/core/step/__tests__/executor-drift-detection.test.ts` | **UNCHANGED** | Uses a `"timeout"` runner only to reach drift logic; does not assert timeout message/hint. |
| `src/core/step/__tests__/no-op-detect-exemption.test.ts` | **UNCHANGED** | `no-op-detect` branches only on `completionReason === "success"`; the timeout path is unaffected. |
| `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` | **UNCHANGED** | Covers transient retry, not inactivity; no timeout message/hint assertions. |

**Result: zero existing test files are updated.** No existing test asserts the `STEP_TIMEOUT` message or
hint string (verified across `src/adapter/*/__tests__` and `src/core/step/__tests__`), so enriching
`hint` and leaving `message` fixed breaks nothing.

**New test files (net-new, not updates):**

- `src/adapter/shared/__tests__/last-tool-tracker.test.ts` — unit test for the tracker (D2/D4): the three
  hint cases + id-correlated completion.
- `src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts` — runner integration
  (AC #1, #3, #4 claude side): mock a query stream that emits `tool_use` (and, per case, `tool_result`)
  then hangs; advance fake timers past `DEFAULT_INACTIVITY_TIMEOUT_MS` with an abort-on-signal mock
  generator; assert the returned `error.hint`.
- `src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts` — runner integration
  (AC #2, #3, #4 codex side): same shape via `item.started` / `item.completed`.

## Risks / Trade-offs

- [Risk] The claude `tool_result` completion signal depends on the SDK yielding `user` tool_result
  messages in the stream. → Mitigation: `tool_result` is a full (non-partial) `user` message that the
  `query()` generator yields regardless of `includePartialMessages`; the runner tests inject the exact
  shape, pinning the guard.
- [Risk] Interleaved / parallel tools without ids can mark the wrong tool `done` under the best-effort
  fallback. → Mitigation: real streams carry ids so correlation is exact; the fallback only applies when
  the tracked start itself has no id (an id-less completion never clears an id-tracked start), and is
  marked with a `ponytail:` ceiling comment (D3).
- [Risk] `elapsed` measured at catch time rather than at fire time could drift by the abort-propagation
  gap. → Mitigation: under vitest fake timers no wall time passes between fire and catch, so the value is
  deterministic; in production the gap is sub-millisecond and irrelevant to the diagnosis.
- [Trade-off] Only the single last tool is retained, not a history. → Accepted: req.1 asks for the last
  observed tool; a history is out of scope (no full-stream persistence).

## Open Questions

None. The persistence path (`hint` → events.jsonl), the observation sites, and the completion signals are
all confirmed against the current code.
