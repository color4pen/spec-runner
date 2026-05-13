# Code Review Feedback: save-session-id

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-13
- **reviewer**: code-review

## Summary

The implementation is minimal, correct, and exactly scoped to the spec. All four tasks (T1–T4) are implemented as specified. `extractedSessionId` is declared in the right scope, assigned only within the already-guarded success block, and returned in the success path. Type compatibility is fully satisfied by the existing `sessionId?: string` field on `AgentRunResult`. Downstream propagation through `StepExecutor.finalizeStep()` requires no changes and was already wired. No regressions detected — 143 test files / 1666 tests pass.

The one area for attention is Scenario Coverage: must test cases TC-001, TC-002, and TC-006 (session_id propagation through `AgentRunResult.sessionId`) have no automated assertions despite existing test fixtures already providing `session_id: "test-session"` in mock SDK results. The design explicitly excluded new test additions ("テスト追加（プロジェクトにユニットテストなし）"), making this a structural gap rather than an implementation mistake. Given the simplicity of the change and full typecheck/test-suite pass, this does not block approval.

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/adapter/claude-code/agent-runner.test.ts | TC-001, TC-002, TC-006 (must scenarios) have no automated assertions. Existing mock queryFn already yields `session_id: "test-session"` but no test asserts `result.sessionId === "test-session"`. The fix is a single line addition per TC, not a new test file. | In existing success-path tests (e.g. the TC-022/TC-023 test that calls `runner.run()` and checks `completionReason`), add `expect(result.sessionId).toBe("test-session")`. For TC-002, assert `lastResult.session?.id` in the integration test at agent-runner-executor-integration.test.ts line 211. |
| 2 | LOW | correctness | src/adapter/claude-code/agent-runner.ts:199 | `SDKResultSuccess.session_id` is typed as required `string` (not `string \| undefined`), so TC-003 ("session_id absent") is unreachable at runtime through normal SDK usage. The test case documents a scenario the type system rules out. | No code change needed. Optionally annotate TC-003 in test-cases.md with a note that this guards against future SDK type relaxation or cast bypass. |
| 3 | LOW | maintainability | specrunner/changes/save-session-id/design.md:53 | "変更ファイル: agent-runner.ts のみ（1 ファイル）" is inaccurate — `src/core/port/agent-runner.ts` was also changed (T4). Low impact since spec-review already flagged this as Finding #1. | Already noted in spec-review-result-001.md. No additional action required. |

## Scores

| Category | Score | Notes |
|----------|-------|-------|
| correctness | 9 | Logic is sound. Extraction is properly guarded. Edge cases (error path, timeout, null lastResult) all handled correctly. |
| security | 10 | session_id is SDK-generated local identifier, not external input. Stored in existing job state JSON only. No surface added. |
| architecture | 9 | Single-file change at the correct layer. Does not bleed concerns across boundaries. Follows established `extractedModelUsage` pattern exactly. |
| performance | 10 | One additional string assignment in the success path. Negligible. |
| maintainability | 8 | JSDoc updated (T4). Code follows existing pattern (`extractedModelUsage` → `extractedSessionId`). Minor loss: TC-003 test case describes an unreachable scenario without explanation. |
| testing | 5 | typecheck passes (TC-007 satisfied), test suite passes (TC-008 satisfied). Must TCs TC-001, TC-002, TC-006 have no automated assertions. Fixtures are in place; assertions are not. |

**Total**: (9×0.30) + (10×0.25) + (9×0.15) + (10×0.10) + (8×0.10) + (5×0.10) = 2.70 + 2.50 + 1.35 + 1.00 + 0.80 + 0.50 = **8.85**

Pass threshold: 7.0 — PASS

## Scenario Coverage (test-cases.md)

| TC | Priority | Covered |
|----|----------|---------|
| TC-001: session_id propagates to AgentRunResult.sessionId | must | No — fixture present, assertion missing |
| TC-002: sessionId recorded in StepRun | must | No — integration test checks verdict/history but not sessionId |
| TC-003: session_id absent → undefined | must | N/A (type rules out absent field; no regression risk) |
| TC-004: error path → sessionId undefined | must | Implicitly covered by existing error-path tests |
| TC-005: timeout path → sessionId undefined | must | Implicitly covered by existing timeout tests |
| TC-006: session_id + modelUsage coexist | must | No — assertion missing |
| TC-007: typecheck passes | must | Yes — verification-result.md confirms |
| TC-008: existing tests pass | must | Yes — 1666 tests pass |
| TC-009: JSDoc updated | should | Yes — T4 implemented |
| TC-010: null lastResult → no error | should | Implicitly covered; lastResult guard unchanged |
