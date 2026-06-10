# ps.checkPrMerged の unit test を追加する

## Meta

- **type**: chore
- **slug**: ps-checkprmerged-test
- **base-branch**: main
- **adr**: false

## 背景

`ps.checkPrMerged`（`src/cli/ps.ts:99`）は PR の merge 状態確認に使われているが unit test が存在しない（#332）。GitHub API 呼び出し → state 判定 → silent skip という内部ロジックをテストで固定する。

## 現状コードの前提

- `checkPrMerged(job, githubClient)` は `src/cli/ps.ts:99` に定義され、同ファイル `:160` から呼ばれている
- `GitHubClient` の mock は `tests/helpers/pipeline-mock-client.ts` の `buildMockGithubClient` パターンが既存の規律

## 要件

1. `checkPrMerged` の unit test を追加する。配置はテスト群の既存規律（`tests/unit/cli/`）に合わせる
2. 以下のシナリオを cover する:
   - `job.pullRequest` が null → null 返却
   - `githubClient` が null → null 返却（silent skip）
   - `getPullRequest()` が `state: "MERGED"` → true
   - `getPullRequest()` が `state: "OPEN"` → false
   - `getPullRequest()` が throw → null 返却（silent skip）

## スコープ外

- ps コマンド全体・表示 format のテスト
- `GitHubClient` 自体のテスト（既存）
- `checkPrMerged` の実装変更

## 受け入れ基準

- [ ] 上記 5 シナリオのテストが存在し green
- [ ] 実装（src/）に変更がない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

なし（テスト追加のみ）

---
closes #332