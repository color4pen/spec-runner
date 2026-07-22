# Regression Gate Result — Iteration 1

## Evidence

### Finding: TC-001 ラベルがテスト 2 件に重複している

**Checked file**: `src/core/pipeline/__tests__/round-git-scope.test.ts`

**Verification method**: Read lines 190–222 and grepped for `TC-001` in the `partitionRoundChanges` describe block.

**Result**: **REGRESSION — fix NOT applied**

Both `it()` blocks inside `describe("partitionRoundChanges — pipeline-managed paths in changed")` still carry the `TC-001:` label prefix:

- Line 198: `it("TC-001: pr-create-result.md in changed → excluded from BOTH offending AND toStage", ...)`
- Line 213: `it("TC-001: pr-create-result.md only in changed (no declared changes) → toStage = [], offending = []", ...)`

The prescribed fix (rename the 2nd test to `TC-001b:`) was not committed. Both labels remain identical.

## Evidence summary

| checked | skipped | unverified |
|---------|---------|------------|
| 1       | 0       | 0          |
