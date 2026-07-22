# Regression Gate Result — Iteration 002

## Ledger verification

### [LOW] TC-001 ラベルがテスト 2 件に重複している

**File checked**: `src/core/pipeline/__tests__/round-git-scope.test.ts`

**Evidence**:

- Line 198: `it("TC-001: pr-create-result.md in changed → excluded from BOTH offending AND toStage", ...)` — 1件目（変更なし）
- Line 213: `it("TC-001b: pr-create-result.md only in changed (no declared changes) → toStage = [], offending = []", ...)` — 2件目が `TC-001b` に改名済み

`TC-001` が重複する状態には戻っておらず、修正は維持されている。

## Conclusion

Findings: 0 件（全修正が維持されている）
