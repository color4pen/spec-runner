## Phase 1: WorktreeManager + JobState 拡張

- [x] 1.1 `src/core/worktree/manager.ts` を新規作成。`WorktreeManager` interface と `createWorktreeManager` factory を実装:
  - `create(repoRoot: string, slug: string, jobId: string): Promise<string>` — `git worktree add --detach <path> HEAD` を実行（branch 未確定のため detach モード。propose step 完了後に worktree 内で `git checkout -B <feature-branch>` を実行）。path は `<repoRoot>/.git/specrunner-worktrees/<slug>-<jobId先頭8文字>/`。作成後に `bun install --frozen-lockfile` を実行。worktree path を返す
  - `remove(worktreePath: string): Promise<void>` — `git worktree remove --force <path>` + `fs.rm(path, { recursive: true, force: true })`
  - `prune(repoRoot: string): Promise<void>` — `git worktree prune`
  - SpawnFn を DI できるようにする（テスタビリティ）
- [x] 1.2 `src/state/schema.ts` の `JobState` interface に `worktreePath?: string | null` を追加
- [x] 1.3 `src/state/schema.ts` の `validateJobState` で `worktreePath` の backward compat 処理を追加（absent → undefined で OK、型チェック不要）
- [x] 1.4 `tests/core/worktree/manager.test.ts` を作成。create / remove / prune の正常系 + エラー系テスト（spawn mock）
- [x] 1.5 `bun run typecheck && bun run test` が green

## Phase 2: run.ts の worktree 統合

- [x] 2.1 `src/cli/run.ts` の `runRunCore` を修正:
  - `config.runtime === "local"` の場合、pipeline 実行前に `WorktreeManager.create(cwd, slug, jobId)` で worktree を作成（`--detach HEAD` モード。slug は request の slug フィールドから取得）
  - request file を worktree にコピー: `fs.cp` で `request.path`（request.md 単体）を worktree の対応パスにコピー。openspec/changes/<slug>/ ディレクトリと specrunner/requests/ はコピー不要（pipeline が worktree 内で生成するため）
  - `jobState` の `worktreePath` に path を記録（`store.update`）
  - `deps.cwd` に worktree path を渡す
- [x] 2.2 signal handler を追加:
  - `process.on('SIGINT', cleanup)` / `process.on('SIGTERM', cleanup)` を pipeline 実行前に登録
  - cleanup: `manager.remove(worktreePath)` → `manager.prune(cwd)` → `process.exit(130)`
  - pipeline 完了後に handler を解除（`process.off`）
- [x] 2.3 pipeline の error path で worktree を cleanup（try/finally で `manager.remove`）
- [x] 2.4 managed mode が `config.runtime !== "local"` ガードで worktree ロジックをスキップすることを確認
- [x] 2.5 `bun run typecheck && bun run test` が green

## Phase 3: verification / propagation の簡素化

- [x] 3.1 `src/core/step/verification.ts` を修正:
  - L47-96 の temp worktree 作成・cleanup ロジックを削除
  - `verificationCwd = deps.cwd ?? process.cwd()` のみで実行（job worktree が cwd として渡される）
  - L82-87 の result file コピーロジックを削除（worktree 内に直接書かれるため不要）
  - propagation（L98-115）を簡素化: `propagateVerificationResult` に worktree cwd を渡す
- [x] 3.2 `src/core/verification/propagate.ts` を修正:
  - temp worktree 作成ロジック（L52-70）を削除
  - `cwd`（= job worktree path）内で直接 `git add` → `git diff --cached --quiet` → `git commit` → `git push origin <branch>` を実行
  - worktree cleanup ロジック（L99-104）を削除
  - interface は維持（`propagateVerificationResult(params)` → `PropagateResult`）
- [x] 3.3 既存の verification / propagate テストを修正（temp worktree mock を除去、cwd 直接操作に書き換え）
- [x] 3.4 `bun run typecheck && bun run test` が green

## Phase 4: finish の worktree 対応

- [x] 4.1 `src/core/finish/preflight.ts` を修正:
  - `runPreflight` の Check 5+6 に分岐を追加: `state.worktreePath` があればその path 内で `openspec validate` を実行（checkout 不要）
  - worktreePath が null の場合: 既存の `checkoutForValidation` → validate → `restoreBranch` フローをそのまま実行（managed mode / crash recovery の既存動作を維持。temp worktree は作成しない）
  - `checkoutForValidation` / `restoreBranch` function は削除しない（null フォールバックで引き続き使用）
  - `PreflightInput` に `worktreePath?: string | null` を追加
- [x] 4.2 `src/core/finish/orchestrator.ts` を修正:
  - Phase 1: `target.worktreePath` がある場合はその cwd で archive / git mv / commit を実行（checkout 不要）
  - worktreePath が null の場合: 既存の `checkoutFeatureBranch` フローをそのまま実行（managed mode / crash recovery の既存動作を維持。temp worktree は作成しない）
  - `checkoutFeatureBranch` function は削除しない（null フォールバックで引き続き使用）
  - Phase 2: push 後に mergeStateStatus=CLEAN を確認する polling を追加（`fetchPrViewWithRetry` を再利用）
  - Phase 4: `WorktreeManager.remove(worktreePath)` で worktree を削除。main cwd の checkout/pull をスキップ（worktree 分離により不要）
- [x] 4.3 `FinishInput` / `ResolvedTarget` に `worktreePath` フィールドを追加（state から読み出し）
- [x] 4.4 既存の finish テストを修正（checkout mock を除去、worktree path ベースに書き換え）
- [x] 4.5 managed mode の finish が `worktreePath=null` で既存動作を維持することをテストで確認:
  - `worktreePath=null` の場合、preflight は既存の `checkoutForValidation` → validate → `restoreBranch` フローを実行すること
  - `worktreePath=null` の場合、orchestrator は既存の `checkoutFeatureBranch` フローを実行すること（新規 temp worktree を作成しないこと）
  - managed mode の既存テストが全て pass すること
- [x] 4.6 `bun run typecheck && bun run test` が green

## Phase 5: 最終検証

- [x] 5.1 `grep -r "checkoutForValidation\|restoreBranch\|checkoutFeatureBranch" src/` で呼び出し元を確認。これらは worktreePath=null フォールバック（managed mode）でのみ呼ばれることを確認（local mode の worktreePath あり経路からは呼ばれないこと）
- [x] 5.2 `grep -r "specrunner-verify-exec-\|specrunner-verify-" src/` で temp worktree パターンの残存を確認（propagate / verification から除去済み）
- [x] 5.3 finish orchestrator の Phase 4 で worktree remove が呼ばれることをテストで確認
- [x] 5.4 signal handler テスト: SIGINT 発火時に worktree remove が呼ばれることを確認
- [x] 5.5 managed mode のテストが全て pass（worktree ロジックが managed path に影響しないことの確認）
- [x] 5.6 `bun run typecheck && bun run test` が green
