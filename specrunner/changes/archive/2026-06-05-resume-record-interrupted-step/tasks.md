# Tasks: resume-record-interrupted-step

## T-01: Record the in-progress step in the signal-cleanup resume point

**File**: `src/core/runtime/local.ts`

In `registerCleanup`, inside the `signalCleanup` closure, the `resumePoint` patch
currently writes the launch step. `current` is already loaded earlier in the same
closure (`const current = await store.load();`).

- [x] Change the `resumePoint.step` value in the `transitionJob(..., { patch: { resumePoint: { ... } } })`
      call from `step: startStep as StepName` to `step: (current.step ?? startStep) as StepName`.
- [x] Make no other change in this function: `reason`, `iterationsExhausted`,
      `pid: null`, the `transitionJob` target (`awaiting-resume`), the `try/catch`
      best-effort behavior, and `process.exit(130)` all remain as-is.
- [x] Do not change the `ResumePoint` type (`src/state/schema.ts`) or
      `resolveResumeStep` (`src/core/resume/resolve-step.ts`).

**Acceptance Criteria**:
- On signal interruption, `resumePoint.step` is the loaded `current.step` (the
  step that was executing), not `startStep`.
- When `current.step` is null/undefined, `resumePoint.step` falls back to
  `startStep` (via the `??` operator — no fallback on other values).
- `current` continues to be the state already loaded inside `signalCleanup`; no
  second `store.load()` is added.

## T-02: Test that the real signal handler records the in-progress step

**File**: `tests/unit/core/runtime/local.test.ts`

Add a test (e.g. `TC-LR-015`) that exercises the **real** `LocalRuntime`
signal-cleanup handler — not a reconstructed copy of the logic.

- [x] Build a `LocalRuntime` with the existing test harness (tempDir, mock
      manager, mock githubClient) as other TC-LR tests do.
- [x] Create a job state via `JobStateStore.create(tempDir, ...)`, then persist an
      update so the in-progress step differs from the launch step: set
      `step: "code-review"` and `status: "running"` (use a `JobStateStore`
      instance: `load()` → spread with `step: "code-review"` → `persist()`).
- [x] Call `runtime.registerCleanup(jobId, "design")` so `startStep` is `design`
      (intentionally different from the persisted `step`).
- [x] Stub `process.exit` to a no-op for the duration of the test (save and
      restore the original, mirroring `tests/unit/cli/run-worktree-signal.test.ts`).
- [x] Capture the newly registered SIGINT listener (diff `process.listeners("SIGINT")`
      before/after `registerCleanup`, or grab the last listener), invoke it, and
      `await` its completion.
- [x] Load the persisted state from disk via `new JobStateStore(jobId, tempDir).load()`
      and assert:
  - `state.status === "awaiting-resume"`
  - `state.resumePoint?.step === "code-review"` (the in-progress step)
  - `state.resumePoint?.step !== "design"` (not the launch step)
- [x] In a `finally` (or afterEach-safe block), restore `process.exit` and
      deregister the captured listener via `process.off("SIGINT", listener)` so the
      handler does not leak into other tests.

**Acceptance Criteria**:
- The test fails against the pre-fix code (records `design`) and passes after T-01
  (records `code-review`).
- Because the persisted `step` (`code-review`) differs from `startStep`
  (`design`), the assertion proves the in-progress step takes precedence over the
  launch-step fallback (the `??` left operand wins).
- The test invokes the real `registerCleanup`/`signalCleanup` path, not a
  reconstructed cleanup function.

## T-03: Verify resume resolves to the interrupted step (no regression)

**Files**: `tests/unit/core/resume/resolve-step.test.ts` (inspection only),
`src/core/resume/resolve-step.ts` (no change)

Confirm the corrected origin value flows through `resolveResumeStep` as intended,
without modifying resolution logic.

- [x] Confirm via the existing `resolve-step` suite that a `resumePoint.step` of
      `code-review` (impl-phase reviewer) with `iterationsExhausted: 0` resolves to
      `code-review` (Tier 2c crash-restart) — i.e. resume does not jump back to
      `design`. If no existing case covers `code-review` with
      `iterationsExhausted: 0`, add one mirroring the existing `makeResumePoint`
      style; otherwise rely on the existing coverage.
- [x] Do not alter `resolveResumeStep` behavior or the `ResumePoint` type.

**Acceptance Criteria**:
- Given `resumePoint.step = "code-review"` and `iterationsExhausted = 0`,
  `resolveResumeStep` returns `code-review` (or its correct downstream target per
  existing rules), never the launch step `design`.
- `resolveResumeStep` and `ResumePoint` are unchanged.

## T-04: Full verification

- [x] `bun run typecheck` is green.
- [x] `bun run test` is green (all existing resume / lifecycle / runtime tests
      pass — no regression).

**Acceptance Criteria**:
- `bun run typecheck && bun run test` exits 0.
- Existing resume-related tests and state-transition tests remain green.
