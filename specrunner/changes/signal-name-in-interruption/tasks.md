# Tasks: Signal Name in Interruption Records

## T-01: Add `signal` field to `InterruptionRecord` type

In `src/store/event-journal.ts`, extend the `InterruptionRecord` interface.

- [ ] Add `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` as an optional field to `InterruptionRecord` (after `reason`, before `errorCode`)
- [ ] Add a JSDoc comment for the new field, e.g. `/** Signal name when reason === "signal" and the signal handler captured the name. Absent when written by exit-guard (no signal name available). */`

**Acceptance Criteria**:
- TypeScript accepts `{ type: "interruption", reason: "signal", signal: "SIGTERM", ts: "..." }` as a valid `InterruptionRecord`
- TypeScript accepts `{ type: "interruption", reason: "signal", ts: "..." }` (no `signal` field) as a valid `InterruptionRecord`
- Existing `appendInterruption` call-sites in `exit-guard.ts` (which pass no `signal`) compile without error

---

## T-02: Update `local.ts` — capture signal name and register SIGHUP

In `src/core/runtime/local.ts`, modify the `signalCleanup` closure and its registrations.

- [ ] Change `const signalCleanup = async (): Promise<void> =>` (line ~1683) to `const signalCleanup = async (signal: NodeJS.Signals): Promise<void> =>`
- [ ] In the `appendInterruption` call (lines ~1695-1699), add `signal` to the record: `{ type: "interruption", reason: "signal", signal, ts: new Date().toISOString() }`
- [ ] In the `transitionJob` call (lines ~1700-1711), change the `reason` field from `"Interrupted by signal"` to `` `Interrupted by ${signal}` `` — leave `resumePoint.reason` unchanged (still `"Interrupted by signal"`)
- [ ] After `process.on("SIGTERM", signalCleanup)` (line ~1721), add `process.on("SIGHUP", signalCleanup)`
- [ ] In `teardown` (lines ~1738-1739), add `process.off("SIGHUP", internals.signalCleanup)` after the SIGTERM deregistration

**Acceptance Criteria**:
- `signalCleanup` function accepts `NodeJS.Signals` as its first parameter
- `appendInterruption` is called with the `signal` field populated when signalCleanup runs
- Transition history entry message includes the signal name (e.g. `"Interrupted by SIGTERM"`)
- `resumePoint.reason` remains `"Interrupted by signal"` (unchanged)
- SIGHUP is registered with `process.on` at the same time as SIGINT and SIGTERM
- SIGHUP is deregistered with `process.off` in `teardown`

---

## T-03: Update `managed.ts` — capture signal name and register SIGHUP

In `src/core/runtime/managed.ts`, modify the `signalCleanup` closure and its registrations.

- [ ] Change `const signalCleanup = async (): Promise<void> =>` (line ~741) to `const signalCleanup = async (signal: NodeJS.Signals): Promise<void> =>`
- [ ] In the `transitionJob` call (lines ~746-757), change the `reason` field from `"Interrupted by signal"` to `` `Interrupted by ${signal}` `` — leave `resumePoint.reason` unchanged (still `"Interrupted by signal"`)
- [ ] After `process.on("SIGTERM", signalCleanup)` (line ~766), add `process.on("SIGHUP", signalCleanup)`
- [ ] In `teardown` (lines ~774-776), add `process.off("SIGHUP", internals.signalCleanup)` after the SIGTERM deregistration

Note: managed.ts `signalCleanup` does not call `appendInterruption` (only `transitionJob` + `persist`), so no interruption record change is needed here — only the transition message.

**Acceptance Criteria**:
- `signalCleanup` function accepts `NodeJS.Signals` as its first parameter
- Transition history entry message includes the signal name (e.g. `"Interrupted by SIGTERM"`)
- `resumePoint.reason` remains `"Interrupted by signal"` (unchanged)
- SIGHUP is registered with `process.on` at the same time as SIGINT and SIGTERM
- SIGHUP is deregistered with `process.off` in `teardown`

---

## T-04: Write pinning tests for local runtime signal recording

Create a new test file `src/core/runtime/__tests__/signal-name-in-interruption.test.ts`.

- [ ] Write a parameterized test over `["SIGINT", "SIGTERM", "SIGHUP"]` that invokes `signalCleanup(signal)` on a `LocalRuntime` instance with mocked store, and asserts that `appendInterruption` is called with `{ signal: "<SIGNAME>", reason: "signal", type: "interruption" }`
- [ ] In the same parameterized loop, assert that `persist` is called with a state whose history entry's `message` field contains the signal name (e.g. `"Interrupted by SIGTERM"`)
- [ ] Assert that `reason: "signal"` is present and unchanged (backward-compat pin)
- [ ] Write a test that `registerCleanup` on `LocalRuntime` calls `process.on` with `"SIGHUP"` in addition to `"SIGINT"` and `"SIGTERM"` (use `vi.spyOn(process, "on")`)
- [ ] Write a test that `teardown` on `LocalRuntime` calls `process.off` with `"SIGHUP"` (use `vi.spyOn(process, "off")`)
- [ ] Prevent actual process termination in all tests: `vi.spyOn(process, "exit").mockImplementation(() => undefined as never)`
- [ ] Use the same mock-setup pattern as `signal-handler-order.test.ts` (set `currentSlug` and `workspace` on the runtime instance; spy on `JobStateStore.prototype.appendInterruption` and `JobStateStore.prototype.persist`)
- [ ] Call `resetSignalHandlerFiredForTest()` in `beforeEach`/`afterEach` and `vi.restoreAllMocks()` in `afterEach`

**Acceptance Criteria**:
- For each of SIGINT, SIGTERM, SIGHUP: `appendInterruption` receives `{ signal: "<SIGNAME>" }`
- For each of SIGINT, SIGTERM, SIGHUP: history entry `message` contains the signal name
- `reason: "signal"` (the interruption record's `reason`) is asserted unchanged
- `process.on` is called with `"SIGHUP"` during `registerCleanup`
- `process.off` is called with `"SIGHUP"` during `teardown`

---

## T-05: Write pinning tests for managed runtime signal recording

Extend the test file from T-04 (or add a new `describe` block in the same file) for `ManagedRuntime`.

- [ ] Write a parameterized test over `["SIGINT", "SIGTERM", "SIGHUP"]` that invokes `signalCleanup(signal)` on a `ManagedRuntime` instance with mocked store, and asserts that the state passed to `store.persist` has a history entry whose `message` includes the signal name (e.g. `"Interrupted by SIGTERM"`)
- [ ] Assert that `resumePoint.reason` is NOT the signal name (it remains `"Interrupted by signal"`)
- [ ] Write a test that `registerCleanup` on `ManagedRuntime` calls `process.on` with `"SIGHUP"`
- [ ] Write a test that `teardown` on `ManagedRuntime` calls `process.off` with `"SIGHUP"`
- [ ] Mock `store.load` to return a valid running state; mock `store.persist` to capture calls; prevent `process.exit`
- [ ] Look at the `ManagedRuntime` internals pattern (access `internals.signalCleanup` via `handle as unknown as ManagedCleanupInternals` cast, or invoke it directly from the mock)

**Acceptance Criteria**:
- For each of SIGINT, SIGTERM, SIGHUP: history entry `message` contains the signal name
- `resumePoint.reason` remains `"Interrupted by signal"` (unchanged from current managed behavior)
- `process.on` is called with `"SIGHUP"` during `registerCleanup`
- `process.off` is called with `"SIGHUP"` during `teardown`

---

## T-06: Verify full test suite passes

Run the verification commands in the repository root. This task is the final gate — no source changes should be needed if T-01 through T-05 are correctly implemented.

- [ ] Run `bun run typecheck` and confirm zero type errors
- [ ] Run `bun run test` and confirm all tests pass, including:
  - The new tests from T-04 and T-05
  - Existing `signal-handler-order.test.ts` (must pass unchanged)
  - Existing `exit-guard.test.ts` (must pass unchanged — `resumePoint.reason: "signal"` assertions are unaffected)
  - Existing `member-resume-routing.test.ts` and `resume-member-context.test.ts` (use `resumePoint.reason: "Interrupted by signal"` which is unchanged)
  - Existing `apply-canon-provenance.test.ts` and canon-provenance tests (unaffected since `INTERRUPTION_REASONS` is unchanged)

**Acceptance Criteria**:
- `bun run typecheck` exits 0
- `bun run test` exits 0 with all tests green
