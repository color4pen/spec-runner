# Progress: openspec drift cleanup — cli-commands count 修正 + test-slug 残骸削除

## Meta

- **request**: openspec-workflow/requests/active/openspec-drift-cleanup
- **type**: bug-fix
- **severity**: low
- **started**: 2026-05-02 18:27
- **status**: completed

## Phases

各フェーズの Started / Completed には現在時刻を `HH:mm` 形式で記録すること。

| # | Phase | Status | Started | Completed | Notes |
|---|-------|--------|---------|-----------|-------|
| 1 | トリアージ | completed | 18:27 | 18:28 | severity=low（drift reconcile、本番影響なし）、branch=fix/openspec-drift-cleanup |
| 2 | 再現確認 | completed | 18:28 | 18:28 | spec.md L117/119/124/129/134 で「5」残存、openspec list に test-slug が現れる |
| 3a | RCA（技術） | completed | 18:28 | 18:30 | 直接原因=spec の count 5/6 drift + test-slug 残骸。根本原因=PR #50 で count delta 抜け、PR #51 で --skip-specs 迂回 |
| 3b | RCA（プロセス） | completed | 18:28 | 18:30 | spec-review/verification にギャップあり。改善は別 request（スコープ外）として deferred |
| 4 | 修正 | completed | 18:30 | 18:31 | spec.md 編集 / change folder 作成 / test-slug 削除（変更ファイル 4） |
| 5 | 検証 | completed | 18:31 | 18:34 | openspec validate ✓, openspec list ✓, vitest 686/686 ✓, tsc --noEmit ✓。途中で test-slug 再発の真因（pipeline-integration.test.ts mock）を発見し .gitignore で再発防止 |
| 6 | 学習フィードバック | completed | 18:34 | 18:36 | learned-patterns.md に bugfix entry 追記（root cause = count delta 漏れ + MODIFIED 単独 header 変更 + --skip-specs 迂回 + test mock の repo cwd 書き込み）。process gap 改善は別 request に deferred |
| 7 | PR作成 | completed | 18:38 | 18:41 | PR #53 作成、awaiting-merge へ移動 |

## Retries

| Phase | Attempt | Result | Details |
|-------|---------|--------|---------|
| | | | |

## Escalations

| Timestamp | Phase | Reason | Resolution |
|-----------|-------|--------|-----------|
| | | | |

## Errors

| Timestamp | Phase | Error | Action Taken |
|-----------|-------|-------|-------------|
| | | | |
