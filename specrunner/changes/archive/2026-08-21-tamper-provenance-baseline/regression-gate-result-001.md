# Regression Gate Result — tamper-provenance-baseline / Iteration 1

## Summary

Verified 15 findings from the review ledger against current branch code.

- **12 findings fixed** — no regression.
- **3 findings still present** — all LOW severity, all in distinct code locations.

---

## Fixed Findings (no regression)

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | HIGH | `authorizedCanonWriterSteps` circular import via `tamper.ts` | FIXED — placed in `src/core/resume/canon-provenance.ts`, outside registry→step→tamper chain |
| 2 | LOW | TC-017 category `unit` → should be `integration` | FIXED — test-cases.md TC-017 is `Category: integration` |
| 3 | MEDIUM | T-03: `PipelineDeps.authorizedCanonWriters` + `buildPipelineForJob` injection missing | FIXED — `types.ts` has the field; `run.ts` injects in `buildPipelineForJob` |
| 4 | HIGH | Non-conforming commit subject → `inconclusive` instead of `mismatch` (step.ts:81) | FIXED — `token ?? "__non-conforming-subject__"` sentinel routes to branch 5 (mismatch) |
| 5 | MEDIUM | `BiteEvidenceStep.run` integration wiring test missing (gate.test.ts) | FIXED — TC-033 + TC-034 wiring tests added via `BiteEvidenceStep.run` with fake runtime |
| 6 | LOW | `worktreeDirty` path match is `endsWith` (false-positive risk) | FIXED — exact match `p === testCasesMdPath` at step.ts:65 |
| 7 | HIGH | Non-conforming subject → `inconclusive` (duplicate of finding 4, step.ts:82) | FIXED — same sentinel fix |
| 8 | MEDIUM | `BiteEvidenceStep.run` wiring test missing (duplicate of finding 5) | FIXED — same TC-033/TC-034 |
| 9 | LOW | `worktreeDirty` suffix match (duplicate of finding 6) | FIXED — same exact-match fix |
| 10 | LOW | `runPipeline` does not inject `authorizedCanonWriters` | FIXED — run.ts lines 149–156 mirror the `buildPipelineForJob` injection block |
| 11 | MEDIUM | TC-028 tests `checkTamperStatus` directly, not `BiteEvidenceStep.run` with throwing runtime | FIXED — TC-028 now has a `wiring` sub-test that injects throwing `lastCommitTouchingPath` and calls `BiteEvidenceStep.run` |
| 12 | LOW | TC-026 tests `checkTamperStatus` directly, not `BiteEvidenceStep.run` with null runtimeStrategy | FIXED — TC-026 now has a `wiring` sub-test that passes `runtimeStrategy: null` and calls `BiteEvidenceStep.run` |

---

## Regressions (findings still present)

### [LOW] Redundant type cast for `authorizedCanonWriters` in `step.ts`

- **File**: `src/core/step/bite-evidence/step.ts:53`
- **Resolution**: fixable
- **Evidence**: `CliStepDeps` (declared in `src/core/port/step-types.ts:77`) already declares `authorizedCanonWriters?: ReadonlySet<string>`. The `deps` parameter is typed `CliStepDeps`. However, step.ts line 53 still reads:
  ```ts
  const authorizedWriters = (deps as { authorizedCanonWriters?: ReadonlySet<string> }).authorizedCanonWriters;
  ```
  The cast `(deps as { ... })` is redundant — `deps.authorizedCanonWriters` would be fully type-safe and would surface compile errors if the field were removed from `CliStepDeps`. The cast bypasses that static check. No runtime behavior difference.

---

### [LOW] `PipelineDeps.authorizedCanonWriters` JSDoc omits `runPipeline` injection

- **File**: `src/core/types.ts:105`
- **Resolution**: fixable
- **Evidence**: The JSDoc comment reads:
  ```
  * Pre-computed set of step names and operator tokens authorized to write the canon
  * test-cases.md path for this job. Injected by `buildPipelineForJob` before the
  * pipeline runs …
  ```
  Since the operator adjudication note was applied, `runPipeline` also injects this value (run.ts lines 149–156). The JSDoc still says only "`buildPipelineForJob`". No runtime impact.

---

### [LOW] `__non-conforming-subject__` sentinel is an inline magic string, not a named constant

- **File**: `src/core/step/bite-evidence/step.ts:89`
- **Resolution**: fixable
- **Evidence**: The sentinel string `"__non-conforming-subject__"` is embedded inline:
  ```ts
  lastCanonCommitToken = token ?? "__non-conforming-subject__";
  ```
  It is currently used only in this one location and cannot be accidentally matched by any real step name (step names like `"spec-fixer"` never start with `__`). Extracting to a named constant (e.g. `const NON_CONFORMING_SUBJECT_SENTINEL = "__non-conforming-subject__"`) would eliminate typo risk if a second reference is added in the future.
