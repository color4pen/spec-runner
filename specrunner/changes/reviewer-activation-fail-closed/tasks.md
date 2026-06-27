# Tasks: reviewer-activation-fail-closed

## T-01: Add `changedFilesDerivable` fact and fail-closed `paths` handling to `evaluateActivation`

**File**: `src/core/reviewers/activation.ts`

- [x] Add an optional field to the `ActivationFacts` interface:
  ```typescript
  /**
   * Whether the runtime can mechanically derive `changedFiles`.
   * Optional; defaults to `true` (derivable) when omitted, so existing call sites
   * (e.g. computeInvalidations) are unaffected.
   * When `false`, a `paths` condition cannot be evaluated; the reviewer is activated
   * (fail-closed) rather than silently skipped on an unverifiable path condition.
   */
  changedFilesDerivable?: boolean;
  ```
- [x] In `evaluateActivation`, inside the `if (cond.paths) { ... }` block, BEFORE the
  `const matched = ...` glob check, add the fail-closed guard:
  ```typescript
  // Fail-closed: when changed files cannot be derived (e.g. managed runtime, no
  // git worktree), the `paths` condition is unverifiable. Activate the reviewer
  // (it reviews the whole change) instead of silently skipping it —
  // "判定できない＝該当しうる". Never drop a path reviewer because the runtime
  // cannot list changed files.
  if (facts.changedFilesDerivable === false) {
    return { activated: true, reason: "activated" };
  }
  ```
- [x] Do NOT change the `requestTypes` block or its position: `requestTypes` is still
  evaluated before `paths`, so a `requestTypes` mismatch skips deterministically even
  when `changedFilesDerivable === false`.
- [x] Do NOT change the "no conditions → always activate" early return or the existing
  `matched`/skip logic.

**Acceptance Criteria**:
- `evaluateActivation({ paths: ["src/auth/**"] }, { changedFiles: [], requestType: "bug-fix", changedFilesDerivable: false })` returns `{ activated: true }`.
- `evaluateActivation({ requestTypes: ["spec-change"], paths: ["src/auth/**"] }, { changedFiles: [], requestType: "bug-fix", changedFilesDerivable: false })` returns `{ activated: false }` with a reason mentioning `requestType`.
- `evaluateActivation({ paths: ["src/auth/**"] }, { changedFiles: ["src/util/helper.ts"], requestType: "bug-fix", changedFilesDerivable: true })` returns `{ activated: false }` with a reason naming the `paths` globs.
- `evaluateActivation({ paths: ["src/auth/**"] }, { changedFiles: ["src/util/helper.ts"], requestType: "bug-fix" })` (no `changedFilesDerivable`) returns `{ activated: false }` — identical to the `true` case.
- `bun run typecheck` passes.

---

## T-02: Make the activation gate consult `canDeriveChangedFiles()` and short-circuit `listChangedFiles`

**File**: `src/core/step/executor.ts` (the `if (step.activation)` block, currently lines ~221-233 in `runAgentStep`)

- [x] Replace the current body of the `if (step.activation)` block. The current code is:
  ```typescript
  if (step.activation) {
    const baseBranch = deps.request.baseBranch ?? "main";
    const changedFiles = deps.runtimeStrategy
      ? await deps.runtimeStrategy.listChangedFiles(baseBranch, cwd, state.branch ?? null)
      : [];
    const decision = evaluateActivation(step.activation, {
      changedFiles,
      requestType: deps.request.type,
    });
    if (!decision.activated) {
      return this.finalizeSkippedStep(step, state, decision.reason);
    }
  }
  ```
- [x] New body:
  ```typescript
  if (step.activation) {
    const baseBranch = deps.request.baseBranch ?? "main";
    // Fail-closed: when the runtime explicitly declares it cannot derive changed
    // files (managed runtime — no local git worktree), listChangedFiles returns []
    // *structurally*, not because nothing changed. Evaluating a `paths` condition
    // against that empty list would silently skip the reviewer (fail-open). Mirror
    // scope-check (scope-check.ts): treat non-derivable as "paths unverifiable" and
    // let evaluateActivation activate instead of skip.
    const changedFilesDerivable =
      deps.runtimeStrategy?.canDeriveChangedFiles?.() !== false;
    const changedFiles =
      deps.runtimeStrategy && changedFilesDerivable
        ? await deps.runtimeStrategy.listChangedFiles(baseBranch, cwd, state.branch ?? null)
        : [];
    const decision = evaluateActivation(step.activation, {
      changedFiles,
      requestType: deps.request.type,
      changedFilesDerivable,
    });
    if (!decision.activated) {
      return this.finalizeSkippedStep(step, state, decision.reason);
    }
  }
  ```
- [x] Update the explanatory comment block immediately above the `if (step.activation)`
  block (currently "Activation gate (reviewer-activation-conditions D5)…") to note that
  the gate now consults `canDeriveChangedFiles()` and that a non-derivable runtime
  activates `paths`-conditioned reviewers (fail-closed) rather than skipping them.

**Acceptance Criteria**:
- On a runtime whose `canDeriveChangedFiles()` returns `false`, `listChangedFiles` is NOT called by the gate.
- On a runtime whose `canDeriveChangedFiles()` returns `true` (or is absent), `listChangedFiles` IS called when `step.activation` is set, exactly as before.
- A `paths`-conditioned reviewer on a non-derivable runtime is activated (agent invoked), not skipped.
- `bun run typecheck` passes.

---

## T-03: Reframe the managed-runtime documentation (`listChangedFiles` / `canDeriveChangedFiles`)

**File**: `src/core/runtime/managed.ts`

- [x] Update the JSDoc on `listChangedFiles` (currently lines ~505-513). Remove the
  framing that calls the `[]` return a *"fail-safe: under-activate rather than evaluate
  against stale or fabricated data"* and that says path reviewers *"will be skipped"*.
  Replace it with: the managed runtime has no local git worktree, so it cannot derive
  changed files and returns `[]` as a structural limitation (NOT a signal that nothing
  changed); the activation gate consults `canDeriveChangedFiles()` and activates
  `paths`-conditioned reviewers (fail-closed) rather than skipping them when changed
  files cannot be derived. State that the `[]` return MUST NOT be interpreted as
  "no changes".
- [x] Update the JSDoc on `canDeriveChangedFiles()` (currently lines ~522-526) if it
  still implies the predicate is consumed only by scope-check; note that the reviewer
  activation gate also consumes it (fail-closed activation).
- [x] Do NOT change the behavior of either method: `listChangedFiles` still returns `[]`
  and `canDeriveChangedFiles()` still returns `false`. Documentation only.

**Acceptance Criteria**:
- The phrase framing under-activation as "fail-safe" no longer appears in `managed.ts`.
- The `listChangedFiles` / `canDeriveChangedFiles` JSDoc describes the fail-closed activation contract.
- `bun run typecheck` passes; no runtime behavior change in `managed.ts`.

---

## T-04: Update the `canDeriveChangedFiles` port documentation

**File**: `src/core/port/runtime-strategy.ts` (the `canDeriveChangedFiles?()` doc, currently lines ~382-400)

- [x] Remove the instruction that *"Reviewer activation consumers MUST NOT reference
  this predicate — they maintain fail-safe (under-activate) via listChangedFiles
  alone."* Replace it with: the predicate is consumed by both scope-check and the
  reviewer activation gate; both treat `false` as fail-closed (scope-check synthesizes
  an UNKNOWN finding; the activation gate activates `paths`-conditioned reviewers).
- [x] Keep the semantics of the return values unchanged (`true` derivable / `false`
  non-derivable / absent ⇒ treated as derivable). Keep the field optional and the
  `RealRuntimeStrategy` intersection type unchanged.

**Acceptance Criteria**:
- The "MUST NOT reference this predicate" instruction is gone.
- The doc states the activation gate consults the predicate (fail-closed).
- `bun run typecheck` passes; the port signature is unchanged.

---

## T-05: Unit tests for `evaluateActivation` derivability behavior

**File**: `src/core/reviewers/__tests__/activation.test.ts`

- [x] Add a `describe("evaluateActivation — changedFilesDerivable (fail-closed)")` block covering:
  - `paths` present + `changedFilesDerivable: false` + empty `changedFiles` → `activated: true`.
  - `paths` present + `changedFilesDerivable: false` + non-empty non-matching `changedFiles` → `activated: true` (the glob match is not even attempted).
  - `requestTypes` mismatch + `paths` present + `changedFilesDerivable: false` → `activated: false`, reason mentions `requestType` (requestTypes evaluated first).
  - `requestTypes` match + `paths` present + `changedFilesDerivable: false` → `activated: true`.
  - `paths` present + `changedFilesDerivable: true` + non-matching `changedFiles` → `activated: false` (regression: derivable-true still skips on no match).
  - `paths` present + `changedFilesDerivable` omitted + non-matching `changedFiles` → `activated: false` (default-derivable equals the `true` case).
  - no conditions (`{}`) + `changedFilesDerivable: false` → `activated: true` (unconditional reviewers unaffected).
  - `requestTypes`-only (no `paths`) + `changedFilesDerivable: false` → activation depends only on `requestType` (match → true, mismatch → false).

**Acceptance Criteria**:
- All new cases pass under `bun run test`.
- Tests import `evaluateActivation` and `ActivationFacts` from `../activation.js` (existing convention in the file).
- No I/O, no mocks — pure unit tests.

---

## T-06: Executor-level tests for the fail-closed activation gate

**File**: `tests/unit/step/executor-activation.test.ts`

- [x] Extend the `makeRuntimeStrategy` helper (or add a sibling helper) so a test can
  set `canDeriveChangedFiles()` — e.g. add a second parameter
  `canDeriveChangedFiles?: () => boolean` and include it on the returned object only
  when provided (so existing tests, which omit it, keep the "derivable (absent)"
  behavior unchanged).
- [x] Add a `describe("executor activation gate — non-derivable runtime (fail-closed)")` block:
  - **Managed/non-derivable + `paths` reviewer activates, does not skip**: strategy with
    `canDeriveChangedFiles: () => false` and a `listChangedFiles` spy; step with
    `activation: { paths: ["src/auth/**"] }`. Assert the agent runner IS called, the
    recorded step result is NOT a `skipped` verdict, and `listChangedFiles` was NOT
    called (short-circuit per T-02 / D3).
  - **skipReason distinction**: in the same managed/non-derivable case, assert the
    reviewer has no `skipped` step result carrying a "no changed files matched paths"
    `skipReason`.
- [x] Add to the existing "skip when conditions not met" / "proceed when conditions met"
  coverage a **local-runtime regression** pair using `canDeriveChangedFiles: () => true`:
  - `paths: ["src/auth/**"]` + `listChangedFiles → ["src/auth/login.ts"]` → agent called (activated).
  - `paths: ["src/auth/**"]` + `listChangedFiles → ["src/util/helper.ts"]` → skipped, `skipReason` contains `src/auth/**` (genuine condition mismatch).
- [x] Add a **no-paths-unaffected** case: a step with `activation: { requestTypes: ["bug-fix"] }`
  (no `paths`) on a `canDeriveChangedFiles: () => false` strategy, request type
  `bug-fix` → agent called; and an unconditional reviewer (no `activation`) on a
  non-derivable strategy → agent called (and `listChangedFiles` not called, per the
  existing no-activation no-op path).

**Acceptance Criteria**:
- Managed/non-derivable + `paths` reviewer: `runMock` is called once, `listChangedFiles` is not called, and no `skipped` step result is recorded for the reviewer.
- Local + `paths` match: `runMock` called once (activated).
- Local + `paths` no-match: step result verdict is `skipped` and `skipReason` contains the `paths` glob string.
- `requestTypes`-only reviewer and unconditional reviewer on a non-derivable runtime: `runMock` called once.
- All tests pass under `bun run test`.

---

## T-07: Verify `typecheck && test` green

- [x] Run `bun run typecheck` and confirm exit code 0.
- [x] Run `bun run test` and confirm exit code 0.
- [x] Confirm the existing pre-change tests in `tests/unit/step/executor-activation.test.ts`
  and `src/core/reviewers/__tests__/activation.test.ts` still pass unchanged (local-runtime
  and no-activation behavior is not regressed).

**Acceptance Criteria**:
- `bun run typecheck` exits 0.
- `bun run test` exits 0.
- All acceptance criteria from T-01 through T-06 are satisfied.
