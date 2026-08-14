# Tasks: STEP_TIMEOUT halt records carry last-tool observation

## T-01: Add the shared last-tool tracker (`src/adapter/shared/last-tool-tracker.ts`)

- [x] Create `src/adapter/shared/last-tool-tracker.ts` exporting `createLastToolTracker(now: () => number = Date.now)`.
- [x] State: a single `last` record `{ tool: string; target?: string; startedAt: number; id?: string; done: boolean }` or `null` (no list).
- [x] `onToolStart(tool: string, target: string | undefined, id?: string)` → set `last = { tool, target, startedAt: now(), id, done: false }` (replacing any previous).
- [x] `onToolEnd(id?: string)` → if `last` exists and `!last.done` and ids correlate, set `last.done = true`. Ids correlate when `id === last.id`, or when either `id` or `last.id` is `undefined` (best-effort match). Add a `// ponytail: id-correlated; interleaved parallel tools w/o ids fall back to best-effort, require ids if that matters` comment on the correlation line.
- [x] `timeoutHint(): string` returns exactly one of (per design D4):
  - `last === null` → `no tool observed before timeout (no tool activity in session)`
  - `last && !last.done` → `last tool: <tool>[ <target>] started <elapsed>ms ago; in-flight (no completion observed before timeout)`
  - `last && last.done` → `last tool: <tool>[ <target>] started <elapsed>ms ago; completed before timeout`
  where `<elapsed> = now() - last.startedAt`, and ` <target>` (with its leading space) is omitted when `target` is `undefined`.
- [x] Export a `LastToolTracker` interface for the three methods.

**Acceptance Criteria**:
- `createLastToolTracker` is importable from `../shared/last-tool-tracker.js` by both adapters.
- With an injected `now`, `timeoutHint()` output is deterministic and matches the three D4 strings.
- `onToolEnd` with a non-matching id leaves `last.done === false`; with a matching (or undefined-either) id sets it `true`.
- File is self-contained (no adapter/domain imports); `typecheck` passes.

## T-02: Unit test for the tracker (`src/adapter/shared/__tests__/last-tool-tracker.test.ts`)

- [x] New test file. Use an injected fake clock (closure counter or `vi.useFakeTimers()` + `Date.now`).
- [x] Assert: (a) start-only → hint contains tool, target, elapsed, and an in-flight marker; (b) start+matching-end → hint contains a completed marker and not the in-flight marker; (c) never started → hint contains `no tool observed`; (d) start + non-matching end → hint still in-flight.

**Acceptance Criteria**:
- Four assertions above pass.
- No modification to `inactivity-watchdog.test.ts` (this is a separate new file).

## T-03: Add `isToolResult` guard (`src/adapter/claude-code/message-types.ts`)

- [x] Add `isToolResult(v): v is { type: "user"; message: { content: Array<{ type: string; tool_use_id?: string }> } }` — true when `v.type === "user"` and `v.message.content` is an array containing at least one block with `type === "tool_result"`. Mirror the defensive style of `isToolUse`.
- [x] Provide a small helper (or inline in the runner) to read the `tool_use_id` of the first `tool_result` block for correlation.
- [x] Extend `isToolUse`'s narrowed `content_block` type to include `id?: string` so that T-04 can access `cb.id` directly without a cast. (The SDK's `BetaToolUseBlock` carries `id: string`; adding `id?: string` to the narrowed shape keeps the guard correct while enabling type-safe access. Alternatively, cast `(cb as { id?: string }).id` in the runner — either approach is acceptable as long as `typecheck` passes.)

**Acceptance Criteria**:
- `isToolResult` returns `true` for a `user` message with a `tool_result` block, `false` for `tool_use` / `assistant` / `result` / malformed messages.
- `isToolUse` behavior is unchanged.
- `cb.id` is accessible without a typecheck error in T-04 (via narrowed type update or cast).

## T-04: Wire the tracker into the claude-code runner (`src/adapter/claude-code/agent-runner.ts`)

**前提: T-03 完了** (T-03 must be complete before T-04 — `isToolResult` and `cb.id` access are required by this task.)

- [x] Import `createLastToolTracker` from `../shared/last-tool-tracker.js` and `isToolResult` from `./message-types.js`.
- [x] Construct one tracker per `run()`, alongside the watchdog (near lines 481-483), using the default `Date.now` clock (fake-timer compatible).
- [x] Extend `emitToolProgress` (or add an `observeMessage(msg)` closure in `run()`) so that wherever a `tool_use` is observed, `tracker.onToolStart(tool, target, cb.id)` is called with the same `tool`/`target` already computed, plus the content block's `id`.
- [x] At each `tool_result` observation, call `tracker.onToolEnd(tool_use_id)`. Cover the main work loop (656-686), the postWork follow-up `onMessage` callback (944), and the output-repair loop (1019-1021). Prefer a single `observeMessage(msg)` closure replacing the three `emitToolProgress(...)` call sites so start+end handling stays in one place.
- [x] In the `STEP_TIMEOUT` catch branch (1114-1132), add `hint: tracker.timeoutHint()` to the error `Object.assign(new Error(timeoutMessage), { code: "STEP_TIMEOUT", hint: ... })`. Do **not** change `timeoutMessage` / `formatInactivityTimeoutMessage`.

**Acceptance Criteria**:
- The `STEP_TIMEOUT` error message is byte-identical to before; only `hint` is added.
- `emitToolProgress` still emits `step:progress` at the same three sites (terminal display unchanged).
- `typecheck` passes.

## T-05: Wire the tracker into the codex runner (`src/adapter/codex/agent-runner.ts`)

- [x] Import `createLastToolTracker` from `../shared/last-tool-tracker.js`. Construct one tracker per `run()`, alongside the watchdog (near lines 335-341).
- [x] In the `item.started` handler (419-428), when `extractCodexProgress(startedEv.item) !== null`, call `tracker.onToolStart(p.tool, p.target, startedEv.item["id"] as string | undefined)`.
- [x] In the `item.completed` handler (429-434), when `extractCodexProgress(completedEv.item) !== null`, call `tracker.onToolEnd(completedEv.item["id"] as string | undefined)`. Do not call `onToolEnd` for non-tool items (e.g. `agent_message`).
- [x] In the `STEP_TIMEOUT` catch branch (761-778), add `hint: tracker.timeoutHint()` to the error `Object.assign(new Error(timeoutMessage), { code: "STEP_TIMEOUT", hint: ... })`. Do **not** change `timeoutMessage`.

**Acceptance Criteria**:
- The `STEP_TIMEOUT` error message is byte-identical to before; only `hint` is added.
- `step:progress` still emits on `item.started` unchanged; `extractCodexProgress` and the 40-char truncation are unchanged.
- `typecheck` passes.

## T-06: claude-code runner timeout integration test (`src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts`)

- [x] New test file. Reuse the mock-`queryFn` pattern (see `agent-redirect-integration.test.ts` for injecting `stream_event` `content_block_start` `tool_use` messages, and `sdk.d.ts` `SDKUserMessage` for the `tool_result` shape).
- [x] Build a mock generator that yields the desired tool_use / tool_result messages then awaits the `abortController` signal (race a never-resolving promise against `signal`), throwing on abort so the watchdog path is exercised. Use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS)` to fire the watchdog.
- [x] Assert on the returned `AgentRunResult`: `completionReason === "timeout"`, `error.code === "STEP_TIMEOUT"`, and `error.hint`:
  - Case A (tool_use only): hint contains tool name, target, elapsed ms, and the in-flight marker. (AC #1)
  - Case B (tool_use + matching tool_result): hint contains the completed marker (not in-flight). (AC #3)
  - Case C (no tool_use): hint contains `no tool observed`. (AC #4)

**Acceptance Criteria**:
- Cases A/B/C pass.
- `error.message` still matches `formatInactivityTimeoutMessage(step.name, elapsedMs)`.

## T-07: codex runner timeout integration test (`src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts`)

- [x] New test file. Reuse the `CodexThread` mock pattern (see `touched-files-injection.test.ts`) to yield `item.started` / `item.completed` events then hang until the injected abort signal.
- [x] Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS)` to fire the watchdog.
- [x] Assert on the returned `AgentRunResult` `error.hint`:
  - Case A (`item.started` `command_execution` only): hint contains tool name, command target, elapsed ms, and the in-flight marker. (AC #2)
  - Case B (`item.started` + matching `item.completed` by id): hint contains the completed marker. (AC #3)
  - Case C (only non-tool items, e.g. `agent_message`): hint contains `no tool observed`. (AC #4)

**Acceptance Criteria**:
- Cases A/B/C pass.
- `error.message` still matches `formatInactivityTimeoutMessage(step.name, elapsedMs)`.

## T-08: Full verification and existing-test invariance

- [x] Run `bun run typecheck && bun run test` (or the project's `verification.commands`); confirm green.
- [x] Confirm the six existing files in the design's AC-#5 inventory are unchanged and still pass (no edits to `inactivity-watchdog.ts`, `formatInactivityTimeoutMessage`, `makeTimeoutHalt`, or the timeout `message`).
- [x] Update the checkboxes in this file as tasks complete (implementer scope).

**Acceptance Criteria**:
- `typecheck && test` is green.
- The AC-#5 inventory files are byte-identical to `main` and green.
