# Design: resume-record-interrupted-step

## Context

When a `local` runtime pipeline is interrupted by SIGINT/SIGTERM, the cleanup
handler `signalCleanup` (registered in `LocalRuntime.registerCleanup`,
`src/core/runtime/local.ts`) transitions the job to `awaiting-resume` and records
a `resumePoint` so a later `specrunner resume` knows where to continue.

`signalCleanup` already loads the latest persisted job state:

```
const current = await store.load();          // L426 — has current.step
const { state: updated } = transitionJob(current as JobState, "awaiting-resume", {
  ...
  patch: {
    pid: null,
    resumePoint: {
      step: startStep as StepName,            // L432 — BUG: writes the launch step
      reason: "Interrupted by signal",
      iterationsExhausted: 0,
    },
  },
});
```

`startStep` is the step the pipeline was *launched from* (the value passed into
`registerCleanup`). The pipeline advances `state.step` as it progresses, so by the
time a signal arrives `current.step` holds the step that was actually executing.
Recording `startStep` instead discards that information.

`resolveResumeStep` (`src/core/resume/resolve-step.ts`) uses the recorded
`resumePoint.step` as the origin for resume decisions (Tier 2a/2b/2c). A wrong
origin propagates: e.g. launching from `design` and getting interrupted during
`code-review` records `design`, so resume restarts the entire pipeline from
`design` instead of continuing near `code-review`.

`current.step` is always a validated non-empty string when `store.load()`
succeeds (`validateJobState` enforces `typeof step === "string"`). If `load()`
throws, the whole `try` block is already swallowed (best-effort) and no
`resumePoint` is written. The launch step (`startStep`) therefore only matters as
a defensive fallback for a malformed/absent `step`.

## Goals / Non-Goals

**Goals**:

- Record the **in-progress** step (`current.step`) in `resumePoint.step` on signal
  interruption, so resume continues from where execution was interrupted rather
  than from the launch step.
- Fall back to `startStep` only when `current.step` is null/undefined.

**Non-Goals**:

- Redesigning `resumePoint` into an interruption-reason-tagged type
  (discriminated union). Out of scope — separate request.
- Changing `resolveResumeStep`'s resolution logic (Tier 2a fixer-empty detection,
  2b review-exhaustion, 2c crash-restart). Left untouched; this change only feeds
  it a correct origin value.
- Adding a signal handler to the `managed` runtime. Managed runtime has no signal
  handler, so this fix affects `local` runtime only. Runtime asymmetry is a
  separate concern.
- adr-gen date-path double-generation, exit-code multiplexing, retry/resume
  concept separation.

## Decisions

### D1: Write `current.step ?? startStep` into `resumePoint.step`

Replace `step: startStep as StepName` with `step: (current.step ?? startStep) as StepName`
inside the `signalCleanup` `resumePoint` patch.

- **Rationale**: `current` is already loaded in the same function; the correct
  value is in hand and merely unused. `??` falls back to `startStep` only on
  null/undefined (not on other values), matching the requirement that the launch
  step is a defensive fallback, not the primary source. This is the smallest
  change that fixes the recorded value.
- **Alternatives considered**:
  - *Compute the interrupted step independently* (e.g. re-derive from
    `state.steps` history): rejected — `current.step` already is the interrupted
    step; re-derivation adds logic with no benefit.
  - *Drop `startStep` entirely and always write `current.step`*: rejected — keeps
    a defensive fallback for the (validation-guarded, practically unreachable)
    case where `step` is absent, at zero cost.
  - *`||` instead of `??`*: rejected — `||` would also fall back on empty string,
    which the requirement does not ask for; `??` matches "null/undefined only".

### D2: Leave `resumePoint` type and `resolveResumeStep` unchanged

Only the **value** written changes; the **type** (`ResumePoint`) and the
**consumer** (`resolveResumeStep`) are untouched.

- **Rationale**: Correctness of the written value is a prerequisite for any later
  type/logic simplification. Fixing the value first keeps this change small,
  reviewable, and independently shippable. The Tier 2a correction logic in
  `resolveResumeStep` becomes *more* trustworthy once it receives a correct
  origin, but removing/altering it is explicitly out of scope.
- **Alternatives considered**:
  - *Bundle the discriminated-union redesign here*: rejected — larger surface,
    couples a record-value fix to a type redesign, harder to review.

## Risks / Trade-offs

- [Risk] A test that drives the *real* `signalCleanup` must invoke
  `process.exit(130)`. → Mitigation: stub `process.exit` to a no-op for the
  duration of the test (existing pattern in
  `tests/unit/cli/run-worktree-signal.test.ts`), capture the registered SIGINT
  listener via `process.listeners("SIGINT")`, invoke it directly, then assert on
  the persisted state. Restore `process.exit` and deregister the listener in
  cleanup.
- [Risk] The null/undefined fallback branch is not reachable through a validated
  `store.load()` (validation guarantees `step` is a string). → Mitigation: the
  primary test uses a state whose `step` (`code-review`) differs from `startStep`
  (`design`) and asserts the result is `code-review`; this proves the `??` left
  operand (the in-progress step) takes precedence over the fallback. The fallback
  branch is a defensive guard verified by inspection + typecheck, not by a
  dedicated runtime test.
- [Trade-off] The fix only affects `local` runtime. Interrupting a `managed` run
  is unaffected because managed has no signal handler — accepted, out of scope.

## Open Questions

None.
