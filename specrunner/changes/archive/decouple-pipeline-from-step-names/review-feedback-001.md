# Review Feedback: decouple-pipeline-from-step-names — Iteration 1

- **date**: 2026-05-13
- **reviewer**: code-reviewer
- **verdict**: approved

## Summary

All 5 step-name dependency sites have been correctly eliminated. The implementation is clean, type-safe, and all 1726 tests pass with zero typecheck errors. One stale JSDoc comment in `pipeline.ts` and a minor gap in explicit unit test coverage for TC-14/15/16 (isSpecPhase) and TC-18/19/20 (useSseStrategy) are the only notes — neither blocks merge.

## Findings

### [nit] Stale "Special case: design" comment in `getStepOutcome` JSDoc

**File**: `src/core/pipeline/pipeline.ts:329`
**Requirement**: T4 — Remove dead branch from `pipeline.ts:getStepOutcome()`
**Problem**: The JSDoc comment on line 329 reads `"Special case: 'design' uses the design SSE path and gets 'success' via completionVerdict"`. After the dead-code removal, there is no longer a special case for design — the method simply reads `step.completionVerdict` uniformly for all steps. The comment now misrepresents the code.
**Suggestion**: Replace with a neutral note, e.g. `- For steps with no verdict and completionVerdict set: returns completionVerdict (e.g. "success" for DesignStep).` Remove the "Special case: design" sentence entirely.

---

### [nit] TC-14/15/16 (isSpecPhase) and TC-18/19/20 (useSseStrategy) lack dedicated unit tests

**File**: `tests/unit/core/resume/resolve-step.test.ts`, `tests/unit/adapter/managed-agent/agent-runner.test.ts`
**Requirement**: TC-14 through TC-16 (isSpecPhase phase resolution), TC-18 through TC-20 (useSseStrategy private method existence)
**Problem**: The `resolve-step.test.ts` file tests `resolveResumeStep()` end-to-end and implicitly exercises `isSpecPhase()`. There are no tests that directly assert `isSpecPhase("design") === true` or `isSpecPhase("implementer") === false` (TC-14/TC-15/TC-16), nor tests for unknown step names defaulting to `false` (TC-16). Similarly, no test verifies that the `run()` method body delegates to `useSseStrategy()` rather than comparing `step.agent.role` directly (TC-20 static analysis criterion). The existing tests pass, and behavioral coverage is complete, but the explicit assertions in test-cases.md for these cases are not implemented.
**Suggestion**: Add a small describe block in `resolve-step.test.ts` for `isSpecPhase` (exported or tested indirectly via the STEP_PHASE_MAP) with assertions for each step name. Add a static-analysis style test in the agent-runner test file for `useSseStrategy` method existence and absence of direct `=== STEP_NAMES.DESIGN` in `run()`. This matches the level of rigor the test-cases.md author intended for must-priority cases.

---

## Acceptance Criteria Check

| Criteria | Status |
|----------|--------|
| `pipeline.ts` に step 名の文字列比較が存在しない | ✅ |
| `resolve-step.ts` に step 名のハードコード Set が存在しない | ✅ |
| `executor.ts` に `PROJECT_CONTEXT_STEPS` が存在しない | ✅ |
| managed adapter の SSE/polling 分岐がプライベートメソッドに集約されている | ✅ |
| managed adapter に `step.name ===` のエラーメッセージ分岐が存在しない | ✅ |
| 各 step 定義にフラグが宣言されている | ✅ |
| 振る舞いが変わらない | ✅ |
| `bun run typecheck` / `bun run test` が全 pass | ✅ |

## Test Coverage

test-cases.md defines 32 test cases across 9 categories.

**Must-priority cases — coverage status:**

- TC-01 through TC-05 (step flags): covered implicitly by the executor's `needsProjectContext` injection tests in `executor.test.ts` (ALLOWLIST_STEPS and NON_ALLOWLIST_STEPS arrays), and indirectly by the `resolve-step.test.ts` phase assertions. However, no test directly reads `DesignStep.phase`, `SpecReviewStep.needsProjectContext`, etc. from the object literals. Coverage is behavioral rather than structural.
- TC-07/TC-08 (getStepOutcome via completionVerdict): the pipeline.test.ts design step mock is declared with `completionVerdict: "success"` and the pipeline routes correctly; TC-060 implicitly covers TC-07.
- TC-10 (no step-name comparison in pipeline.ts getStepOutcome): no static-analysis test checks this, but the dead code was verified removed by direct inspection.
- TC-11/TC-12 (needsProjectContext injection): fully covered by `executor.test.ts` TC-007 to TC-015 blocks using the ALLOWLIST/NON_ALLOWLIST pattern with a capturing runner.
- TC-13 (PROJECT_CONTEXT_STEPS absent): no explicit static-analysis test, but the symbol is absent from the file.
- TC-14/TC-15/TC-16 (isSpecPhase): covered indirectly via `resolveResumeStep()` tests in `resolve-step.test.ts`. No direct `isSpecPhase` test.
- TC-17 (SPEC_PHASE_STEPS absent): no explicit static-analysis test; verified by direct inspection.
- TC-18/TC-19 (useSseStrategy dispatch): not directly tested; behavior is correct but no unit test isolates the method.
- TC-20 (useSseStrategy private method exists, run() has no direct comparison): not tested statically.
- TC-21 through TC-27 (errors.ts and agent-runner): fully covered by `review-exit-contract.test.ts`, which tests `resultFileNotFoundError` for both step names and arbitrary names, checks `ERROR_CODES` keys, and verifies the executor throws with the correct error code and hint.
- TC-28/TC-29 (typecheck and test pass): verified — both pass with zero errors.
- TC-30 (behavioral equivalence): implicitly covered by the full pipeline integration tests (pipeline.test.ts TC-060 through TC-068) which exercise the complete step sequence.
- TC-31 (STEP_PHASE_MAP covers all AgentStep singletons): not tested; verified by inspection that all 8 singletons are imported.
- TC-32 (STEP_NAMES import removed from executor.ts if unused): verified by inspection — STEP_NAMES is not imported in executor.ts in this branch.

Overall, must-priority behavioral coverage is complete. The gap is in explicit unit assertions for TC-01 through TC-05 (step flag values), TC-14 through TC-16 (isSpecPhase directly), and TC-18 through TC-20 (useSseStrategy static analysis). These are nit-level for a refactoring PR where behavior is unchanged and verified end-to-end.
