# Review Feedback: requests-to-drafts-restructure — iter 2

- **verdict**: approved
- **date**: 2026-05-20
- **reviewer**: code-review agent

---

## Summary

iter 1 の 2 件の指摘（F1: ADR なし、F2: workflow-structure 早期 return）がいずれも正しく修正されている。新たな must / should レベルの問題はない。typecheck + test (226 files, 2451 tests) は verification-result (iter 1) で green 確認済み。

---

## iter 1 指摘の修正確認

### F1 (must) → 修正済み ✅

`specrunner/adr/2026-05-20-requests-to-drafts-restructure.md` が作成され、受け入れ基準に記載された 4 設計判断がすべて記録されている:

1. `drafts/` rename の採用 → 「判断 1」に記録、却下案（pending / 現状維持）の理由も記載
2. archive 経路 1 本化 → 「判断 2」に記録、廃止ファイルも明示
3. 起票 untracked 残骸バグの構造解（run 開始時の move 化）→ 「判断 3」に記録、root cause の説明含む
4. 既存 `requests/merged/` の read-only 維持判断 → 「判断 4」に記録、checkSlugCollision 3 経路の扱いも説明

TC-40（must）クリア。

---

### F2 (should) → 修正済み ✅

`workflow-structure.ts` の早期 return が排除され、`messageParts` / `hintParts` 配列に全警告を集積してから末尾でまとめて return する構造に変更:

```typescript
// requests/active/ が存在 かつ drafts/ が不在 の複合ケースで
// 両方の警告が messageParts に積まれてから return される
if (isDeprecatedPresent) { messageParts.push("...deprecated..."); }
if (missingDirs.length > 0) { messageParts.push("...missing dirs..."); }
return { status: "warn", message: messageParts.join(" "), ... };
```

TC-034（`requests/active/` 存在 + `drafts/` 不在の複合ケース）が新規追加され、`result.message` に `"deprecated"` と `"drafts"` の両方が含まれることを assert している。

---

## 新規 Findings

新たな must / should 問題はなし。以下は低リスクの観察事項として記録する。

### O1 — [info] draft-move.test.ts はスタブ経由の間接テスト

**対象**: `tests/unit/core/runtime/draft-move.test.ts`

iter 1 から変更なし。`simulateSetupWorkspaceDraftMove` スタブは `LocalRuntime.setupWorkspace` を直接呼ばないため、`local.ts` から `fs.rm` が誤って削除された場合に検知できない。リスクは低いが、将来のリファクタで `local.ts` の `setupWorkspace` を大きく変更する際は注意。

---

## TC Coverage

| TC | 優先度 | 確認 |
|---|---|---|
| TC-01/02 | must | ✅ store.test.ts (TC-ST-001〜004) |
| TC-03〜07 | must | ✅ store.test.ts (TC-ST-005〜009) |
| TC-08〜10 | must | ✅ request-new/rm/show.test.ts |
| TC-11 | should | ✅ request-show.test.ts (TC-SHOW-006) |
| TC-13 | must | ✅ pipeline-run-canonical.test.ts |
| TC-15/16 | must | ✅ draft-move.test.ts (TC-DRAFT-001/002) ※O1 参照 |
| TC-18 | must | ✅ managed.ts 実装確認 |
| TC-19/20 | must | ✅ archive-one-path.test.ts (TC-ARCH-001/002) |
| TC-22 | must | ✅ finish-resolve-target.test.ts (TC-004/TC-131) |
| TC-24/25 | must | ✅ request-patterns.test.ts |
| TC-26〜28 | should | ✅ workflow-structure.test.ts (TC-031〜034) |
| TC-29〜31 | must | ✅ delta-specs/ 3 ファイル存在確認 |
| TC-36/37 | must | ✅ verification-result.md (226 files, 2451 tests green) |
| TC-38/39 | must | ✅ store.test.ts |
| TC-40 | must | ✅ ADR 4 項目確認済み |
