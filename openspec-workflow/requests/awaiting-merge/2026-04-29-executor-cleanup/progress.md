# Progress: executor.ts helper 抽出 + @deprecated shim / pipeline 並存解消

## Meta

- **request**: openspec-workflow/requests/active/2026-04-29-executor-cleanup
- **type**: refactoring
- **started**: 2026-04-29 22:33
- **status**: completed (PR #31 awaiting-merge)

## Change Folder

- **path**: openspec/changes/2026-04-29-executor-cleanup/

## Phases

各フェーズの Started / Completed には現在時刻を `HH:mm` 形式で記録すること。

| # | Phase | Status | Started | Completed | Notes |
|---|-------|--------|---------|-----------|-------|
| 1 | 初期化 | completed | 22:33 | 22:33 | type=refactoring, branch=refactor/2026-04-29-executor-cleanup, enabled=[module-architect] |
| 2 | 設計 | completed | 22:33 | 22:38 | proposal/design/tasks 生成。specs/ 意図的に省略（refactoring 振る舞い不変）。tasks.md §1 は module-analysis 落とし込みの placeholder |
| 2.5 | モジュール設計 | completed | 22:38 | 22:42 | 14 decisions (D1-D14) 確定。helper 5本 + sibling file 化 + 削除順 D11→D9→D10→D12→D2→D3→D4→D5→D6→D7→D8 |
| 3 | 仕様レビュー | completed | 22:42 | 22:55 | iter1 needs-fix (6.82, HIGH x2) → spec-fixer 8件適用 → iter2 approved (8.76, +1.83). verify*Legacy をスコープ追加（fixer judgment） |
| 3.5 | テストケース生成 | skipped | — | — | skipped: Step 3.5 test-case-generator, reason: enabled-absent(test-case-generator) |
| 4 | 実装 | completed | 22:58 | 23:30 | 49/49 tasks. executor.ts 900→675 LOC, pipeline.ts 削除, verify*Legacy 削除, githubClient 必須化, 296 tests PASS |
| 5a | 仕様整合性検証 | skipped | — | — | skipped: Step 5a openspec-validate, reason: artifact-absent(openspec/changes/2026-04-29-executor-cleanup/specs/) |
| 5b | 品質検証 | completed | 23:31 | 23:32 | READY. Build/TypeCheck/Test/Security PASS, Lint skip (no script). 296/296 tests PASS, snapshot 3/3 |
| 6 | コードレビュー | completed | 23:32 | 23:36 | iter1 approved (7.60). MEDIUM #1 (createSessionWithHistory unused) を code-fixer で先行修正 — propose 側 wire 完了、polling は構造差で見送り（rationale 記録）。executor.ts 675→647 LOC。298 tests PASS。LOW #2-#5 はフォローアップ port-tidying request 候補 |
| 7a | ADR生成 | skipped | — | — | skipped: Step 7a adr, reason: enabled-absent(adr) — refactoring default |
| 7b | awaiting-merge 遷移 | completed | 23:36 | 23:41 | git mv active→awaiting-merge, commit 41cbea6 |
| 9 | PR作成 | completed | 23:41 | 23:48 | PR #31 https://github.com/color4pen/spec-runner/pull/31. continuous-learning 7 lessons appended (lines 615-652). 蒸留: skip (前回から 0 件追加). observe-patterns: skip (observations.jsonl 不在). promote-rule --dry-run: 3 candidates (workspace-client-scroll-hydration / server-actions-coupled-edits / verification-npm-bun-drift). learning extraction already completed at /request-execute Step 9 |
| 9.5 | followup 推奨出力 | completed | 23:48 | 23:50 | 検出 0 件 (security/pattern/test-case-generator regex 全て 0 件)。module-architect は enabled 含のため対象外 |

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

## Follow-up

Step 9.5 で推奨された follow-up エージェントの追跡テーブル。
推奨時に Recommended 列を ✅ で記録し、実行時に Triggered と Result を埋める。

| Agent | Recommended | Triggered | Result |
|-------|-------------|-----------|--------|
| | | | |
