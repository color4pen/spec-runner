# Tasks: git-transport-auth

## T-01: transport-auth モジュールを追加する（auth 引数ビルダー + SpawnFn wrapper）

- [x] `src/git/transport-auth.ts` を新規作成する
- [x] `buildTransportAuthArgs(token: string | undefined, originUrl: string | undefined): string[]` を実装する
  - token が空 / undefined、または `originUrl` が HTTPS でない（SSH / `ssh://` / `git@` / 解析不能）場合は `[]` を返す（D3）
  - HTTPS の場合、origin URL から `scope = "<scheme>://<host>/"` を導出する（埋め込み credential は除去。例 `https://github.com/`）
  - `["-c", "http.<scope>.extraheader=AUTHORIZATION: basic <base64('x-access-token:' + token)>", "-c", "credential.helper="]` を返す（D1/D2）
- [x] transport subcommand 集合 `TRANSPORT_SUBCOMMANDS = { fetch, push, clone, ls-remote, pull }` を定義する
- [x] `wrapTransportSpawn(base: SpawnFn /* util/spawn */, getAuthArgs: () => Promise<string[]>): SpawnFn` を実装する
  - `cmd === "git"` かつ第 1 引数（先頭の非 `-c` トークン）が transport subcommand のときだけ `["git", ...authArgs, ...originalArgs]` に書き換える
  - それ以外（非 transport git / 非 git）は素通し
- [x] `wrapTransportGitExecSpawn(base: SpawnFn /* util/git-exec */, getAuthArgs): SpawnFn` を git-exec シグネチャ向けに同等実装する
- [x] `createTransportAuth(opts: { token?: string; resolveOriginUrl?: () => Promise<string | undefined> }): { wrapSpawn; wrapGitExecSpawn; authArgs }` を実装する
  - origin URL 解決（既定は `git remote get-url origin`）と `buildTransportAuthArgs` の結果を **memo 化**する（複数 transport で 1 度だけ解決）
- [x] origin URL 解決ヘルパーは src/git/remote.ts の既存 `git remote get-url origin` 実行と重複しない形で実装/再利用する（生 URL + scheme 判定のみ必要）

**Acceptance Criteria**:
- `buildTransportAuthArgs` は token 不在 / 非 HTTPS で `[]`、HTTPS + token で host スコープの `-c http.<scope>.extraheader=...basic...` と `-c credential.helper=` を返す
- wrapper は transport subcommand のみ auth 引数を前置し、add/commit/diff/rev-parse/branch -D 等は不変
- 生成される引数に remote URL 書き換え・`git config` 書き込みが一切含まれない

## T-02: LocalRuntime の transport を認証する

- [x] `LocalRuntime` で `createTransportAuth({ token: this.githubToken })` の provider を構築する
- [x] workspace setup の `git fetch origin`（src/core/runtime/local.ts:424）が wrap 済み spawn を使うようにする（C1）
- [x] `commitFinalState` 呼び出し（local.ts:595 / commit-push.ts:121,124）が wrap 済み spawn を使うようにする（C6）
- [x] `buildDeps` の `spawn`（現状 `spawnCommand` ハードコード, local.ts:539）を wrap 済み spawn に差し替える（C7: verification propagate が `deps.spawn` を使うため）
- [x] `PipelineDeps` に git-exec transport spawn を渡す field（例 `gitTransportSpawn?: GitExecSpawnFn`）を追加し、`buildDeps` で `wrapTransportGitExecSpawn(defaultSpawnFn, provider)` を設定する
- [x] `src/core/pipeline/run.ts` の `buildPipeline` で `new StepExecutor(bus, runner, deps.storeFactory, deps.gitTransportSpawn)` のように wrap 済み git-exec spawn を `StepExecutor` に注入する（C5: commit-push `pushOnly`）
- [x] 非 transport の `this.spawnFn` 利用箇所（status / checkout / add / commit 等）は挙動を変えないことを確認する

**Acceptance Criteria**:
- C1, C5, C6, C7 が解決済みトークンの `extraheader` で実行される
- managed では変更が及ばない（local 専用の wiring）
- 非 transport git 操作の挙動が不変

## T-03: ManagedRuntime のローカル transport を認証する

- [x] `ManagedRuntime` で `createTransportAuth({ token: this.githubToken })` provider を構築し `this.spawnFn` を wrap する
- [x] `validateStepInputs` の `git fetch origin <branch>`（managed.ts:357, `.catch` 維持）を wrap 済み spawn にする（C2）
- [x] setup の `git push origin <branchName>`（managed.ts:154）を wrap 済み spawn にする（C3）
- [x] request.md commit 後の `git push origin <branchName>`（managed.ts:215）を wrap 済み spawn にする（C4）
- [x] checkout / add / commit など非 transport の `this.spawnFn` 利用は不変であることを確認する

**Acceptance Criteria**:
- C2, C3, C4 が解決済みトークンの `extraheader` で実行される
- C2 の best-effort（`.catch(() => {})`）セマンティクスが維持される
- クラウド側 workspace の transport には手を入れない（Non-Goals 準拠）

## T-04: archive orchestrator の push を認証する

- [x] `ArchiveInput`（src/core/archive/orchestrator.ts:30）に `githubToken?: string` を追加する
- [x] `src/cli/archive.ts` で既に解決済みの `githubToken`（archive.ts:170-186）を `runArchiveOrchestrator` / `runMergeThenArchive` に渡す
- [x] orchestrator 内で `createTransportAuth({ token })` provider を構築し `spawn` を wrap する
- [x] `git push origin <baseBranch>`（orchestrator.ts:240, 必須）を wrap 済み spawn にする（C8）
- [x] `git push origin --delete <branch>`（orchestrator.ts:293, best-effort warn）を wrap 済み spawn にする（C9）
- [x] commit / add / branch -D 等の非 transport は不変であることを確認する

**Acceptance Criteria**:
- C8, C9 が解決済みトークンの `extraheader` で実行される
- C8 失敗時の既存 escalation メッセージ経路が維持される
- C9 失敗時は従来どおり warning で続行する

## T-05: cancel の remote branch 削除 push を認証する

- [x] `CancelDeps`（src/core/cancel/runner.ts:42）に `githubToken?: string` を追加する
- [x] `src/cli/cancel.ts` で `resolveGitHubToken` を **optional** に呼ぶ（不在時は `undefined` にフォールバックし cancel を止めない）
- [x] 解決した（または `undefined` の）トークンを `cancelSingleJob` / `cancelAllTerminated` 経由で `CancelDeps.githubToken` に渡す
- [x] cleanup の `git push origin --delete <branch>`（runner.ts:184, best-effort）を `createTransportAuth({ token })` で wrap 済み spawn にする（C10）
- [x] token が `undefined` の場合は `buildTransportAuthArgs` が `[]` を返し、素の push（従来の best-effort warning）になることを確認する

**Acceptance Criteria**:
- token 解決時、C10 が `extraheader` で認証される
- token 未解決でも cancel のローカル後始末（worktree 削除・local branch 削除・状態遷移）が完了する
- C10 失敗時は従来どおり warning に集約される

## T-06: トークンがログ・永続状態に残らないことを担保する

- [x] transport call site / 診断ログが構築済み argv（auth `-c` 引数を含む）を出力しないことを確認する（既存エラーは stderr のみ連結で安全 / D5）
- [x] `SPECRUNNER_DEBUG` 系の診断出力が auth 引数を含めないことを確認・必要なら除外する
- [x] 既存 secret masking 層がトークン値（および base64 形）を出力時にマスクすることを defense-in-depth として確認する

**Acceptance Criteria**:
- 失敗時ログにトークン平文 / base64 / `extraheader` 引数値が現れない
- 永続 git config・remote URL にトークンが書かれない

## T-07: テスト

- [x] `src/git/transport-auth.ts` の単体テスト
  - `buildTransportAuthArgs`: token 不在 → `[]` / 非 HTTPS（SSH）→ `[]` / HTTPS + token → host スコープの `extraheader` + `credential.helper=`（base64 値検証）
  - wrapper: `git fetch`/`push`/`ls-remote` は auth 前置、`git add`/`commit`/`rev-parse`/`branch -D` と非 git は素通し
  - `createTransportAuth`: origin URL 解決が memo 化され複数回 transport でも 1 度だけ解決される
- [x] 各 wiring point の回帰テスト（注入 fake spawn が argv を捕捉）
  - local fetch / commit-push pushOnly / propagate / archive main push / cancel delete push が `-c http.<scope>.extraheader=...` を含む argv で呼ばれる
  - 非 HTTPS origin では auth 引数が付かない
  - いずれの経路でも `git config`（remote URL 書き換え含む）を呼ばない
- [x] best-effort セマンティクス維持の回帰（cancel: token undefined でも local 後始末完走 / propagate・C9 失敗で warning 続行）
- [x] `bun run typecheck` が green
- [x] `bun run test` が green

**Acceptance Criteria**:
- ambient git 認証が無い前提（credential.helper 未設定・keychain 非アクセス）で fetch / push が解決済みトークンで成功する経路がテストで固定される
- ユーザー git config / remote URL を変更しないことがテストで固定される
- トークンがログに残らないことがテストで固定される
- `typecheck && test` が green
