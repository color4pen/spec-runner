# Regression Gate Result — Iteration 002

**Slug**: fixer-unpushable-path-coverage
**Date**: 2026-08-28

---

## Verification Summary

Checked all 7 ledger findings against the current branch (`git diff main...HEAD`).

| Finding | Severity | Status |
|---------|----------|--------|
| [1] T-04 minimum test count mismatch (14 vs 16) | MEDIUM | **FIXED** |
| [2] spec-fixer conformance branch TCs absent | LOW | **FIXED** |
| [3] TC-015 not implemented | MEDIUM | **FIXED** |
| [4] TC-017 coordinator fallback path not covered | LOW | **STILL PRESENT** |
| [5] TC-017 coordinator fallback sub-path notice test absent | LOW | **STILL PRESENT** |
| [6] Self-commits block follow-up repair (executor gate ordering) | HIGH | **FIXED** |
| [7] outputContracts removed from code-fixer (Layer 1 repair path gone) | HIGH | **FIXED** |

---

## Finding-by-Finding Evidence

### [1] T-04 minimum test count mismatch — FIXED

`specrunner/changes/fixer-unpushable-path-coverage/tasks.md` now reads:

> At minimum **18** tests covering: **4 helper tests + 6 code-fixer tests + 8 spec-fixer tests** (totals above)

The checkbox count in T-04 also totals 18 (4 + 6 + 8). No mismatch remains.

---

### [2] spec-fixer conformance branch TCs absent — FIXED

`test-cases.md` now includes TC-022 (spec-fixer conformance initial) and TC-023 (spec-fixer conformance continuation) — both `priority: must`. Both are implemented in `src/core/step/__tests__/fixer-push-capability.test.ts` (lines 730–758):

- `TC-022: conformance initial entry includes 'Push Capability Notice' when pushCapability set`
- `TC-023: conformance continuation includes 'Push Capability Notice' when pushCapability set`

---

### [3] TC-015 not implemented — FIXED

`fixer-push-capability.test.ts` now contains a multi-part TC-015 integration suite (lines 563–658):

1. `(1)` CodeFixerStep.outputContracts declares contract with `policy: "follow-up"`
2. `(2)` Layer 1: violation generates follow-up prompt via `buildOutputFollowUpPrompt`
3. `(3)` One-follow-up invariant: attempt ≥ 2 filters out unpushable-path violations → no second follow-up
4. `(4)` Layer 2 wiring: null pushCapability returns empty contracts (symmetric null guard)

---

### [4] TC-017 coordinator loop fallback path (no findings) not covered — STILL PRESENT

The TC-017 test uses `makeCodeFixerCoordinatorState()`, which sets up the `security` reviewer with a non-empty `findings` array. This routes through the **aggregated-findings** sub-path (code-fixer.ts L189–206).

The **fallback** sub-path (L209–232: `isCoordinatorLoopActive=true`, `aggregatedFindings.length===0`, `needsFixMembers.length>0`) correctly appends `capabilityNotice` in the implementation (visible at L232), but no test exercises this path. A fixture with an empty `aggregatedFindings` result (e.g., a coordinator state where all reviewer findings have been filtered out by `canonScope`) is required to cover this branch.

---

### [5] TC-017 coordinator loop fallback sub-path capability notice test absent — STILL PRESENT

Same root cause as [4]. The fallback code path at code-fixer.ts L232 (`+ capabilityNotice`) is not covered by any test assertion. TC-017's `should` priority makes this non-blocking, but the gap remains.

---

### [6] Self-commits block fixer follow-up (executor gate ordering) — FIXED

`executor.ts` now excludes `unpushable-path` contracts from the output-contract gate:

```ts
const allContracts = buildAllOutputContracts(step, state, deps)
  .filter((c) => c.kind !== "unpushable-path");
```

The branch that routed persistent unpushable-path violations directly to `awaiting-resume` from the gate was removed. Layer 2 (`commitAndPush → collectPublishablePaths → UNPUSHABLE_PATH_BLOCKED`) is now the sole halt point, and it runs **after** the `git reset --mixed` normalization. A rationale comment was added explaining the pre-reset false-positive risk.

---

### [7] code-fixer Layer 1 repair path removed — FIXED

`CodeFixerStep` now declares `outputContracts`:

```ts
outputContracts(_state: JobState, deps: StepDeps): OutputContract[] {
  return buildUnpushablePathContracts(deps);
},
```

This is present in `src/core/step/code-fixer.ts` at the position immediately before `reads()`. Layer 1 follow-up is correctly wired through the adapter's `OutputVerificationPolicy`, which reads `step.outputContracts` independently of the executor gate.

---

## Files Checked

- `specrunner/changes/fixer-unpushable-path-coverage/tasks.md` — T-04 acceptance criteria
- `specrunner/changes/fixer-unpushable-path-coverage/test-cases.md` — TC-022, TC-023 presence
- `src/core/step/__tests__/fixer-push-capability.test.ts` — TC-015, TC-017, TC-022, TC-023 implementations
- `src/core/step/code-fixer.ts` — outputContracts method, capabilityNotice injection, coordinator fallback path
- `src/core/step/executor.ts` — unpushable-path filter, gate branch removal
- `src/core/step/fixer-helpers.ts` — buildUnpushablePathContracts helper
- `src/core/step/spec-fixer.ts` — outputContracts method, capabilityNotice injection
