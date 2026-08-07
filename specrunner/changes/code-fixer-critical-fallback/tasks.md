# Tasks: code-fixer CRITICAL fallback fix

## T-01: Fix CRITICAL omission in the two fallback prompt branches

- [ ] In `src/core/step/code-fixer.ts` around line 219 (coordinator loop fallback), change:
  `2. Fix all HIGH severity findings (mandatory)` →
  `2. Fix all HIGH and CRITICAL severity findings (mandatory)`
- [ ] In `src/core/step/code-fixer.ts` around line 291 (standard path fallback), change:
  `2. Fix all HIGH severity findings (mandatory)` →
  `2. Fix all HIGH and CRITICAL severity findings (mandatory)`
- [ ] Verify with grep that `Fix all HIGH severity findings` (without `and CRITICAL`) no longer appears anywhere in `src/core/step/code-fixer.ts`

**Acceptance Criteria**:
- `grep -n "Fix all HIGH severity findings" src/core/step/code-fixer.ts` returns 0 matches
- Both changed lines now read `Fix all HIGH and CRITICAL severity findings (mandatory)`

## T-02: Add tests that lock the CRITICAL mandatory contract for all prompt branches

Add a new `describe` block to `tests/unit/step/code-fixer.test.ts` titled `"prompt severity contract: all branches must include HIGH and CRITICAL (mandatory)"`.

The block must contain one test per branch:

1. **Conformance path** — build a state where `getConformanceFixContext` returns non-null (a `conformance` entry in `state.steps` with verdict `needs-fix:code-fixer` and `toolResult.findings` populated). Call `buildMessage` and assert the result contains `"Fix all HIGH and CRITICAL severity findings"`.

2. **Coordinator loop — findings embedded** — build a state where `isCoordinatorLoopActive` is true AND `collectParallelFixerFindings` returns at least one finding (set up a reviewer with structured findings in its outcome). Call `buildMessage` and assert the result contains `"Fix all HIGH and CRITICAL severity findings"`.

3. **Coordinator loop — fallback (no structured findings)** — build a state where `isCoordinatorLoopActive` is true AND no structured findings exist in reviewer outcomes (force the fallback to the file-path branch). Call `buildMessage` and assert the result contains `"Fix all HIGH and CRITICAL severity findings"`.

4. **Standard path — findings embedded** — build a state where code-review has a structured `findings` array in its outcome. Call `buildMessage` and assert the result contains `"Fix all HIGH and CRITICAL severity findings"`.

5. **Standard path — fallback (no structured findings)** — use the existing `makeStateWithCodeReviewResult` helper (outcome has `findingsPath` but no inline findings). Call `buildMessage` and assert the result contains `"Fix all HIGH and CRITICAL severity findings"`.

State construction notes:
- Coordinator-loop state needs: `state.reviewers` non-empty, `state.steps["custom-reviewers"]` with `verdict: "needs-fix"`, individual reviewer step with `verdict: "needs-fix"`. Use `CUSTOM_REVIEWERS_STEP_NAME` from `"../../../src/core/pipeline/types.js"`.
- Conformance state needs: a conformance step entry with verdict `needs-fix:code-fixer` and `toolResult.findings` populated. Check `getConformanceFixContext` in `src/core/step/fixer-helpers.ts` to see what shape the outcome must have.
- Standard path with embedded findings: add a `findings` array to the code-review outcome (look at the `Finding` type used by `buildFindingsBlock`).

**Acceptance Criteria**:
- All five new tests pass (`bun run test`)
- No existing tests are modified or broken
- `bun run typecheck` passes

## T-03: Full verification

- [ ] Run `bun run typecheck` — must exit 0
- [ ] Run `bun run test` — must exit 0, all tests green including the new describe block from T-02

**Acceptance Criteria**:
- Both commands exit 0
