# Regression Gate Result — Iteration 002

**Change**: tamper-provenance-baseline
**Iteration**: 2
**Date**: 2026-08-21

## Summary

All 15 findings from the ledger have been verified against the current code. No regressions detected.

## Finding Verification

### [HIGH] circular import — authorizedCanonWriterSteps placement in tasks.md
- **File**: specrunner/changes/tamper-provenance-baseline/tasks.md
- **Status**: FIXED
- **Evidence**: `tasks.md` T-02 now explicitly states placement is `src/core/resume/canon-provenance.ts` (not `tamper.ts`). Lines 80–85 read: "配置は `tamper.ts` ではなく `src/core/resume/canon-provenance.ts` とする". The implementation exists in `canon-provenance.ts` which is outside the registry→step→tamper import chain. The circular import constraint is also documented in the preamble (lines 18–23) and in `canon-provenance.ts` itself.

### [LOW] TC-017 Category should be integration
- **File**: specrunner/changes/tamper-provenance-baseline/test-cases.md:277
- **Status**: FIXED
- **Evidence**: `test-cases.md` line 244 shows `**Category**: integration`. The separate test file `src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` imports `STANDARD_DESCRIPTOR` from `registry.ts` (real steps), confirming integration-level testing.

### [MEDIUM] T-03 injection wiring missing from implementation file list
- **File**: specrunner/changes/tamper-provenance-baseline/tasks.md:96
- **Status**: FIXED
- **Evidence**: tasks.md T-03 now explicitly lists `src/core/types.ts` (for `PipelineDeps.authorizedCanonWriters` field) and `src/core/pipeline/run.ts` (for `buildPipelineForJob` injection). Both are implemented: `types.ts:115` declares the field with JSDoc, `run.ts:99–106` injects in `buildPipelineForJob`, `run.ts:149–156` injects in `runPipeline`, and `step-types.ts:77` declares the field on `CliStepDeps`.

### [HIGH] Non-conforming commit subject → inconclusive instead of mismatch (line 81)
- **File**: src/core/step/bite-evidence/step.ts:81
- **Status**: FIXED
- **Evidence**: `step.ts:106` uses `lastCanonCommitToken = token ?? NON_CONFORMING_SUBJECT_SENTINEL;` where `NON_CONFORMING_SUBJECT_SENTINEL = "__non-conforming-subject__"` (defined as named constant at line 49). When `parseCommitToken` returns null (non-conforming subject), the sentinel routes `checkTamperStatus` to branch 5 (mismatch / fail-closed), not branch 3 (inconclusive). Comments at lines 100–107 describe the rationale accurately.

### [MEDIUM] BiteEvidenceStep.run wiring integration tests missing
- **File**: src/core/step/bite-evidence/__tests__/gate.test.ts
- **Status**: FIXED
- **Evidence**: TC-033 (line 1245) and TC-034 (line 1338) call `BiteEvidenceStep.run` directly with fake runtime strategies, exercising the full wiring chain: `runtimeStrategy.lastCommitTouchingPath → parseCommitToken → checkTamperStatus → tamperStatus → runBiteEvidenceGate`. TC-033 verifies spec-fixer attribution → no tamper halt; TC-034 verifies non-conforming subject → mismatch → failed.

### [LOW] worktreeDirty path match is suffix match
- **File**: src/core/step/bite-evidence/step.ts:64
- **Status**: FIXED
- **Evidence**: `step.ts:82` uses `worktreeDirty = wtResult.paths.some((p) => p === testCasesMdPath);` — exact path equality, not `endsWith`. The comment at line 81 explains: "Suffix-match would cause false-positives for other slugs' test-cases.md files."

### [HIGH] Non-conforming commit subject → inconclusive instead of mismatch (line 82)
- **File**: src/core/step/bite-evidence/step.ts:82
- **Status**: FIXED
- **Evidence**: Same fix as the previous HIGH finding — sentinel at `step.ts:106` ensures mismatch.

### [MEDIUM] BiteEvidenceStep.run wiring integration tests missing (second occurrence)
- **File**: src/core/step/bite-evidence/__tests__/gate.test.ts
- **Status**: FIXED
- **Evidence**: Same as above — TC-033 and TC-034 provide this coverage.

### [LOW] worktreeDirty path match suffix match (second occurrence)
- **File**: src/core/step/bite-evidence/step.ts:64
- **Status**: FIXED
- **Evidence**: Same as above — exact match at `step.ts:82`.

### [LOW] runPipeline does not inject authorizedCanonWriters
- **File**: src/core/pipeline/run.ts:139
- **Status**: FIXED
- **Evidence**: `run.ts:149–156` contains the injection block in `runPipeline`: computes `canonPath`, calls `authorizedCanonWriterSteps`, and assigns to `deps.authorizedCanonWriters` when `writers.size > 0`. The comment (line 150) explicitly references the Human resume note instruction.

### [MEDIUM] TC-028 tests checkTamperStatus directly instead of simulating thrown exception
- **File**: src/core/step/bite-evidence/__tests__/gate.test.ts:873
- **Status**: FIXED
- **Evidence**: "TC-028 wiring" sub-test at line 942 creates a `fakeRuntime` where `lastCommitTouchingPath` throws `new Error("unexpected internal error from lastCommitTouchingPath")`. It calls `BiteEvidenceStep.run(state, deps)` and verifies the result file does not contain "## Verdict: failed". It also asserts `fakeRuntime.lastCommitTouchingPath` was actually called, confirming the catch block was exercised.

### [LOW] TC-026 tests checkTamperStatus directly instead of BiteEvidenceStep.run with null runtimeStrategy
- **File**: src/core/step/bite-evidence/__tests__/gate.test.ts:828
- **Status**: FIXED
- **Evidence**: "TC-026 wiring" sub-test at line 851 creates deps with `runtimeStrategy: null` and calls `BiteEvidenceStep.run(state, deps)`. The test verifies the result file does not contain "## Verdict: failed", exercising the null-runtimeStrategy path in step.ts (evidenceAvailable forced to false → inconclusive → no tamper halt).

### [LOW] CliStepDeps.authorizedCanonWriters redundant cast
- **File**: src/core/step/bite-evidence/step.ts:53
- **Status**: FIXED
- **Evidence**: `step.ts:70` reads `const authorizedWriters = deps.authorizedCanonWriters;` — direct field access, no `(deps as { authorizedCanonWriters?: ... })` cast. TypeScript type-checks this cleanly because `CliStepDeps.authorizedCanonWriters` is declared in `step-types.ts:77`.

### [LOW] PipelineDeps.authorizedCanonWriters JSDoc missing runPipeline
- **File**: src/core/types.ts:105
- **Status**: FIXED
- **Evidence**: `types.ts:105` JSDoc reads: "Injected by `buildPipelineForJob` and `runPipeline` before the pipeline runs so that BiteEvidenceStep can use it without importing registry.ts..." Both injection sites are mentioned.

### [LOW] __non-conforming-subject__ sentinel not a named constant
- **File**: src/core/step/bite-evidence/step.ts:89
- **Status**: FIXED
- **Evidence**: `step.ts:49` defines `const NON_CONFORMING_SUBJECT_SENTINEL = "__non-conforming-subject__";` as a module-level named constant with a block comment (lines 38–48) explaining its purpose and why it must not match any authorized writer token.

## Conclusion

All 15 ledger findings are resolved in the current code. No regressions found.
