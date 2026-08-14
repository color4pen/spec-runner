# Tasks: STEP_TIMEOUT halt records carry last-tool observation

## T-01: Add the shared last-tool tracker (`src/adapter/shared/last-tool-tracker.ts`)

- [ ] Create `src/adapter/shared/last-tool-tracker.ts` exporting `createLastToolTracker(now: () => number = Date.now)`.
- [ ] State: a single `last` record `{ tool: string; target?: string; startedAt: number; id?: string; done: boolean }` or `null` (no list).
- [ ] `onToolStart(tool: string, target: string | undefined, id?: string)` → set `last = { tool, target, startedAt: now(), id, done: false }` (replacing any previous).
- [ ] `onToolEnd(id?: string)` → if `last` exists and `!last.done` and ids correlate, set `last.done = true`. Ids correlate when `id === last.id`, or when either `id` or `last.id` is `undefined` (best-effort match). Add a `// ponytail: id-correlated; interleaved parallel tools w/o ids fall back to best-effort, require ids if that matters` comment on the correlation line.
- [ ] `timeoutHint(): string` returns exactly one of (per design D4):
  - `last === null` → `no tool observed before timeout (no tool activity in session)`
  - `last && !last.done` → `last tool: <tool>[ <target>] started <elapsed>ms ago; in-flight (no completion observed before timeout)`
  - `last && last.done` → `last tool: <tool>[ <target>] started <elapsed>ms ago; completed before timeout`
  where `<elapsed> = now() - last.startedAt`, and ` <target>` (with its leading space) is omitted when `target` is `undefined`.
- [ ] Export a `LastToolTracker` interface for the three methods.

**Acceptance Criteria**:
- `createLastToolTracker` is importable from `../shared/last-tool-tracker.js` by both adapters.
- With an injected `now`, `timeoutHint()` output is deterministic and matches the three D4 strings.
- `onToolEnd` with a non-matching id leaves `last.done === false`; with a matching (or undefined-either) id sets it `true`.
- File is self-contained (no adapter/domain imports); `typecheck` passes.

## T-02: Unit test for the tracker (`src/adapter/shared/__tests__/last-tool-tracker.test.ts`)

- [ ] New test file. Use an injected fake clock (closure counter or `vi.useFakeTimers()` + `Date.now`).
- [ ] Assert: (a) start-only → hint contains tool, target, elapsed, and an in-flight marker; (b) start+matching-end → hint contains a completed marker and not the in-flight marker; (c) never started → hint contains `no tool observed`; (d) start + non-matching end → hint still in-flight.

**Acceptance Criteria**:
- Four assertions above pass.
- No modification to `inactivity-watchdog.test.ts` (this is a separate new file).

## T-03: Add `isToolResult` guard (`src/adapter/claude-code/message-types.ts`)

- [ ] Add `isToolResult(v): v is { type: "user"; message: { content: Array<{ type: string; tool_use_id?: string }> } }` — true when `v.type === "user"` and `v.message.content` is an array containing at least one block with `type === "tool_result"`. Mirror the defensive style of `isToolUse`.
- [ ] Provide a small helper (or inline in the runner) to read the `tool_use_id` of the first `tool_result` block for correlation.

**Acceptance Criteria**:
- `isToolResult` returns `true` for a `user` message with a `tool_result` block, `false` for `tool_use` / `assistant` / `result` / malformed messages.
- `isToolUse` behavior is unchanged.

## T-04: Wire the tracker into the claude-code runner (`src/adapter/claude-code/agent-runner.ts`)

- [ ] Import `createLastToolTracker` from `../shared/last-tool-tracker.js` and `isToolResult` from `./message-types.js`.
- [ ] Construct one tracker per `run()`, alongside the watchdog (near lines 481-483), using the default `Date.now` clock (fake-timer compatible).
- [ ] Extend `emitToolProgress` (or add an `observeMessage(msg)` closure in `run()`) so that wherever a `tool_use` is observed, `tracker.onToolStart(tool, target, cb.id)` is called with the same `tool`/`target` already computed, plus the content block's `id`.
- [ ] At each `tool_result` observation, call `tracker.onToolEnd(tool_use_id)`. Cover the main work loop (656-686), the postWork follow-up `onMessage` callback (944), and the output-repair loop (1019-1021). Prefer a single `observeMessage(msg)` closure replacing the three `emitToolProgress(...)` call sites so start+end handling stays in one place.
- [ ] In the `STEP_TIMEOUT` catch branch (1114-1132), add `hint: tracker.timeoutHint()` to the error `Object.assign(new Error(timeoutMessage), { code: "STEP_TIMEOUT", hint: ... })`. Do **not** change `timeoutMessage` / `formatInactivityTimeoutMessage`.

**Acceptance Criteria**:
- The `STEP_TIMEOUT` error message is byte-identical to before; only `hint` is added.
- `emitToolProgress` still emits `step:progress` at the same three sites (terminal display unchanged).
- `typecheck` passes.

## T-05: Wire the tracker into the codex runner (`src/adapter/codex/agent-runner.ts`)

- [ ] Import `createLastToolTracker` from `../shared/last-tool-tracker.js`. Construct one tracker per `run()`, alongside the watchdog (near lines 335-341).
- [ ] In the `item.started` handler (419-428), when `extractCodexProgress(startedEv.item) !== null`, call `tracker.onToolStart(p.tool, p.target, startedEv.item["id"] as string | undefined)`.
- [ ] In the `item.completed` handler (429-434), when `extractCodexProgress(completedEv.item) !== null`, call `tracker.onToolEnd(completedEv.item["id"] as string | undefined)`. Do not call `onToolEnd` for non-tool items (e.g. `agent_message`).
- [ ] In the `STEP_TIMEOUT` catch branch (761-778), add `hint: tracker.timeoutHint()` to the error `Object.assign(new Error(timeoutMessage), { code: "STEP_TIMEOUT", hint: ... })`. Do **not** change `timeoutMessage`.

**Acceptance Criteria**:
- The `STEP_TIMEOUT` error message is byte-identical to before; only `hint` is added.
- `step:progress` still emits on `item.started` unchanged; `extractCodexProgress` and the 40-char truncation are unchanged.
- `typecheck` passes.

## T-06: claude-code runner timeout integration test (`src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts`)

- [ ] New test file. Reuse the mock-`queryFn` pattern (see `agent-redirect-integration.test.ts` for injecting `stream_event` `content_block_start` `tool_use` messages, and `sdk.d.ts` `SDKUserMessage` for the `tool_result` shape).
- [ ] Build a mock generator that yields the desired tool_use / tool_result messages then awaits the `abortController` signal (race a never-resolving promise against `signal`), throwing on abort so the watchdog path is exercised. Use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS)` to fire the watchdog.
- [ ] Assert on the returned `AgentRunResult`: `completionReason === "timeout"`, `error.code === "STEP_TIMEOUT"`, and `error.hint`:
  - Case A (tool_use only): hint contains tool name, target, elapsed ms, and the in-flight marker. (AC #1)
  - Case B (tool_use + matching tool_result): hint contains the completed marker (not in-flight). (AC #3)
  - Case C (no tool_use): hint contains `no tool observed`. (AC #4)

**Acceptance Criteria**:
- Cases A/B/C pass.
- `error.message` still matches `formatInactivityTimeoutMessage(step.name, elapsedMs)`.

## T-07: codex runner timeout integration test (`src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts`)

- [ ] New test file. Reuse the `CodexThread` mock pattern (see `touched-files-injection.test.ts`) to yield `item.started` / `item.completed` events then hang until the injected abort signal.
- [ ] Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS)` to fire the watchdog.
- [ ] Assert on the returned `AgentRunResult` `error.hint`:
  - Case A (`item.started` `command_execution` only): hint contains tool name, command target, elapsed ms, and the in-flight marker. (AC #2)
  - Case B (`item.started` + matching `item.completed` by id): hint contains the completed marker. (AC #3)
  - Case C (only non-tool items, e.g. `agent_message`): hint contains `no tool observed`. (AC #4)

**Acceptance Criteria**:
- Cases A/B/C pass.
- `error.message` still matches `formatInactivityTimeoutMessage(step.name, elapsedMs)`.

## T-08: Full verification and existing-test invariance

- [ ] Run `bun run typecheck && bun run test` (or the project's `verification.commands`); confirm green.
- [ ] Confirm the six existing files in the design's AC-#5 inventory are unchanged and still pass (no edits to `inactivity-watchdog.ts`, `formatInactivityTimeoutMessage`, `makeTimeoutHalt`, or the timeout `message`).
- [ ] Update the checkboxes in this file as tasks complete (implementer scope).

**Acceptance Criteria**:
- `typecheck && test` is green.
- The AC-#5 inventory files are byte-identical to `main` and green.
