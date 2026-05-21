# Spec Review Result

- **change**: spec-merge-baseline-header-check
- **type**: new-feature
- **date**: 2026-05-19
- **verdict**: approved

## Summary

仕様・設計・タスク・delta spec すべて一貫しており、実装に進める。

## Findings

### Delta spec section 確認 (ADDED / MODIFIED 判定)

baseline の `spec-merge` capability には 4 つの Requirement が存在する:

1. `delta apply skip/fail is determined by request type`
2. `empty delta (0 entries) is a fatal error`
3. `cross-capability delta apply is atomic`
4. `TYPE_CONFIG is the authoritative source for known request types`

delta spec の `### Requirement: baseline header consistency check before merge application` はこれらのどれとも一致しない。**ADDED は正しい**。

### 設計の技術的整合性

- `checkBaselineHeaderConsistency` の挿入位置 (validateDeltaSpec 後、applyMerge 前) は既存コード (spec-merge.ts:478–524) と一致する。
- baseline 読み込みの hoist (2 箇所読みを 1 箇所に統合) はコード簡略化として妥当。
- violations を `allErrors` に push して `continue` する構造は既存の 2-pass atomicity 要件 ("cross-capability delta apply is atomic") を破壊しない。Pass 1 で violation が出た capability は writeEntries に積まれず、Pass 2 は全 capability 成功時のみ実行される。

### テストカバレッジ

TC-SMB-01〜07 は主要パスを網羅している:

| TC | 確認内容 |
|----|---------|
| 01 | 正常通過 (MODIFIED 一致) |
| 02 | MODIFIED 不在 → violation |
| 03 | baseline 不在 + MODIFIED → violation (件数分) |
| 04 | REMOVED 不在 → violation |
| 05 | ADDED 重複 → violation |
| 06 | 混在違反 → 個別報告 |
| 07 | normalization (bold 剥がし) の動作確認 |

### 既存検出経路との関係

- 事前 check 通過後も `applyMerge` の exact-match が残る。設計はこれを defense-in-depth として明示的に許容している。
- TC-SMB-07 のシナリオ (delta `**Foo**` vs baseline `Foo`) は pre-check では violation なし (false positive 防止が目的) だが、`applyMerge` では exact-match 失敗する。この gap は設計文書で認識・承認されており、primary failure mode (wrong section classification) には影響しない。

### セキュリティ

- `normalizeRequirementHeader` は純粋関数 (外部呼び出しなし)。
- `capability` は `fs.readdir(specsDir)` の結果から取得しており、`specsDir` は change folder 内に固定されている。
- 既存 `spec-merge.ts` のパストラバーサルリスクと同等以下。新規攻撃面なし。

## Checklist

- [x] request.md に背景・設計判断・スコープ外・受け入れ基準が揃っている
- [x] design.md に型シグネチャ・挿入位置・エラー format が明示されている
- [x] tasks.md にファイル別の実装手順と acceptance 条件がある
- [x] delta spec の section (ADDED) が baseline と一致して選択されている
- [x] 2-pass atomicity 要件を破壊しない設計になっている
- [x] RENAMED スコープ外が明示されている
- [x] 既存 `tests/finish-spec-merge.test.ts` の regression なし要件が明示されている
