## 1. WorktreeManager.create() に baseRef 引数を追加

- [x] 1.1 `src/core/worktree/manager.ts` の `WorktreeManager` interface の `create()` signature に `baseRef?: string` を追加する
- [x] 1.2 `createWorktreeManager()` 内の `create()` 実装に `baseRef` パラメータを追加し、`git worktree add --detach <path> HEAD` の `HEAD` を `baseRef ?? "HEAD"` に置き換える
- [x] 1.3 `create()` の `baseRef` デフォルト値の行に `// TODO(base-branch): configurable base branch` コメントを追加する

## 2. LocalRuntime.setupWorkspace() に freshness 保証を追加

- [x] 2.1 run パス（line 121 付近）で `this.manager.create()` 呼び出し前に `git fetch origin` を `spawnCommand` 経由で実行する。fetch 失敗時は error を throw する
- [x] 2.2 fetch 後・worktree 作成前に `git rev-list HEAD..origin/main --count` を実行し、count > 0 なら `process.stderr.write` で warning を出力する（rev-list 失敗時は warning をスキップ — non-critical）
- [x] 2.3 run パスの `this.manager.create(this.cwd, slug, jobId)` を `this.manager.create(this.cwd, slug, jobId, "origin/main")` に変更する
- [x] 2.4 `"origin/main"` リテラルの行に `// TODO(base-branch): configurable base branch` コメントを追加する
- [x] 2.5 resume パス 1（line 98: `existingWorktreePath` が存在するが disk になく再作成する箇所）の `this.manager.create(this.cwd, slug, jobId)` を `this.manager.create(this.cwd, slug, jobId, "origin/main")` に変更する
- [x] 2.6 resume パス 2（line 111: `existingWorktreePath === null` で再作成する箇所）の `this.manager.create(this.cwd, slug, jobId)` を `this.manager.create(this.cwd, slug, jobId, "origin/main")` に変更する

## 3. pollMergeStateAfterPush() に DIRTY 早期打ち切りを追加

- [x] 3.1 `src/core/finish/preflight.ts` の `pollMergeStateAfterPush()` で `status === "CLEAN"` のチェック直後に `status === "DIRTY"` のチェックを追加し、DIRTY なら即座に `{ mergeStateStatus: "DIRTY" }` を return する

## 4. orchestrator.ts に DIRTY escalation guard を追加

- [x] 4.1 `src/core/finish/orchestrator.ts` の Phase 3 前（line 206 の `mergeStateAfterPush` 算出直後）に `mergeStateAfterPush === "DIRTY"` のチェックを追加する。DIRTY の場合、`formatEscalation()` で escalation を返す。メッセージ: `"PR has merge conflicts (DIRTY). Rebase the feature branch onto main and re-run: specrunner finish <slug>"`
- [x] 4.2 `orchestrator.ts` Phase 4 の `"main"` リテラル（line 250: `git checkout main`）に `// TODO(base-branch): configurable base branch` コメントを追加する

## 5. テスト

- [x] 5.1 `WorktreeManager.create()` のテストに `baseRef` 引数ありのケースを追加する。spawn mock が `["worktree", "add", "--detach", <path>, "origin/main"]` で呼ばれることを検証
- [x] 5.2 `WorktreeManager.create()` のテストに `baseRef` 省略時のケースが既存テストで `"HEAD"` のままであることを確認する（既存テストの互換性）
- [x] 5.3 `LocalRuntime.setupWorkspace()` の run パステストに fetch + behind warning + baseRef のケースを追加する
- [x] 5.4 `pollMergeStateAfterPush()` のテストに DIRTY 即時打ち切りのケースを追加する（retry せず 1 回で return することを検証）
- [x] 5.5 `finish-orchestrator` のテストに DIRTY escalation のケースを追加する（Phase 3 の merge が呼ばれないことを検証）
- [x] 5.6 `bun run typecheck` が pass することを確認する
- [x] 5.7 `bun test` が全テスト green であることを確認する
