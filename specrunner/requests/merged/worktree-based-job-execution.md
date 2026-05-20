# local runtime の job 実行を worktree ベースに移行する

## Meta

- **type**: improvement
- **slug**: worktree-based-job-execution

## 背景

local runtime は main cwd で全 step を実行する。以下の問題が発生している:

1. request ファイルが feature branch にコミットされない（finish の git mv が失敗する）
2. change folder が main の untracked files として漏れる
3. finish が feature branch に checkout して main cwd を汚す
4. verification step の temp worktree が cwd と競合する
5. finish の push 直後に merge が失敗する（merge state 未計算）

## 要件

### Phase 1: WorktreeManager 追加

1. `src/core/worktree/manager.ts` に `WorktreeManager` を実装:
   - `create(repoRoot, branch, jobId): Promise<string>` — worktree 作成、path を返す
   - `remove(path): Promise<void>` — worktree 削除
   - `prune(): Promise<void>` — orphan worktree 掃除
2. worktree path: `.git/specrunner-worktrees/<slug>-<jobId-short>/`
3. worktree 作成後に `bun install --frozen-lockfile` を実行
4. `JobState` に `worktreePath?: string | null` を追加

### Phase 2: run.ts の worktree 統合

5. `specrunner run` が `runtime === "local"` のとき worktree を作成
6. request ファイルを worktree にコピーしてコミット
7. pipeline の `deps.cwd` に worktree path を渡す
8. state file に `worktreePath` を記録
9. process signal handler（SIGINT/SIGTERM）で worktree cleanup
10. managed mode は変更なし

### Phase 3: finish の worktree 対応

11. finish が `state.worktreePath` を読んでそこで操作する
12. `preflight.ts` の `checkoutForValidation` / `restoreBranch` を削除
13. `orchestrator.ts` の `checkoutFeatureBranch` を削除
14. worktree がない場合（crash recovery）は temp worktree を作成してフォールバック
15. Phase 4 で worktree を削除
16. Phase 2 push 後に merge state が CLEAN になるまで待つロジックを追加

### Phase 4: verification / propagation の簡素化

17. verification step の per-step temp worktree を削除（job worktree 内で直接実行）
18. propagate.ts の temp worktree を削除（job worktree から直接 commit + push）
19. `bun install` は worktree 作成時に済んでいるので verification での再実行は不要

## 受け入れ基準

- [ ] local mode で `specrunner run` が worktree 内で pipeline を実行する
- [ ] main cwd に untracked files が残らない
- [ ] `specrunner finish` が main cwd を checkout で汚さない
- [ ] verification の worktree 警告が出ない
- [ ] managed mode に影響がない
- [ ] SIGINT で worktree が cleanup される
- [ ] `bun run typecheck && bun run test` が green

## 補足

### architect 評価済み設計判断

- worktree path: `.git/specrunner-worktrees/` 内（parent dir 汚染回避）
- node_modules: `bun install --frozen-lockfile` を毎回（symlink しない）
- cleanup: signal handler + state file + `git worktree prune` の 3 層防御
- 並列実行: 今は実装しない（設計的には可能）
- 段階的実装: 2-3 PR に分割推奨

### 消えるコード

- `preflight.ts` の `checkoutForValidation` / `restoreBranch`
- `verification.ts` の per-step temp worktree 作成
- `propagate.ts` の temp worktree 作成
