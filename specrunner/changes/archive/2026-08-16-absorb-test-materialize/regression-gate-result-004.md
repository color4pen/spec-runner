# Regression Gate Result — Iteration 004

## Summary

12 findings verified. 10 fixed, 2 still present.

## Verified: Fixed

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | LOW | T-02 doc scrub missing state/schema/types.ts and config/schema/types.ts | FIXED — both files scrubbed of "test-materialize"; tasks.md marks them [x] |
| 2 | LOW | T-10 TC-015a duplicate risk in tasks.md | FIXED — instruction now says "同テストファイル内に追加" (not "test-cases.md にも追記") |
| 3 | MEDIUM | specFixerObservationForward JSDoc has test-materialize (4 locations) | FIXED — no "test-materialize" in spec-observation.ts |
| 4 | LOW | testGenRequired JSDoc in type-config.ts:27 references test-materialize | FIXED — no "test-materialize" in type-config.ts |
| 5 | LOW | "Currently FAILS because" comments in 6 test files | FIXED — no such comments found in src/ |
| 6 | LOW | Stale comment in local.ts:1501 references test-materialize as materializer | FIXED — comment now reads "implementer must produce test files after reading test-cases.md" |
| 7 | MEDIUM | diffPathsBetweenCommits required in RealRuntimeStrategy (runtime-strategy.ts:868) | FIXED — no diffPathsBetweenCommits in runtime-strategy.ts |
| 8 | LOW | bite-evidence-e2e-gate.test.ts retains test-materialize naming | FIXED — no "test-materialize" in bite-evidence-e2e-gate.test.ts |
| 9 | LOW | diff-paths-between-commits.test.ts tests dead method | FIXED — file deleted |
| 10 | LOW | test-coverage.ts doc references "test-materialize output contract" and "after test-materialize" | FIXED — both phrases replaced with "implementer" equivalents |

## Verified: Still Present (Regressions)

### [MEDIUM] specFixerNeedsFixForward routes exempt types to TEST_CASE_GEN (Finding 11)

**File**: `src/core/pipeline/spec-observation.ts:102`

`specFixerNeedsFixForward` (lines 102–109) does not check `isTestGenExempt(state)`. For an exempt type (e.g. chore) whose spec-review returned "needs-fix" and spec-fixer then approved, the function returns `true`, routing to `TEST_CASE_GEN` (transition table line 270). This violates design D1: "exempt type の観測挙動(test-case-gen を通らない)は不変."

`isTestGenExempt` is not imported in `spec-observation.ts`. No test exists for the path chore + spec-review needs-fix + spec-fixer approved → SPEC_REVIEW (not TEST_CASE_GEN).

Fix: add `import { isTestGenExempt } from "./test-gen-exemption.js";` and change return to `return lastRun.outcome.verdict === "needs-fix" && !isTestGenExempt(state);`. Add a test in `test-gen-exemption.test.ts` (or `spec-observation-autofix.test.ts`): chore with `steps[SPEC_REVIEW] = [needs-fix run]` resolves SPEC_FIXER/approved to SPEC_REVIEW (not TEST_CASE_GEN).

### [LOW] evaluateTestCoverage JSDoc references non-existent implementer output contract (Finding 12)

**File**: `src/core/verification/test-coverage.ts:182`

Line 182 reads: `- implementer output contract (LocalRuntime.validateStepOutputs "test-coverage" branch)`. Design D2 explicitly decided against adding a test-coverage output contract to implementer. `implementer.ts outputContracts()` returns only `tasks-complete`. The second bullet is factually wrong and should be removed. The line at 186 ("This is the correct state after implementer materializes tests.") is accurate and should remain.

Fix: remove the second bullet from the JSDoc (`- implementer output contract (LocalRuntime.validateStepOutputs "test-coverage" branch)`).

## Evidence

- Files read: spec-observation.ts, type-config.ts, runtime-strategy.ts, local.ts, test-coverage.ts, implementer.ts, test-gen-exemption.ts, bite-evidence-e2e-gate.test.ts, spec-observation-autofix.test.ts, test-gen-exemption.test.ts, tasks.md, test-cases.md, state/schema/types.ts, config/schema/types.ts, config/type-config.ts
- Grep searches: "test-materialize" in all key files, "Currently FAILS because" in src/, "diffPathsBetweenCommits" in src/, "isTestGenExempt" in spec-observation.ts, "specFixerNeedsFixForward" in types.ts
