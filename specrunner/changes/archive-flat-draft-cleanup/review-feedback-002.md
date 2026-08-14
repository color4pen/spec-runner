# Code Review Feedback — archive-flat-draft-cleanup iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープを確認（src/ は orchestrator.ts と orchestrator.test.ts のみ）
- `src/core/archive/orchestrator.ts` 全文を読み、実装内容を確認
- `src/core/archive/__tests__/orchestrator.test.ts` 全文（805 行）を読み、テスト網羅性を確認
- `specrunner/changes/archive-flat-draft-cleanup/` の request.md / design.md / tasks.md / spec.md / test-cases.md を照合
- `verification-result.md` にて typecheck / test / lint すべて passed を確認
- iter 1 のエスカレーション原因（TC-009/TC-010 命名衝突）の解消を確認
- `src/util/paths.ts` で `draftsDir()` = `"specrunner/drafts"` を確認

## 検証できなかった項目

None — ファイル・テスト・検証結果すべて確認済み。

## Iter 1 エスカレーション解決確認

前回 escalation した「test-cases.md の TC-009/TC-010 が pre-existing の deferArchivedTransition テストと衝突」の件:

- operator fix により test-cases.md の EPERM/EACCES テストケースを TC-011/TC-012 に改番
- テストファイルの TC-009/TC-010（deferArchivedTransition）は既存のまま維持
- test-cases.md と test file の衝突は解消済み ✓

## 実装確認

orchestrator.ts lines 260–279 の新実装:

- **D1**: `cwd`（repo 本体）基準で削除 ✓（旧 `recordDir` から修正済み）
- **D2**: flat（`.md`）→ directory の順に両形式を処理 ✓
- **D3**: `git ls-files -- <relPath>` で tracked 判定 → 警告のみ・削除しない ✓
- **D4**: 旧 worktree-side `fs.rm` と `git add specrunner/drafts/` は完全削除済み ✓
- **D5**: `FinishFs` / `ArchiveInput` インターフェース無変更 ✓

## テスト網羅性

| TC | 優先度 | テスト | 結果 |
|---|---|---|---|
| TC-001 | must | line 326 | ✓ flat のみ削除 |
| TC-002 | must | line 352 | ✓ dir のみ削除 |
| TC-003 | must | line 378 | ✓ 両方不在 → rm/warning なし |
| TC-004 | must | line 410 | ✓ tracked flat → rm なし・warning あり |
| TC-005 | must | line 453 | ✓ tracked dir → rm なし・warning あり |
| TC-006 | must | line 496 | ✓ 両方存在・untracked → 両方削除 |
| TC-007 | should | 明示テストなし | コード削除で trivially true |
| TC-008 | should | 明示テストなし | コード削除で trivially true |
| TC-011 | should | T-06 (line 233) | ✓ EPERM → exitCode 0 |
| TC-012 | should | T-07 (line 249) | ✓ EACCES → warning + exitCode 0 |

must 優先度 6 件すべてに専用テストあり。

## 受け入れ基準チェック

| 受け入れ基準 | 対応テスト | 結果 |
|---|---|---|
| フラット形式 draft が repo 本体から削除される | TC-001 | ✓ |
| ディレクトリ形式 draft が repo 本体から削除される | TC-002 | ✓ |
| 両形式とも存在しない場合に archive が失敗せず警告も出ない | TC-003 | ✓ |
| tracked な draft の場合は削除せず警告が出る | TC-004, TC-005 | ✓ |
| 既存テストが無変更で green | verification-result.md: passed | ✓ |
| `typecheck && test` が green | verification-result.md: passed | ✓ |

## Findings 詳細

None — blocking findings なし。

観察事項（non-blocking）:
- **TC-011/TC-012 → T-06/T-07 命名対応**: test-cases.md は TC-011/TC-012 と命名するが、テストファイルは T-06/T-07 として実装。動作は同一。トレーサビリティの名称不一致は機能に影響しない。
- **TC-007/TC-008** (should): 明示テストなし。コードが削除されたため trivially satisfied であり将来の回帰リスクはない。
