# Tasks: finish を分解し archive を client-closed な最終片づけコマンドにする

## T-01: awaiting-merge → awaiting-archive status rename

- [x] `src/state/schema.ts`: `JobStatus` 型の `"awaiting-merge"` を `"awaiting-archive"` に変更
- [x] `src/state/schema.ts`: `validateJobState` 内の remap セクションで `"success"` → `"awaiting-archive"` に変更（既存の `"success"` → `"awaiting-merge"` remap を置き換え）
- [x] `src/state/schema.ts`: `validateJobState` 内に `"awaiting-merge"` → `"awaiting-archive"` remap を追加（`"success"` remap の直後）
- [x] `src/state/schema.ts`: `VALID_STATUSES` Set 内の `"awaiting-merge"` を `"awaiting-archive"` に変更
- [x] `src/state/lifecycle.ts`: `VALID_TRANSITIONS` Map の `"awaiting-merge"` key を `"awaiting-archive"` に変更。`"running"` の遷移先 Set 内の `"awaiting-merge"` も `"awaiting-archive"` に変更
- [x] `src/core/pipeline/pipeline.ts`: pipeline 完了時の `transitionJob(state, "awaiting-merge", ...)` を `transitionJob(state, "awaiting-archive", ...)` に変更。コメント `// Normal completion → awaiting-merge` も更新
- [x] `src/core/runtime/local.ts`: `teardown` 内の `finalStatus !== "awaiting-merge"` を `finalStatus !== "awaiting-archive"` に変更
- [x] `src/core/command/runner.ts`: `handleResult` 内の `finalState.status === "awaiting-merge"` を `finalState.status === "awaiting-archive"` に変更。ログメッセージも `"awaiting archive"` に更新
- [x] `src/core/cancel/runner.ts`: `state.status === "awaiting-merge"` を `state.status === "awaiting-archive"` に変更
- [x] `src/state/reconcile.ts`: `reconcilePrState` 内の `state.status !== "awaiting-merge"` を `state.status !== "awaiting-archive"` に変更。コメントも更新
- [x] `src/cli/ps.ts`: `"awaiting-merge"` の参照を `"awaiting-archive"` に変更（status filter values と表示ロジック）
- [x] `src/cli/command-registry.ts`: `job ls` の `status` flag の `values` 配列内の `"awaiting-merge"` を `"awaiting-archive"` に変更
- [x] `src/store/job-state-store.ts`: コメント内の `"awaiting-merge"` 参照を更新
- [x] `src/core/finish/job-state-update.ts`: コメント内の `awaiting-merge` 参照を更新
- [x] `src/core/lifecycle/__tests__/exit-guard.test.ts`: テスト内の `"awaiting-merge"` を `"awaiting-archive"` に変更
- [x] `src/logger/__tests__/pipeline-logger.test.ts`: テスト内の `"awaiting-merge"` を `"awaiting-archive"` に変更

**Acceptance Criteria**:
- `JobStatus` 型に `"awaiting-merge"` が存在しない
- `"awaiting-archive"` が `VALID_TRANSITIONS` / `VALID_STATUSES` に含まれる
- 永続化済み `"success"` / `"awaiting-merge"` status が load 時に `"awaiting-archive"` に remap される
- `bun run typecheck` が green

---

## T-02: ArchiveOrchestrator を新設する（client-closed）

- [x] `src/core/archive/orchestrator.ts` を新設
  - `ArchiveInput` 型: `slug`, `cwd`, `spawn`, `fs`, `worktreeManagerFn?` — **GitHubClient を含まない**
  - `ArchiveResult` 型: `{ exitCode: 0 } | { exitCode: 1; escalation: string } | { exitCode: 2; message: string }`
  - `runArchiveOrchestrator(input, stdoutWrite?)` 関数を export
- [x] Phase 0: job state load + `assertJobFinishable` gate（既存 `job-state-update.ts` を再利用）+ terminal status チェック
- [x] Phase 1: main checkout → `deriveAndWriteUsage` → `archiveChangeFolder` → `commitArchive` → `git push origin main`
  - main 上で実行するため、worktree がある場合は main cwd で操作する
  - push 先は `origin main`（feature branch ではない）
- [x] Phase 2: worktree 撤去（`WorktreeManager.remove` + `prune`）+ `worktreePath` null クリア + feature branch 削除（best-effort）
- [x] Phase 3: `markJobArchived` で status → archived（trigger を `"archive"` に変更）
- [x] `src/core/archive/orchestrator.ts` が `src/core/port/github-client.ts` / `src/kernel/github-client.ts` を import しないことを確認

**Acceptance Criteria**:
- `runArchiveOrchestrator` が change folder 移動・main commit+push・worktree 撤去・status archived を実行する
- orchestrator モジュールに GitHubClient への import / 依存がない
- job state が terminal の場合は no-op で exit 0

---

## T-03: --with-merge 用の merge-then-archive モジュールを新設する

- [x] `src/core/archive/merge-then-archive.ts` を新設
  - 既存 `pr-status.ts` の `pollMergeStateAfterPush` / `checkMergeableForMerge` と `orchestrator.ts` の `mergeFeaturePrPhase3` 相当のロジックを利用
  - `MergeThenArchiveInput` 型: `slug`, `cwd`, `spawn`, `fs`, `githubClient`, `owner`, `repo`, `baseBranch`, `sleepFn?`, `worktreeManagerFn?`
  - `runMergeThenArchive(input, stdoutWrite?)` 関数を export
- [x] 処理フロー:
  1. job state load → slug → PR number 解決
  2. PR status 確認（`getPullRequest`）
  3. 既に MERGED → archive orchestrator を直接呼ぶ
  4. mergeStateStatus polling → CLEAN でなければ escalation で停止
  5. CLEAN → squash merge 実行
  6. merge 成功 → archive orchestrator を呼ぶ
- [x] merge 成功直後に `markJobArchived` は呼ばない（archive orchestrator 内で行う）

**Acceptance Criteria**:
- `--with-merge` 時に CLEAN な PR を merge → archive まで一気通貫で実行できる
- BLOCKED / UNSTABLE / DIRTY の場合は merge せず escalation で停止する
- 既に MERGED の PR は merge スキップして archive のみ実行する

---

## T-04: CLI エントリ `src/cli/archive.ts` を新設する

- [x] `src/cli/archive.ts` を新設
  - `RunArchiveOptions` 型: `slug`, `withMerge`, `dryRun?`, `cwd`
  - `runArchive(opts): Promise<number>` を export
- [x] `--with-merge` なし: `runArchiveOrchestrator` を直接呼ぶ
- [x] `--with-merge` あり: GitHub token / owner / repo を解決し `runMergeThenArchive` を呼ぶ
- [x] pipeline log の初期化・記録（`initPipelineLog` / `logPipelineEvent` / `closePipelineLog`）
- [x] exit guard の登録（`registerExitGuard`）

**Acceptance Criteria**:
- `runArchive` が `--with-merge` の有無で適切な orchestrator を呼び分ける
- GitHub token 解決失敗時は exit 2 + エラーメッセージ

---

## T-05: command-registry に `job archive` を登録し `job finish` を deprecation handler に置き換える

- [x] `src/cli/command-registry.ts`: `job.subcommands` に `archive` を追加
  - positional: `"slug"` required
  - flags: `{ "with-merge": { type: "boolean" }, "dry-run": { type: "boolean" }, help: { type: "boolean" } }`
  - handler: `runArchive` を呼ぶ
- [x] `src/cli/command-registry.ts`: `job.subcommands.finish` の handler を deprecation メッセージに置き換え
  - stderr に `'job finish' は廃止されました。'job archive <slug>' を使ってください。` を出力
  - `--with-merge` を付ければ旧 finish と同等の動作になる旨のヒント
  - exit code 2
- [x] `src/cli/command-registry.ts`: `guardedSubcommands` Set に `"archive"` を追加（`"finish"` は残す）
- [x] `USAGE` 文字列の `job finish` 行を `job archive` に更新
- [x] `FINISH_USAGE` を `ARCHIVE_USAGE` に rename + 内容更新
- [x] `src/cli/finish.ts` の import を `archive.ts` に変更（または finish.ts は deprecation handler で不要になるなら import 削除）

**Acceptance Criteria**:
- `specrunner job archive <slug>` が動作する
- `specrunner job archive --with-merge <slug>` が動作する
- `specrunner job finish` が deprecation メッセージを出力し exit 2 で終了する
- `specrunner --help` の出力に `job archive` が表示される

---

## T-06: job-state-update.ts の trigger を archive 対応に更新

- [x] `src/core/finish/job-state-update.ts`: `markJobArchived` の trigger を `"finish"` から `"archive"` に変更
- [x] `src/core/finish/job-state-update.ts`: `STATUS_HINTS` の `"awaiting-merge"` key があれば `"awaiting-archive"` に変更
- [x] `assertJobFinishable` の関数名は変更しない（archive 時も finishable gate として使うため意味は共通）

**Acceptance Criteria**:
- `markJobArchived` の history entry の trigger が `"archive"` になる
- `assertJobFinishable` が `awaiting-archive → archived` 遷移を許可する

---

## T-07: skill ファイルを新コマンド構成に追従させる

- [x] `.claude/skills/rebase-finish/SKILL.md`: `specrunner job finish` → `specrunner job archive --with-merge` に置き換え。finish の内部処理説明を archive + merge 構成に更新
- [x] `.claude/skills/acceptance-and-issue-audit/SKILL.md`: `finish` / `awaiting-merge` の参照があれば更新

**Acceptance Criteria**:
- skill ファイル内に `job finish`（deprecation 説明以外）や `awaiting-merge` の参照が残っていない

---

## T-08: 既存テストの更新と typecheck / test green 確認

- [x] `src/core/lifecycle/__tests__/exit-guard.test.ts`: `"awaiting-merge"` → `"awaiting-archive"` に更新（T-01 で実施済みなら確認のみ）
- [x] `src/logger/__tests__/pipeline-logger.test.ts`: `"awaiting-merge"` → `"awaiting-archive"` に更新
- [x] `src/cli/__tests__/command-registry-resume.test.ts`: finish 関連の参照があれば更新
- [x] 全ソースで `awaiting-merge` の残存参照がないことを grep で確認（remap コメントを除く）
- [x] `bun run typecheck && bun run test` が green

**Acceptance Criteria**:
- `awaiting-merge` がソースコード（remap 処理のリテラル文字列以外）に残っていない
- `bun run typecheck && bun run test` が green
