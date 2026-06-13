# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Findings

### [MEDIUM] `verdict:parsed` event emits original toolResult instead of scope-merged persistToolResult
- **File**: src/core/step/executor.ts:765
- **Status**: fixed — confirmed present
- **Evidence**: Line 765 emits `toolResult: persistToolResult` (not `agentResult?.toolResult ?? null`). Line 779 (`pushStepResult`) also uses `persistToolResult`. Both sites changed consistently in the diff (`-agentResult?.toolResult ?? null` / `+persistToolResult`). The `persistToolResult` variable is initialized to `agentResult?.toolResult` and updated to `effectiveToolResult` (scope-merged) when `extraScopeFindings.length > 0`. The invariant `verdict:parsed.toolResult === state.steps[step][-1].outcome.toolResult` is restored.

### [LOW] Redundant condition: (isJudgeStep || isConformanceStep) is equivalent to isJudgeStep
- **File**: src/core/step/executor.ts:659
- **Status**: not fixed — intentionally deferred
- **Evidence**: Line 659 still reads `(isJudgeStep || isConformanceStep)`. `isJudgeStep` (line 642) already includes `|| isConformanceStep`, making the OR redundant. However, review-feedback-001.md explicitly marked this finding Fix=no ("動作に影響なし") and the reviewer confirmed verdict=approved with no code-fixer step. No behavioral impact; no regression.

### [LOW] TC-023 (must): resumePoint.step assertion is indirect
- **File**: tests/unit/core/step/scope-escalation.test.ts:530
- **Status**: not fixed — intentionally deferred
- **Evidence**: The test at line 516–537 still manually injects `resumePoint: { step: "spec-review", ... }` into the `getOpenDecisionFindings` call rather than asserting `finalState.resumePoint?.step === "spec-review"`. review-feedback-001.md marked Fix=no ("将来のエンドツーエンド統合テストで assert する。本 iteration での必須修正ではない"). No behavioral regression; deferred to future Pipeline+executor integration test.

### [LOW] TC-020 (should): no test that composeReviewerDescriptor preserves permissionScope from base
- **File**: tests/unit/core/pipeline/compose-reviewers.test.ts:1
- **Status**: not fixed — intentionally deferred
- **Evidence**: `git diff main...HEAD` shows no changes to `compose-reviewers.test.ts`. `permissionScope` grep in that file returns zero matches. review-feedback-001.md marked Fix=no ("利用者 profile（fast pipeline 等）が別 request で入った際にテストを追加する"). No behavioral impact; no registry profile declares permissionScope in this iteration.

## Summary

The only finding with behavioral impact (MEDIUM) is confirmed fixed and present in the current code. All three LOW findings were explicitly deferred in review-feedback-001.md (Fix=no, verdict=approved, no code-fixer step ran). No regressions detected.
