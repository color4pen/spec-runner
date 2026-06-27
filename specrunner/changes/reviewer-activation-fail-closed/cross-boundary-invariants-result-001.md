# Cross-Boundary Invariants Review — reviewer-activation-fail-closed

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

---

## Scope

Changed files under review:

- `src/core/reviewers/activation.ts` — `ActivationFacts.changedFilesDerivable` field + fail-closed guard
- `src/core/step/executor.ts` — activation gate rewritten to consult `canDeriveChangedFiles()`
- `src/core/runtime/managed.ts` — documentation reframe only (no behavior change)
- `src/core/port/runtime-strategy.ts` — port documentation update only (no signature change)
- Tests: `src/core/reviewers/__tests__/activation.test.ts`, `tests/unit/step/executor-activation.test.ts`

---

## Invariant Examination

### 1. `computeInvalidations` call site — unchanged code, new exposure

**Location**: `src/core/pipeline/pipeline.ts:751-773`, `src/core/pipeline/reviewer-status.ts:195-222`

`computeInvalidations` calls `evaluateActivation({ paths: s.activationPaths }, { changedFiles: touchedFiles, requestType })` without passing `changedFilesDerivable`. Because the field defaults to "derivable" when absent (`undefined !== false`), the fail-closed guard does not fire here. This is the intended isolation from D2.

The **new exposure** is this: before this change, paths-conditioned reviewers on managed runtime were always `skipped`, so `computeInvalidations` never encountered an `approved` managed-runtime paths reviewer. After this change, those reviewers can run and reach `approved`. The unchanged `pipeline.ts` invalidation block then calls `listChangedFiles(s.approvedAtCommit, ...)`, which returns `[]` on managed, and `computeInvalidations` evaluates `{ paths }` against `[]` — no match, no invalidation. An approved paths reviewer is never re-queued after a fixer run on managed runtime.

This is a **pre-existing structural limitation** (managed has no git worktree; `listChangedFiles` always returns `[]`) that was previously invisible (the reviewer was always skipped, so approval was unreachable). The change makes the gap observable. The design document explicitly scopes this out: *"Changing `computeInvalidations` (reviewer-status.ts) reviewer-invalidation behavior on the managed runtime. Out of scope; preserved unchanged (see D2)."*

**Assessment**: acknowledged and scoped out. Not a blocker. The gap is structurally identical to the pre-existing `listChangedFiles` limitation and does not introduce a new mechanism failure.

---

### 2. Evaluation order invariant — `requestTypes` before `changedFilesDerivable` guard

**Location**: `src/core/reviewers/activation.ts:67-95`

The `requestTypes` block returns early on mismatch before the `changedFilesDerivable === false` guard is reached inside the `paths` block. Order:

1. No conditions → activate (early return)
2. `requestTypes` present → check; mismatch returns `{ activated: false }` immediately
3. `paths` present → check `changedFilesDerivable === false` first; if non-derivable, return `{ activated: true }` (fail-closed); otherwise run glob match

A `requestTypes` mismatch deterministically skips even when `changedFilesDerivable === false`. This is correct and tested (T-05 case 3, executor test "requestTypes mismatch + paths"). No invariant broken.

---

### 3. Default-derivable isolation for existing call sites

**Location**: `evaluateActivation` call in `reviewer-status.ts:205-208`

The call passes `{ changedFiles: touchedFiles, requestType }` — no `changedFilesDerivable`. The guard fires only on `=== false`; `undefined` is not `false`. The existing call site behavior is byte-for-byte unchanged. The type-level design (optional field) correctly enforces this at the call site. No invariant broken.

---

### 4. `runtimeStrategy` absent path

**Location**: `executor.ts:237-241`

```typescript
const changedFilesDerivable =
  deps.runtimeStrategy?.canDeriveChangedFiles?.() !== false;
const changedFiles =
  deps.runtimeStrategy && changedFilesDerivable
    ? await deps.runtimeStrategy.listChangedFiles(...)
    : [];
```

When `deps.runtimeStrategy` is `undefined`:
- `undefined?.canDeriveChangedFiles?.()` → `undefined`; `undefined !== false` → `true` (derivable)
- `undefined && true` → `undefined` (falsy) → `changedFiles = []`
- `evaluateActivation` receives `changedFilesDerivable: true`, `changedFiles: []` → same behavior as old code

No regression on the runtimeStrategy-absent path.

---

### 5. `assertRuntimeSupportsScope` — runtime-capability-gate

**Location**: `src/core/pipeline/runtime-capability-gate.ts:83`

Uses `canDeriveChangedFiles?.() === false` — same predicate, same optional-chaining semantics. This gate blocks managed runtime when `permissionScope` is declared. The new activation-gate change does not interact with this gate's logic or its enforcement. No invariant broken.

---

### 6. LocalRuntime — no behavioral change

**Location**: `src/core/runtime/local.ts:676-678`

`canDeriveChangedFiles()` returns `true`. In the executor: `changedFilesDerivable = true !== false = true`. Gate proceeds to call `listChangedFiles` exactly as before. Regression tests T-06 (local match → agent called, local no-match → skipped with paths glob in skipReason) confirm this.

---

### 7. Executor concurrency comment — minor documentation stale

**Location**: `executor.ts:88` (inside `commitMutex` comment block)

> `// NOTE: session execution, activation listChangedFiles, prepareStepArtifacts, and verdict derivation are all still concurrent`

After this change, `listChangedFiles` is NOT called in the activation path on non-derivable runtimes. The comment is slightly imprecise: on local runtime `listChangedFiles` is still called concurrently; on managed it is not called at all. The concurrency model (commit mutex) is unaffected. This is a minor stale comment, not a behavioral issue.

---

## Summary

| # | Location | Nature | Severity | Disposition |
|---|----------|---------|----------|-------------|
| F-1 | `pipeline.ts:761` / `reviewer-status.ts:205` | Pre-existing gap newly reachable: managed paths reviewers can now approve but are never invalidated after fixer runs (managed `listChangedFiles` always `[]`) | Low | Explicitly scoped out in D2; structural managed runtime limitation, not a new defect |
| F-2 | `executor.ts:88` | Commit-mutex comment mentions "activation listChangedFiles" as concurrent — stale on non-derivable runtimes | Trivial | Comment only; no behavioral impact |

No invariants enforced by unchanged code are broken by the new behavior. All cross-boundary consumers of `evaluateActivation` (`computeInvalidations`) and `canDeriveChangedFiles` (`scope-check`, `runtime-capability-gate`) remain on their existing code paths. The `changedFilesDerivable` optional-default-derivable design correctly confines the change to the executor activation gate.
