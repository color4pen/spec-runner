# Code Review: implement-delta-merge (Iteration 1)

- **reviewer**: code-reviewer
- **iteration**: 1
- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.25** |

## Summary

実装は設計通り。パーサー・バリデーション・マージロジック・2-pass write・orchestrator 統合の全てが request.md と design.md の要件に合致している。DI パターンは既存の `archive-change-folder.ts` と一貫しており、テストは 43 ケースが全 pass。CRITICAL/HIGH なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/finish-spec-merge.test.ts | TC-SM-090〜093（orchestrator 統合テスト: merge が archive 前に呼ばれること、merge 失敗で archive 未呼び出し、skip 時のメッセージ抑制、成功後の archive 継続）が未実装。orchestrator.ts のワイヤリング回帰を検出できない | `finish-orchestrator.test.ts` または `finish-spec-merge.test.ts` に orchestrator レベルの mock テストを追加する。`mergeSpecsForChange` を vi.mock し、呼び出し順序・失敗時の短絡・skip 時の stdout 抑制を検証する |
| 2 | LOW | correctness | src/core/finish/spec-merge.ts:206-212 | `validateDeltaSpec` が ADDED+REMOVED 同名をクロスセクション競合として拒否する（TC-SM-034）一方、`applyMerge` は REMOVED→ADDED 順序で同名を受け入れる（TC-SM-047）。TC-SM-047 は統合フローで到達不能なパス。設計意図通り（design.md D3 参照）だが、TC-SM-047 のテストコメントに「applyMerge 単体の順序保証テストであり、統合フローでは validateDeltaSpec が先に拒否する」旨を追記すると将来の混乱を防げる | TC-SM-047 テストに docstring コメントを追加: `// NOTE: In integrated flow, validateDeltaSpec rejects ADDED+REMOVED same name as cross-section conflict before applyMerge is called.` |
| 3 | LOW | maintainability | tests/finish-adversarial.test.ts:72-75 | `makeStubFs` の `exists` が `p.includes("specs")` で判定しているため、`specrunner/specs/...` パスだけでなく意図しない "specs" を含むパスも false を返す。現在のテストでは問題ないが、将来 "specs" を含む他のパスが追加された場合に脆い | `p.includes("/specs")` または `p.endsWith("/specs")` に限定する |

## Verification

- `bun run typecheck`: pass (0 errors)
- `bun test tests/finish-spec-merge.test.ts`: 43 pass / 0 fail
- `bun test` (existing finish tests): 46 pass / 0 fail
- TC-SM-002, 003: paths.ts の新関数が正しいパスを返す
- TC-SM-010〜014: delta spec パーサーが 3 セクション + 複数ブロック + 空入力 + 大文字小文字を正しく処理
- TC-SM-020〜023: baseline spec パーサーが preamble/requirements/postamble を正しく分離
- TC-SM-030〜035: バリデーションが重複・クロスセクション競合を検出
- TC-SM-040〜047: ADDED/MODIFIED/REMOVED/複合/エラーケースが全て正しく動作
- TC-SM-050〜061: render/createNew が正しいテキストを生成
- TC-SM-070〜082: mergeSpecsForChange の skip/成功/エラー/2-pass/git add が全て正しく動作
- TC-SM-094: 既存テストが readFile モック追加後も全 pass
- TC-SM-095: typecheck + test 全 pass
