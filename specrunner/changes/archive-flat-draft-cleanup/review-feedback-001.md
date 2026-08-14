# Code Review Feedback — archive-flat-draft-cleanup iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープを確認（15 ファイル変更、src/ は orchestrator.ts と orchestrator.test.ts のみ）
- `src/core/archive/orchestrator.ts` 全文を読み、旧実装との diff を確認
- `src/core/archive/__tests__/orchestrator.test.ts` 全文を読み、テスト網羅性を確認
- `specrunner/changes/archive-flat-draft-cleanup/` 配下の request.md / design.md / tasks.md / spec.md / test-cases.md を照合
- `verification-result.md` にて typecheck / test / lint すべて passed（11,394 tests pass）を確認

## 検証できなかった項目

None — ファイル・テスト・検証結果すべて確認済み。

## Findings 詳細

### F-01: TC-009 / TC-010 の命名衝突（低）

test-cases.md は TC-009 を「fs.rm 失敗が archive を失敗させない (EPERM)」、TC-010 を「EACCES 警告」と定義している。
しかしテストファイル内では TC-009/TC-010 はすでに pre-existing の `deferArchivedTransition` テストに使われており、
今回追加した EPERM/EACCES カバレッジは T-06/T-07 として実装されている。

動作に影響はないが、test-cases.md → テストファイルのトレーサビリティが TC-009/TC-010 で断絶している。

### F-02: TC-007・TC-008 の明示的テストなし（低）

test-cases.md に「should」優先度で定義された TC-007（worktree-side fs.rm が呼ばれない）と
TC-008（worktree-side git add specrunner/drafts が呼ばれない）の明示的テストがない。

test-materialize は must 優先度のみを対象とするため欠番は pipeline 設計どおり。
コードから worktree-side 処理は完全に除去されており動作には影響しない。

## Acceptance Criteria チェック

| 受け入れ基準 | 対応テスト | 結果 |
|---|---|---|
| フラット形式 draft が repo 本体から削除される | TC-001 | ✓ |
| ディレクトリ形式 draft が repo 本体から削除される | TC-002 | ✓ |
| 両形式とも存在しない場合に archive が失敗せず警告も出ない | TC-003 | ✓ |
| tracked な draft の場合は削除せず警告が出る | TC-004, TC-005 | ✓ |
| 既存テストが無変更で green | 11,394 tests passed | ✓ |
| `typecheck && test` が green | verification-result.md: passed | ✓ |

## 実装確認メモ

- `orchestrator.ts:263-279`: `cwd` 基準のループで flat→directory 順に削除。`fs.exists` 先行確認 + `git ls-files` tracked 判定。D1〜D3 準拠。
- 旧 worktree-side `fs.rm`（lines 260-265）と `git add specrunner/drafts/`（lines 272-284）は削除済み。D4 準拠。
- `FinishFs` / `ArchiveInput` インターフェース無変更。D5 準拠。
- `cancel/runner.ts` の `deps.repoRoot` 基準操作と対称的であり、設計一貫性あり。
