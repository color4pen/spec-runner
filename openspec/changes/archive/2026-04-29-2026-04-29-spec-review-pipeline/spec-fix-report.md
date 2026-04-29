# Spec Fix Report — iteration 1

## Applied Fixes

| # | Finding | File Modified | Change Description |
|---|---------|--------------|-------------------|
| 1 | #1 (HIGH): getFileContent 不存在 | design.md, tasks.md 4.4-4.5, specs/spec-review-session/spec.md | `getFileContent` 参照を削除し `fetchSpecReviewResult(deps, slug, branch)` (raw fetch) に統一。design.md Context・Decision 4・Risks を更新 |
| 2 | #2 (HIGH): pollUntilComplete 未活用 + status enum 不整合 | design.md Decision 3, tasks.md 4.4, specs/spec-review-session/spec.md | tasks.md 4.4 を `pollUntilComplete` 再利用に書き換え。`status === "ended"` → `"idle"` に全箇所修正 |
| 3 | #3 (HIGH): runProposePipeline ラッパーの方針分裂 | design.md Decision 1, tasks.md 2.3, specs/propose-pipeline/spec.md | ラッパー削除に統一。propose-pipeline/spec.md の "後方互換 wrapper" Scenario を削除 |

## Skipped Findings

| # | Finding | Reason |
|---|---------|--------|
| 4 | #4 (MEDIUM): state.session 派生フィールド未定義 | MEDIUM — 承認ブロック対象外。実装時に対応 |
| 5 | #5 (MEDIUM): spec-review timeout config 上書き未定義 | MEDIUM — 承認ブロック対象外 |
| 6 | #6 (MEDIUM): standard toolset 権限範囲未定義 | MEDIUM — 承認ブロック対象外 |
| 7 | #7 (MEDIUM): verdict first-write-wins prompt injection | MEDIUM — 承認ブロック対象外 |
| 8 | #8 (MEDIUM): 中断再開挙動未定義 | MEDIUM — 承認ブロック対象外 |
| 9 | #9 (MEDIUM): runSpecReviewStep の 3 関数分割 tasks 未反映 | MEDIUM — 承認ブロック対象外。tasks.md 4.5 で fetchSpecReviewResult を分離済み |
| 10 | #10 (LOW): step-transition entry 形式未定義 | LOW — スキップ |
| 11 | #11 (LOW): findings「タイトル」フィールド誤記 | LOW — スキップ |
| 12 | #12 (LOW): propose-pipeline/spec.md に MODIFIED rationale なし | LOW — スキップ |
