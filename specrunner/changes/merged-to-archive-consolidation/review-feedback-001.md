# Review Feedback

- **iteration**: 1
- **verdict**: approved

## Summary

`merged-to-archive-consolidation` の実装は request.md / design.md / tasks.md が指定する全 13 タスクを正しく完了しており、test-cases.md の must カテゴリは静的検証可能なものを全てカバーしている。`bun run typecheck` も `bun run test`（225 ファイル / 2448 件）も green。src 内に `MERGED_SUBDIR` / `requests/merged` / `RequestState` / `request-migrate-flat` の dead reference は残存しない（grep 確認済み）。ADR も 5 点要件（merged → archive 統合、44 件救済、archive 経路一本化、PR #347 是正、LLM 不確定性観察）を網羅している。

merge 後に baseline へ反映される `requests/active/` / `requests/merged/` の消失（TC-MA-027, TC-MA-028）は finish 後にしか検証できないため iter 1 のスコープ外。

## Findings

### [MAY] TC-SL-006e のテストが実装変更の影響を反映していない

ファイル: `tests/unit/util/slugify.test.ts:138-144`

このテストは `specrunner/requests/active/` を作成してから「衝突しない slug を渡せばエラーにならない」ことを確認しているが、`checkSlugCollision` は drafts + archive の 2 経路しか走査しないため、`requests/active/` の作成自体が test の意図と無関係になっている。tests/unit/core/request/store.test.ts の TC-ST-007 と機能的に重複している。

影響なし（test は green）だが、tests を読んだ人が「`requests/active/` を走査する」と誤読する余地が残る。Task 7 の射程外だったため iter 1 では指摘のみで approved を妨げない。

---

### [MAY] TC-MA-020 の「151 件」アサーションは現状の実装では実現不可

ファイル: `tests/unit/context/request-patterns.test.ts`

`collectRequestPatterns` は最大 4 件（3 same-type + 1 other-type）しか返さないため、test-cases.md の TC-MA-020 が要求する「151 件分のパターンエントリが返される」は API 仕様上不可能。実装の代替として TC-RP-001〜005（temp dir で 5 件規模を検証）でカバーしている。

test-cases.md の文言が API の挙動と乖離しているだけで、実装の妥当性には影響しない（archive ディレクトリ全件を走査するロジックは正しく入っている）。test-cases.md の TC-MA-020 表現がやや過剰だったというだけ。

---

### [MAY] 静的アサーション TC-MA-007 が部分的に satisfied

ファイル: `tests/unit/core/request/store.test.ts:142-148`

regression test は `requests/merged` 部分文字列のみを assert している。一方 store.ts には `path.join("specrunner", "requests", "merged")` ではなく `path.join("specrunner", "changes", "archive")` だけが残るため、本質的な dead-reference 検出には十分。test-cases.md TC-MA-007 の意図（`requests/merged` パスが含まれない）と整合している。

## Test Coverage Against test-cases.md

| TC | Priority | Status |
|---|---|---|
| TC-MA-001〜005 | must | 実装＋既存テストで覆われる（TC-ST-005, TC-ST-009, TC-ST-007 等） |
| TC-MA-006, 007 | must | tests/unit/core/request/store.test.ts に Regression describe 追加（L133-149） |
| TC-MA-008〜010 | must | git diff で types.ts, manager.ts の削除が確認できる |
| TC-MA-011 | must | git diff request-list.ts で STATE 列削除を確認 |
| TC-MA-012 | must | 出力に `state` フィールド消失（dedicated unit test なし、コードレビューで担保） |
| TC-MA-013, 014 | must | git diff で削除確認 |
| TC-MA-015〜018 | must/should | git diff で test 更新を確認 |
| TC-MA-019 | must | tests/unit/core/request/store.test.ts L133-149 |
| TC-MA-020 | must | TC-RP-005 で archive-only 経路を検証（151 件 exact ではないが概念は同一） |
| TC-MA-021 | must | TC-RP-005 が assert |
| TC-MA-022, 023 | must | verification-result.md で green 確認 |
| TC-MA-024〜026 | must | delta-specs/cli-commands/spec.md および specs/cli-commands/spec.md で覆う |
| TC-MA-027, 028 | must/should | finish 後検証扱い（iter 1 範囲外） |
| TC-MA-029 | should | workflow-structure.ts 確認済み（merged 参照なし） |
| TC-MA-030 | should | adr/2026-05-21-merged-to-archive-consolidation.md に 5 項目記録 |
| TC-MA-031, 032 | must | リポジトリ実態確認（requests/merged なし、archive 151 件） |
| TC-MA-033 | must | grep で src/tests に request-migrate-flat 参照なし確認済み |

## Verification

- `git grep MERGED_SUBDIR src/` → 0 件
- `git grep "requests/merged" src/` → 0 件
- `git grep RequestState src/` → 0 件
- `git grep request-migrate-flat src/ tests/` → 0 件
- `bun run typecheck` → exit 0
- `bun run test` → 225 files, 2448 tests passed
- `ls specrunner/changes/archive/ | wc -l` → 151
