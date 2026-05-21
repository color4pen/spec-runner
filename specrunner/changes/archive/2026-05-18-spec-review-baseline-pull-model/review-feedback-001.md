# Code Review: spec-review-baseline-pull-model

- **verdict**: approved

## Summary

All acceptance criteria from the request are satisfied. The injection model has been cleanly removed and replaced with the Read-tool-pull model. Build/typecheck/test all pass (verification-result.md: 194 test files, 2188 tests, 0 failures).

## Acceptance Criteria Check

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `{{BASELINE_SPECS}}` placeholder deleted from spec-review-system.ts | PASS — not found in src/ |
| 2 | `baselineSpecs?: Record<string, string>` deleted from SpecReviewPromptInput | PASS — field absent from interface |
| 3 | "skip this check entirely" conditional deleted | PASS — string absent from src/ |
| 4 | `## Baseline Spec Consistency Check` rewritten to 7-step Read-tool-pull procedure | PASS — steps 1-7 present in system prompt |
| 5 | DynamicContext.baselineSpecs? field deleted | PASS — field absent from interface |
| 6 | enrichContext() baselineSpecs populate logic deleted | PASS — method returns dynamicContext unchanged |
| 7 | buildMessage() baselineSpecs argument deleted | PASS — not present in buildSpecReviewInitialMessage() call |
| 8 | spec-review-system.ts L198-203 baselineSpecs expansion logic deleted | PASS — builder has no baselineSpecs logic |
| 9 | Tests pass | PASS — 2188 tests pass |
| 10 | Delta spec exists with ADDED + REMOVED combo | PASS — specs/spec-review-session/spec.md has both sections |

## Findings

### [LOW] Stale test description string in pipeline-integration.test.ts
- **file**: tests/pipeline-integration.test.ts:1209
- **category**: consistency
- **detail**: The `it()` description string reads `"baselineSpecs is undefined when specrunner/changes/test-slug/specs/ does not exist"`. This is a leftover from the injection model era. The test body itself is correctly updated (it verifies `enrichContext` returns `dynamicContext` unchanged and `result.status === "awaiting-merge"`), so the description no longer matches the assertion intent. Should read something like `"enrichContext returns dynamicContext unchanged when no delta specs dir"`.

### [LOW] Stale comment header in dynamic-context.test.ts
- **file**: tests/git/dynamic-context.test.ts:9-10
- **category**: consistency
- **detail**: The file-level JSDoc comment still lists `TC-001 (add-spec-review-baseline-check): DynamicContext has baselineSpecs field (optional)` and `TC-002 (add-spec-review-baseline-check): collectDynamicContext does not set baselineSpecs`. These were supposed to be removed per tasks.md Task 7, but only the test bodies were removed — the comment block at the top of the file was not updated. Tasks.md says "TC-002 (baselineSpecs not set) を削除", which implies the comment too. This is a documentation-only issue with no runtime impact.

### [INFO] Delta spec REMOVED header exact-match confirmed
- **file**: specrunner/changes/spec-review-baseline-pull-model/specs/spec-review-session/spec.md:5
- **detail**: The REMOVED header `### Requirement: spec-review の初期メッセージに関連 baseline spec が注入される` exactly matches line 121 of the baseline spec at specrunner/specs/spec-review-session/spec.md. TC-20 passes.

### [INFO] Baseline spec still contains the superseded requirement
- **file**: specrunner/specs/spec-review-session/spec.md:91-99
- **detail**: The baseline also contains `### Requirement: spec-review は baseline spec との整合性を検証する` (L91) which describes the injection model check behavior. The delta spec does not MODIFY this requirement. This is correct scope — the requirement text says "参照し" (refer to), which is model-agnostic, and the scenarios are LLM-behavioral rather than implementation-specific. No action needed.
