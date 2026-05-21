# Code Review Feedback: spec-review-lightweight-mode (iteration 001)

- **verdict**: approved

## Summary

Implementation is clean, minimal, and faithful to the design. The 4 source files changed (spec-review-system.ts, types.ts, spec-review.ts, agent-runner.ts) are precise edits with no scope creep. The `getMaxTurns` mechanism correctly slots into priority 3 of the resolution chain without disturbing config overrides (priority 1-2). Tests cover all required scenarios. Typecheck and 1215 tests pass.

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 9 | Logic is straightforward and correct. `getMaxTurns?.() ?? step.maxTurns` correctly falls back. All 5 type mappings verified. |
| security | 8 | No security surface change. Prompt construction and turn-limit only. |
| architecture | 8 | `getMaxTurns` is additive, backward-compatible, and correctly scoped to AgentStep. Optional method pattern is idiomatic. Resolution chain integrity preserved. |
| performance | 8 | No performance concern. One additional function call per step execution. |
| maintainability | 8 | JSDoc on `getMaxTurns` is clear. Lightweight instruction text is well-structured with Verify/Simplify/Skip taxonomy. |
| testing | 7 | All task-defined scenarios (5.1-5.5) are implemented. Missing: ClaudeCodeRunner integration test verifying `getMaxTurns` feeds into `getStepExecutionConfig` (see finding #1). |

**Total**: 9×0.30 + 8×0.25 + 8×0.15 + 8×0.10 + 8×0.10 + 7×0.10 = 2.70 + 2.00 + 1.20 + 0.80 + 0.80 + 0.70 = **8.20** (pass threshold: 7.0)

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/step/spec-review-lightweight.test.ts | No integration test for ClaudeCodeRunner evaluating `step.getMaxTurns?.(state)` and passing the result to `getStepExecutionConfig`. The unit tests verify `SpecReviewStep.getMaxTurns()` in isolation and `buildMessage()` output, but the wiring in agent-runner.ts:113 (`dynamicMaxTurns`) is untested. If someone refactors that line, no test catches the regression. | Add a test in the agent-runner test suite that mocks a step with `getMaxTurns` returning 10, verifies `getStepExecutionConfig` receives `maxTurns: 10` instead of `step.maxTurns: 15`. |
| 2 | LOW | maintainability | src/adapter/claude-code/agent-runner.ts:85-98 | `stepCtx.request.type` is hardcoded to `"feature"` regardless of actual request type. This means `step.buildMessage()` works correctly (it uses `state.request.type`), but `stepCtx` carries a stale type. Not introduced by this PR but becomes more relevant now that `getMaxTurns` also reads from `state` — the inconsistency between `stepCtx.request.type` and `state.request.type` could confuse future readers. | Out of scope for this PR. Note for future: align `stepCtx.request.type` with `state.request.type`. |
| 3 | LOW | consistency | openspec/changes/spec-review-lightweight-mode/design.md:80 | `getMaxTurns(state: JobState)` signature drops `deps` parameter from request.md's `getMaxTurns(state, deps)`. This is a correct simplification (only `state.request.type` is needed), but the rationale is implicit. | Addressed in spec-review-result-001.md finding #1. No action needed — design document is the authority. |
