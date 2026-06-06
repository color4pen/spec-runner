# Tasks: managed runtime の machine-local state を slug キーに移す

> 各タスクは design.md の Decisions（D1–D6）に対応する。順序は依存関係を反映（path → store seam → managed → read/resolve → cancel → docs → tests → verify）。

## T-01: local/slug の state path helper を追加する（D1）

- [x] `src/util/paths.ts`: `localSlugStateJsonPath(slug: string): string` を追加（`${LOCAL_SIDECAR_BASE}/${slug}/state.json` = `.specrunner/local/<slug>/state.json`）。
- [x] `src/util/paths.ts`: `localSlugEventsPath(slug: string): string` を追加（`${LOCAL_SIDECAR_BASE}/${slug}/events.jsonl`）。
- [x] 既存の `localSidecarDir` / `managedMarkerPath` と同じ `LOCAL_SIDECAR_BASE` 定数を使う。他 src module を import しない（TC-034 制約を維持）。

**完了条件**:
- 2 helper が相対パスを返す純粋関数として存在する。

## T-02: `JobStateStore.load()` が `changeDir` を slug-mode と独立に尊重する（D2）

- [x] `src/store/job-state-store.ts` `load()`: 分岐条件 `if (this.isSlugMode())` を `if (this.changeDir || this.isSlugMode())` に変更する。
- [x] 同分岐内の `loadSplitLayout(...)` 呼び出しで、`slugInject` 引数は `this.isSlugMode()` の時のみ `{ slug: this.slug!, stateRoot: this.stateRoot! }` を渡し、`changeDir` 単独時は `undefined` を渡す。
- [x] `getStateJsonPath()` / `getEventsPath()` / `persist()` は変更不要（`changeDir` を既に反映）。

**完了条件**:
- `changeDir` 単独構成のストアが `load()` で `changeDir/state.json` + `events.jsonl` を読む。
- 既存の `changeDir` + slug + stateRoot（`isSlugMode()` true）利用箇所の挙動が不変。

## T-03: `ManagedRuntime` の全 persist 経路を local/slug へ向ける（D1 / D3 / D5）

- [x] `src/core/runtime/managed.ts`: private helper `managedLocalStore(jobId: string, slug: string): JobStateStore` を追加し、`new JobStateStore(jobId, this.cwd, { changeDir: path.join(this.cwd, localSidecarDir(slug)) })` を返す（slug / stateRoot は渡さない＝ full state 保持）。`localSidecarDir` を `../../util/paths.js` から import。
- [x] `bootstrapJob()`: `JobStateStore.create(repoRoot, params)` をやめ、`buildInitialJobState(params)` を返す I/O なし実装にする（`buildInitialJobState` を `../../store/job-state-store.js` から import）。
- [x] `setupWorkspace()`（run 経路 = branchName あり）: 最初の `updateJobState` より前に `opts.bootstrapState` を `managedLocalStore(jobId, slug).persist(opts.bootstrapState)` で seed する（fresh write）。`opts.bootstrapState` 不在時は seed をスキップ（防御。pipeline-run は run 経路で常に設定）。
- [x] `setupWorkspace()`（resume 経路 = branchName なし）: seed しない（既存）。marker write のみ（現状維持）。
- [x] `updateJobState(jobId, mutator)`: `new JobStateStore(jobId, this.cwd)` を `managedLocalStore(jobId, this.currentSlug!)` に置換（`setupWorkspace` で `currentSlug` 設定後にのみ呼ばれる）。
- [x] `persistJobState(jobId, slug, _workspace, state)`: `new JobStateStore(jobId, this.cwd).persist(state)` を `managedLocalStore(jobId, slug).persist(state)` に置換。
- [x] `buildDeps()` の `storeFactory`: `(id) => new JobStateStore(id, this.cwd)` を `(id) => managedLocalStore(id, slug)` に置換（`buildDeps` の `slug` 引数を捕捉）。
- [x] `registerCleanup()` の `signalCleanup`: `new JobStateStore(jobId, cwd)` を `managedLocalStore(jobId, slug)`（`slug = this.currentSlug`）に置換。`slug` が null の場合は best-effort skip（既存の try/catch 内）。
- [x] `writeManagedMarker()`: 書き込む JSON を `{ slug, jobId, createdAt }` に変更（`status` フィールドと `activeStatus` 回避 hack を削除）。

**完了条件**:
- managed の run / resume / step persist / signal persist のいずれも `.specrunner/local/<slug>/` に書き、`.specrunner/jobs/<jobId>/` には書かない。
- `.specrunner/local/<slug>/state.json` が full state（pid / session / request.slug / request.path 等を strip せず保持）。
- marker.json が `{ slug, jobId, createdAt }`。

## T-04: `JobStateStore.list()` の managed 経路を local/slug から読む（D4）

- [x] `src/store/job-state-store.ts` `list()` section 4: 各 marker の jobId に対する load 元を、`getJobStateJsonPath(repoRoot, markerJobId)` / `getJobEventsPath(repoRoot, markerJobId)`（jobs-dir）から `path.join(repoRoot, localSlugStateJsonPath(slug))` / `path.join(repoRoot, localSlugEventsPath(slug))`（同 slug ディレクトリ）へ変更する。
- [x] marker 列挙（`.specrunner/local/*` の readdir）・dedup（jobId / newest updatedAt）・best-effort skip は不変。
- [x] `localSlugStateJsonPath` / `localSlugEventsPath` を import に追加。

**完了条件**:
- managed marker → 同ディレクトリ state.json から正しい status の state が得られ、jobs-dir を参照しない。

## T-05: job-access の managed 分岐を local/slug へ向ける（D4）

- [x] `src/core/job-access/load-by-job-id.ts` `kind="managed"`: `new JobStateStore(jobId, repoRoot).load()` を `new JobStateStore(jobId, repoRoot, { changeDir: path.join(repoRoot, localSidecarDir(sidecarEntry.slug)) }).load()` に置換。`localSidecarDir` を import。
- [x] `src/core/job-access/resolve-state-store.ts` `kind="managed"`: `new JobStateStore(jobId, repoRoot)` を同様の `changeDir` 単独ストアに置換。
- [x] no-sidecar 安全網（末尾 / step 4 の jobId ストア fallback）は legacy 用に温存（変更しない）。

**完了条件**:
- managed の `loadStateByJobId` / `resolveStateStoreByJobId` が `.specrunner/local/<slug>/` を起点にし、jobs-dir を参照しない。

## T-06: cancel の managed marker clear を persist 後に行う（D6）

- [x] `src/core/cancel/runner.ts` `cleanupJobResources`: managed marker unlink ブロック（step 3）を**切り出す**。worktree prune / worktree remove / branch 削除は persist 前のまま維持。
- [x] `cancelSingleJob`: canceled-state persist（`resolveStateStoreByJobId` → persist）の**後**に、切り出した managed marker unlink を best-effort で実行する（idempotent canceled 経路でも末尾で実行）。
- [x] `--purge`: 既存の `JobStateStore.delete(repoRoot, jobId)` に加え、`fs.rm(path.join(repoRoot, localSidecarDir(slug)), { recursive: true, force: true })` で `.specrunner/local/<slug>/` を best-effort 削除（`slug = getJobSlug(state)`、空文字なら skip）。

**完了条件**:
- managed cancel が canceled state を `.specrunner/local/<slug>/` へ persist し、その後 marker を clear する（jobs-dir に書かない）。
- local cancel の挙動（worktree 削除後の degraded skip）が不変。
- managed `--purge` で `.specrunner/local/<slug>/` が削除される。

## T-07: ドキュメント/コメントの整合（D3 / D5）

- [x] `src/core/port/runtime-strategy.ts`: `bootstrapJob` / `persistJobState` の doc コメントの managed 記述を更新（managed も jobs-dir に書かない／bootstrap は I/O なし／persist は local/slug）。
- [x] `src/store/local-job-index.ts`: marker.json のスキーマ記述コメントを `{ slug, jobId, createdAt }` に更新（読取りロジックは jobId のみ参照のため不変）。

**完了条件**:
- port / index のコメントが実装と一致する。

## T-08: 旧 jobs-dir 前提の既存テストを local/slug 起点へ更新する

> 新規シナリオの test 追加は test-case-gen / implementer が担当。ここでは本変更で破綻する既存テストの修正を列挙する。

- [x] `tests/unit/core/runtime/managed.test.ts`:
  - `makeJobStateForManaged`（`JobStateStore.create` で jobs-dir に seed）を、対象テストが期待する local/slug seed へ更新（または setupWorkspace 経由の seed に合わせる）。
  - TC-07（`new JobStateStore(jobId, tempDir).load()` で request.path 検証）を local/slug ストア（`changeDir`）からの load に更新。
  - TC-036（marker `status === "running"` を 3 箇所でアサート）から `status` アサートを除去し、`{ slug, jobId, createdAt }` を検証する形に更新。
- [x] `tests/load-by-job-id.test.ts` TC-023（managed が jobs-dir から load）: local/slug への state 配置 + load 期待に更新。
- [x] `tests/unit/core/job-access/resolve-state-store.test.ts` TC-024（kind=managed → jobId ストア）: `changeDir`（local/slug）ストアを返す期待に更新。
- [x] その他、managed が jobs-dir に書く/読むことをアサートするテストがあれば local/slug へ更新（`bun run test` の失敗を起点に洗い出す）（`tests/jobs-dir-no-readdir.test.ts` TC-038/039 も更新済み）。

**完了条件**:
- 更新後のテストが本変更の挙動（local/slug 起点・marker index 化）を検証する。

## T-09: 検証（受け入れ基準）

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。
- [x] managed run / resume 後、state が `.specrunner/local/<slug>/` に書かれ `.specrunner/jobs/<jobId>/` には書かれないことを確認。
- [x] `job ls` / `job show` / `cancel` / `resume` が managed job を `.specrunner/local/<slug>/` 起点で扱うことを確認。
- [x] managed の読み取り・解決経路で `.specrunner/jobs/` を参照しないことを確認。
- [x] `.specrunner/local/<slug>/marker.json` が index（`{ slug, jobId, createdAt }`）として残り、同ディレクトリ `state.json` の `jobId` と一致することを確認。

## T-10: ADR 起票（後続ステップ）

- [ ] 本変更の設計判断（machine-local state の slug キー化 / `changeDir` を full-state seam として使用 / marker の index 化 / cancel の clear 順序変更）を ADR 化する（`adr: true`）。
