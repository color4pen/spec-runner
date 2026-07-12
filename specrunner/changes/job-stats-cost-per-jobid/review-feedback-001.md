# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.0

## Summary

設計通りの最小変更で問題を解決している。`listWithSourceDirs()` の追加と `list()` の委譲リファクタリングは局所的で、既存 caller への波及なし。全受け入れ基準を満たしている。

### 受け入れ基準確認

| 基準 | 状態 | 根拠 |
|------|------|------|
| 同一 base-slug・別 jobId の 2 run が各自のコストを計上 | ✅ | TC-CROSS-001（$0.80 / $1.60 / total $2.40 をアサート） |
| legacy invocation が別 dir の行に混入しない | ✅ | TC-CROSS-002 で各行が自 dir の invocation のみ加算されることを確認 |
| durationSec / convergence 不変 | ✅ | 既存テスト 6473 件 green（verification-result.md） |
| usage.json 欠落行が null / drop なし | ✅ | TC-CROSS-003 で `costUsd === null` かつ行存在を確認 |
| typecheck && test green | ✅ | build / typecheck / test / lint すべて passed |

### 実装確認メモ

- **各 Section の sourceChangeDir**: Section 1（active）・1b（archive）・2（worktree）・3（sidecar）はそれぞれ `stateJsonPath` の親と等価な式で組み立てており正確。Section 4（managed marker）は `changeFolderPath(slug)` を使い active dir を指す。design.md D2 が示すとおり Section 4 は sections 1–3 で未発見の jobId のみ追加するため衝突リスクなし。
- **`if (changeDir)` ガード削除**: `resolveChangeDir` は `null` を返す可能性があったためガードが必要だったが、`sourceChangeDir` は常に `string` のため削除は正しい。
- **legacy invocation の遮断**: `deriveRunStat` の jobId フィルタは `inv.jobId === undefined` を除外しない（仕様通り）。各行が自 sourceChangeDir の usage.json だけを読むことで cross-dir 混入は構造的に塞がれている。TC-CROSS-002 がこれを回帰テストとして固定している。

