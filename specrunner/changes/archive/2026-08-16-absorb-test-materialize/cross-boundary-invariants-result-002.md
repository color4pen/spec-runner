# Cross-Boundary Invariants Review — Iteration 2

**Change**: absorb-test-materialize  
**Reviewer role**: cross-boundary-invariants  
**Iteration**: 2  
**Date**: 2026-08-16

## Prior findings resolution

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | medium | `diffPathsBetweenCommits` still required in `RealRuntimeStrategy` | ✅ Fixed — removed; `listChangedFilesBetweenCommits` now required |
| 2 | low | Stale `test-materialize` naming in `bite-evidence-e2e-gate.test.ts` | ✅ Fixed — updated to use `"implementer"` commit labels |
| 3 | low | `diff-paths-between-commits.test.ts` testing dead method | ✅ Fixed — file deleted |
| 4 | low | Stale `test-materialize` reference in `test-coverage.ts` doc comment | ⚠️ Partially fixed — old reference removed but a new stale bullet introduced (see Finding 2 below) |

## New findings

### Finding 1 — [medium / fixable]: Exempt type (chore) routes to TEST_CASE_GEN in spec-fixer needs-fix path

**Files**: `src/core/pipeline/spec-observation.ts` line 102–108, `src/core/pipeline/types.ts` line 270

**Invariant violated**: design D1 states _"exempt type の観測挙動(test-case-gen を通らない・bite-evidence を通らない)は不変"_.

**Path**:

```
SPEC_REVIEW → needs-fix → SPEC_FIXER   (unconditional row, line 263)
SPEC_FIXER  → approved  → ???
```

With `specFixerForwardsToImplementer` deleted, the transition table evaluates:

1. `specFixerObservationForward` (line 268): requires latest spec-review verdict = `"approved"`. For the needs-fix path it is `"needs-fix"` → **false**.
2. `specFixerNeedsFixForward` (line 270): requires latest spec-review verdict = `"needs-fix"`. Condition holds regardless of type. For chore → **true** → routes to **TEST_CASE_GEN**. ← bug.

Pre-change, `specFixerForwardsToImplementer` fired before `specFixerNeedsFixForward`:

```typescript
// pre-change order (first-match-wins):
{ step: SPEC_FIXER, on: "approved", to: IMPLEMENTER,    when: specFixerForwardsToImplementer }, // isTestGenExempt && !conformance
{ step: SPEC_FIXER, on: "approved", to: TEST_MATERIALIZE, when: specFixerObservationForward },
{ step: SPEC_FIXER, on: "approved", to: TEST_MATERIALIZE, when: specFixerNeedsFixForward },
```

For exempt + needs-fix: `specFixerForwardsToImplementer` fired first → IMPLEMENTER.  
Post-change: no such guard → `specFixerNeedsFixForward` fires → TEST_CASE_GEN.

**Correct behavior for exempt + needs-fix path**: route to SPEC_REVIEW (unconditional fallback at line 272) so the corrected spec is re-reviewed, then SPEC_REVIEW approved → IMPLEMENTER. Exempt type never touches test-case-gen.

**Minimal fix**: add `&& !isTestGenExempt(state)` to `specFixerNeedsFixForward` in `spec-observation.ts`:

```typescript
export function specFixerNeedsFixForward(state: JobState): boolean {
  if (getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER) !== null) return false;
  if (isTestGenExempt(state)) return false;   // ← add: exempt types bypass test-case-gen
  const runs = state.steps?.[STEP_NAMES.SPEC_REVIEW];
  if (!runs || runs.length === 0) return false;
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return false;
  return lastRun.outcome.verdict === "needs-fix";
}
```

And add a test: `chore + spec-review needs-fix + spec-fixer approved → SPEC_REVIEW` (not TEST_CASE_GEN).

**Test gap**: TC-004 only covers the observation path (spec-review **approved** → spec-fixer → implementer). No test covers chore + spec-review **needs-fix** → spec-fixer → approved.

---

### Finding 2 — [low / fixable]: Stale doc comment in `evaluateTestCoverage`

**File**: `src/core/verification/test-coverage.ts` line 182

The `@remarks` block on `evaluateTestCoverage` lists two callers:

```
* - verification step (runTestCoveragePhase wrapper)
* - implementer output contract (LocalRuntime.validateStepOutputs "test-coverage" branch)
```

The second bullet is stale. Design D2 explicitly decided against adding a `test-coverage` output contract to implementer:

> implementer に `test-coverage` output contract を足すと (i) verification と二重化し (ii) test-cases.md 不在の fast/exempt job で contract 違反になる … 却下。

`implementer.ts` `outputContracts()` returns only `tasks-complete`. The `test-coverage` branch in `LocalRuntime.validateStepOutputs` is still called by the **verification** step, not implementer. The second bullet should be removed.

---

## Verified-correct behaviors (not findings)

- `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` correctly uses `synthesizedCommits[0]^` as base via `resolveEvidenceBaseRev`. `--diff-filter=d` correctly excludes deleted-at-head files.
- `testDerivation = "frozen"` criterion (test-cases.md hash match between testCaseGenOid and finalHeadOid) is correctly implemented and independent of materializedTestFiles.
- `LEGACY_STEP_ALIASES["test-materialize"] = IMPLEMENTER` correctly handles resume from old state. Priority-4 hard-crash path intentionally omits aliases (same as build-fixer).
- `RealRuntimeStrategy` now correctly requires `listChangedFilesBetweenCommits` and no longer requires `diffPathsBetweenCommits`.
- TC-004 (observation path) and TC-012 (design/implementer bypass) are green and correctly specify the exempt-type invariant in those two paths.
