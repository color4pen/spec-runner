# Tasks: job cancel process-tree kill

## T-01: Shared pid resolver (state → jobId-matched sidecar)

- [x] Add a pure resolver module (recommended `src/core/liveness/resolve-pid.ts`)
      exporting:
  - `readLivenessSidecar(sidecarAbsPath): Promise<{ pid: number | null; jobId: string | null } | null>`
    — async `fs.readFile` + `JSON.parse`; returns null when absent/unparseable.
  - `resolveJobPid({ statePid, sidecar, expectedJobId }): { pid: number | null; source: "state" | "sidecar" | null }`
    — pure: `statePid` when non-null; else `sidecar.pid` **only if**
    `sidecar.jobId === expectedJobId`; else `{ pid: null, source: null }`.
- [x] Reuse the existing `SidecarRecord`/liveness path conventions
      (`livenessJsonPath` from `src/util/paths.ts`); do not hardcode the path.

**Acceptance Criteria**:
- `resolveJobPid` returns `{ pid: statePid, source: "state" }` when `statePid` is set,
  even if a sidecar pid is present.
- `resolveJobPid` returns the sidecar pid only when `expectedJobId` matches
  `sidecar.jobId`; returns `{ pid: null, source: null }` on jobId mismatch.
- A `test_*`/unit test fixes these three cases (state wins, sidecar match adopted,
  sidecar mismatch rejected). No fs required for the resolver test.

## T-02: Process-death-gated kill + sidecar pid resolution in cancel

- [x] In `src/core/cancel/runner.ts`, replace the `state.status === "running"`
      kill gate with a pid-resolution gate: read the liveness sidecar via T-01,
      compute `resolveJobPid({ statePid: state.pid, sidecar, expectedJobId: state.jobId })`.
- [x] If a pid resolves, call `gracefulKill(pid, GRACEFUL_KILL_TIMEOUT_MS, …)`
      regardless of `state.status`. If no pid resolves, push a warning whose text
      contains the substring `no PID recorded` (widened to note both `state.pid`
      and the sidecar were empty) and continue.
- [x] Keep the `archived` (reject) and `awaiting-archive && !force` (reject)
      pre-checks unchanged; the pid gate runs only after those.
- [x] Do not change the evacuate/persist/cleanup/sidecar-teardown ordering below
      the kill block.

**Acceptance Criteria**:
- Cancel with `state.pid` null and a jobId-matched sidecar pid kills the sidecar
  pid (test).
- Cancel with on-disk `state.status === "awaiting-resume"` and a resolved live pid
  runs `gracefulKill` (SIGTERM sent) — a "破壊確認" test that fails if the status
  gate is restored.
- Cancel with a sidecar whose `jobId` differs from the job does **not** signal the
  sidecar pid (test).
- Existing `tests/unit/core/cancel/runner.test.ts` stays green, including
  "continues with warning when pid is null" (warning still contains
  `no PID recorded`) and "running status: kills pid and transitions to canceled".

## T-03: Group reap on SIGKILL escalation, gated by leader detection

- [x] In `src/core/cancel/pid-kill.ts`: add `isGroupLeader: (pid: number) => boolean`
      to `KillDeps`; add `groupKilled: boolean` to `KillResult`.
- [x] At the SIGKILL escalation step, after sending `kill(pid, "SIGKILL")`,
      when `isGroupLeader(pid)` is true also send `kill(-pid, "SIGKILL")` and set
      `groupKilled: true`. Group-signal errors (EPERM/ESRCH) are best-effort and
      MUST NOT flip `killed`; default `groupKilled: false` on all other paths
      (SIGTERM success, non-leader, EPERM-on-pid).
- [x] In `src/core/cancel/runner.ts` `CancelDeps`: add optional
      `isGroupLeader?: (pid: number) => boolean`; pass
      `deps.isGroupLeader ?? (() => false)` into `gracefulKill`.
- [x] In `src/cli/cancel.ts`: populate `isGroupLeader` with the production probe
      `(pid) => { try { process.kill(-pid, 0); return true; } catch { return false; } }`.
- [x] Update `tests/unit/core/cancel/pid-kill.test.ts` `makeDeps` to supply a
      default `isGroupLeader: () => false` (so existing gracefulKill tests stay
      green with single-pid SIGKILL).

**Acceptance Criteria**:
- New pid-kill tests fix: on escalation with `isGroupLeader → true`, `kill` is
  called with `(-pid, "SIGKILL")` and `groupKilled === true`; with
  `isGroupLeader → false`, `kill` is NOT called with any negative pid and
  `groupKilled === false`. (kill seam injected.)
- Existing pid-kill tests (SIGTERM-immediate, poll, timeout→SIGKILL, ESRCH, EPERM)
  stay green: `kill(pid, "SIGKILL")` is still sent on escalation.
- `typecheck` passes with the new `KillDeps`/`KillResult`/`CancelDeps` fields.

## T-04: Cancel output reflects group reap

- [x] In `src/core/cancel/runner.ts`, when the graceful kill returns
      `groupKilled: true`, push an `info` line stating the process group was
      reaped (referencing `-<pid>`). Preserve the existing warning-on-failure
      behavior (`killResult.warning`).

**Acceptance Criteria**:
- A cancel whose kill escalated and reaped a leader's group includes an `info`
  line naming the reaped group (test may drive this via injected `kill`/`isAlive`/
  `isGroupLeader` deps returning a leader that stays alive through the poll).
- A cancel that resolves no pid still emits the `no PID recorded` warning (T-02).

## T-05: QueryAbortHub + registration port

- [x] Add the registration port (recommended `src/core/port/query-abort.ts`):
      `interface QueryAbortRegistration { register(controller: AbortController): () => void }`.
- [x] Add the concrete hub (recommended `src/core/lifecycle/query-abort-hub.ts`):
      `class QueryAbortHub implements QueryAbortRegistration` with:
  - `register(controller)` → adds to an internal set, returns a deregister fn.
  - `abortActive()` → calls `controller.abort()` on every registered controller
    (idempotent; safe to call with an empty set).
  - `drain(timeoutMs, sleep)` → resolves when the registered set is empty or the
    bound elapses (poll on a short interval using the injected `sleep`).
- [x] No I/O; pure and unit-testable.

**Acceptance Criteria**:
- Unit test: `register` then `abortActive` sets `controller.signal.aborted === true`.
- Unit test: `drain` resolves promptly once the last controller deregisters, and
  resolves at the bound when a controller never deregisters (injected `sleep`).
- `abortActive` on an empty hub is a no-op (no throw).

## T-06: Register the per-call AbortController from the agent runner

- [x] In `src/adapter/claude-code/agent-runner.ts`: add optional
      `queryAbortHub?: QueryAbortRegistration` to `ClaudeCodeRunnerDeps`
      (type-only import from `src/core/port/query-abort.ts`; store on the runner).
- [x] In `run()`, immediately after the per-call `AbortController` is created
      (currently `src/adapter/claude-code/agent-runner.ts:516`), register it with
      the hub when present, and deregister on **every** exit path of `run()`
      (wrap the remaining body so the `finally` always deregisters — success,
      error, and throw).
- [x] When `queryAbortHub` is absent, behavior is unchanged (managed runtime and
      existing tests).

**Acceptance Criteria**:
- When a hub is injected, `run()` registers exactly one controller for the run and
  deregisters it once the run settles (test may use a fake hub capturing
  register/deregister).
- Existing agent-runner tests (no hub wired) stay green.
- `typecheck` passes; the adapter imports only from `core/port` (no new
  `core/lifecycle`/`core/runtime` runtime import).

## T-07: Wire the hub into LocalRuntime and abort on signal

- [x] In `src/core/runtime/local.ts`: construct a `QueryAbortHub` (field on
      `LocalRuntime`); pass it into `createClaudeCodeRunner({ … queryAbortHub })`
      inside `createAgentRunner()`.
- [x] In `signalCleanup` (registerCleanup): keep `markSignalHandlerFired()` as the
      first synchronous statement; then call `hub.abortActive()` and
      `await hub.drain(bound, sleep)` **before** the existing load →
      appendInterruption → transition `awaiting-resume` → persist flow. Preserve
      `releasePowerAssertion()` + `process.exit(130)` as the tail. Use a module
      constant for the bound and an inline `setTimeout` sleep (matching existing
      style).
- [x] Deregister the signal handlers in `teardown` unchanged.

**Acceptance Criteria**:
- Test (seam-injected): construct `LocalRuntime`, access the hub (private field,
  as `signal-handler-order.test.ts` accesses `workspace`), register a fake
  `AbortController` (wired to deregister on its own `abort` event so `drain`
  resolves fast), mock `process.exit`, invoke `signalCleanup()`, and assert the
  controller's `signal.aborted === true`. "破壊確認": removing the `abortActive()`
  call makes the assertion fail.
- The existing `awaiting-resume` persist still runs on `signalCleanup()` (assert
  `persist` was called; status `awaiting-resume`).
- `src/core/runtime/__tests__/signal-handler-order.test.ts` (TC-016) stays green
  (flag set before the first await; `drain` on an empty hub resolves immediately).

## T-08: Integration — detached job cancel leaves no process-group survivors

- [x] Add a POSIX-only integration test (recommended
      `tests/cancel-process-group-integration.test.ts`) that:
  - spawns a real leader process with `detached: true` (its own group leader) that
    itself spawns a longer-lived child (e.g. `sleep`) in the same group;
  - runs the cancel graceful-kill path against the leader pid with the production
    `isGroupLeader` probe and a short escalation timeout so it reaches SIGKILL;
  - after the kill, asserts no process in the leader's group survives
    (poll `process.kill(-leaderPid, 0)` until `ESRCH`, bounded).
- [x] Skip the test on `process.platform === "win32"` (state the POSIX constraint).

**Acceptance Criteria**:
- After cancel, the detached leader and its child are both gone (group probe
  yields `ESRCH`).
- "破壊確認": stubbing the group send to a no-op (`isGroupLeader → false`) leaves
  the child alive and the test fails.
- The test cleans up any survivors in `afterEach` (best-effort `kill(-pid)`).

## T-09: Full gate

- [x] `bun run typecheck` passes.
- [x] `bun run test` passes, including the four pinned existing suites
      (`tests/unit/core/cancel/runner.test.ts`, `tests/unit/cli/cancel.test.ts`,
      `tests/unit/core/cancel/sidecar-teardown.test.ts`,
      `src/core/cancel/__tests__/runner-branch-delete.test.ts`) — unchanged except
      any `it` explicitly named here that pins the removed status gate.
- [x] Update `tasks.md` checkboxes as tasks complete.

**Acceptance Criteria**:
- `typecheck && test` green.
- No pinned existing cancel `it` is modified except where T-02/T-03 name a
  status-gate-pinning expectation that must change; shared `makeDeps` helper edits
  (adding benign defaults) are plumbing, not expectation changes.
