# Tasks: `.specrunner/jobs/` への読み取り依存を slug/sidecar 起点に移行する

## T-01: sidecar index helper を追加する（D1）

- [x] `src/store/local-job-index.ts` を新設する（`fs` + `src/util/paths.ts` のみ依存。`core/` を import しない）。
  - [x] `LocalSidecarEntry = { slug: string; jobId: string; worktreePath: string | null; kind: "local" | "managed" }` を定義する。
  - [x] `listLocalSidecars(repoRoot): Promise<LocalSidecarEntry[]>` — `.specrunner/local/*` を 1 度 readdir し、各 slug dir で `liveness.json`（`kind="local"`）を読む。無ければ `marker.json`（`kind="managed"`）を読む。`jobId` を持たない / 壊れた / 不在の sidecar は skip。ENOENT（base 不在）は空配列。
  - [x] `resolveJobIdToSlug(repoRoot, jobId): Promise<LocalSidecarEntry | null>` — `listLocalSidecars` から `jobId` 一致の entry を返す（無ければ `null`）。
- [x] `.specrunner/local` base ディレクトリの列挙に使うパスは `src/util/paths.ts` のヘルパー経由にする（必要なら `localSidecarBaseDir()` を追加）。`localSidecarDir` / `livenessJsonPath` / `managedMarkerPath` を再利用する。

**Acceptance Criteria**:
- `listLocalSidecars` が local の `liveness.json` と managed の `marker.json` の双方から `{ slug, jobId, worktreePath, kind }` を返す。
- `resolveJobIdToSlug` が sidecar に存在する jobId を slug / worktreePath に解決し、不在時に `null` を返す（throw しない）。
- helper が `src/core/` を import しない（store 最下層の依存関係を保つ）。

## T-02: `JobStateStore.list()` から local jobs-dir スキャン（旧 section 3）を撤去する（D2）

- [x] `src/store/job-state-store.ts` の `list()` から legacy jobs-dir スキャン区画（`getJobsDir(repoRoot)` の `fs.readdir` → split-layout subdir + flat `<jobId>.json` の走査と `tryMerge` / `Skipping malformed ...` 出力）を削除する。
- [x] current checkout active（section 1）/ archived（section 1b）/ local worktrees（section 2）/ managed marker → jobs-dir（section 4）は不変で残す。section 4 が jobs-dir の **readdir** を行わないことを確認する（特定 jobId の `readFile` のみ）。
- [x] sidecar index（T-01）を local の index として組み込む: `listLocalSidecars` の `kind="local"` entry のうち未 merge（jobId が `stateMap` に未登録）のものについて、`worktreePath` の `specrunner/changes/<slug>/state.json`（active）→ `resolveCanonicalStateDir(slug, repoRoot)`（archived / main-checkout）の順で state 本体を解決し、解決できた場合のみ `tryMerge` する。どこにも無い entry は full state を作らず skip する（jobId は T-03 の `resolveId` 側で保持）。
- [x] dedup（jobId / newest `updatedAt`）の挙動を不変に保つ。

**Acceptance Criteria**:
- `list()` 実行中に `fs.readdir(getJobsDir(repoRoot))`（local split-layout スキャン）が呼ばれない。
- active local job（worktree あり、別ブランチ含む）が従来どおり `list()` に現れる。
- archived local job（`changes/archive/<dated>-<slug>/`）が従来どおり現れる。
- active managed job（marker あり）が section 4 経由で従来どおり現れる。

## T-03: `resolveId()` を sidecar index + slug 状態の合併候補にする（D3）

- [x] `src/store/job-state-store.ts` の `resolveId(repoRoot, prefix)` で、full UUID（36 文字）素通しは不変のまま、候補 jobId 集合を **`list()` の jobId 群 ∪ `listLocalSidecars`（T-01）の jobId 群**にする（dedup）。
- [x] `prefix` で `startsWith` 絞り込み: 0 件 → `JOB_NOT_FOUND`、1 件 → 確定、2 件以上 → `AMBIGUOUS_JOB_ID`（候補 jobId を hint に）。既存エラー contract を不変に保つ。

**Acceptance Criteria**:
- worktree 削除済み・未 archive でも sidecar に jobId を持つ local job が prefix 解決できる。
- active / archived / managed の job は従来どおり解決できる。
- `resolveId` 実行中に `fs.readdir(getJobsDir(repoRoot))` が呼ばれない。
- 0 / 1 / 2+ 件の分岐とエラーコードが既存どおり。

## T-04: jobId → slug → slug-dir の load helper を追加する（D4）

- [x] core 層に `loadStateByJobId(repoRoot, jobId): Promise<NormalizedJobState>` を追加する（store + `resolveCanonicalStateDir` を束ねられる位置。例: `src/core/job-access/load-by-job-id.ts`）。
  - [x] `resolveJobIdToSlug`（T-01）で sidecar entry を解決する。
  - [x] `kind="local"`: `worktreePath/specrunner/changes/<slug>/state.json` が存在すれば `new JobStateStore(jobId, repoRoot, { slug, stateRoot: worktreePath }).load()`。無ければ `resolveCanonicalStateDir(slug, repoRoot)` を `{ slug, stateRoot: repoRoot, changeDir: dir }` に渡して `load()`。
  - [x] `kind="managed"`: `new JobStateStore(jobId, repoRoot).load()`（jobs-dir。managed スコープ温存）。
  - [x] sidecar 不在 or local で state dir 解決不能: `new JobStateStore(jobId, repoRoot).load()`（jobs-dir + legacy flat の fallback readFile。撤去しない安全網）。
- [x] この helper は **読み取りのみ**。persist は一切行わない。

**Acceptance Criteria**:
- active local job の jobId を渡すと worktree slug dir から `NormalizedJobState` を返す。
- archived local job の jobId を渡すと `changes/archive/` の slug dir から返す。
- managed job の jobId を渡すと jobs-dir から返す（温存）。
- sidecar 不在の旧 job でも fallback readFile で load できる。

## T-05: local runtime state-read caller を helper 経由に移行する（D4）

- [x] `src/cli/job-show.ts` — UUID branch の `new JobStateStore(input, repoRoot).load()` を `loadStateByJobId(repoRoot, input)` に置換する。ENOENT / not-found のエラー表示挙動を維持する。
- [x] `src/core/cancel/runner.ts` — `cancelSingleJob` の `new JobStateStore(jobId, deps.repoRoot).load()` を `loadStateByJobId` に置換する。後続の cleanup / `transitionJob` / persist（jobId ストアへの write）は**不変**。
- [x] `src/core/command/resume.ts` — slug 解決失敗時の resolveId fallback の `new JobStateStore(fullId, cwd).load()` を `loadStateByJobId` に置換する。以降の status gate / persist（write）は不変。
- [x] `src/core/finish/resolve-target.ts` — `resolveByJobId` の `new JobStateStore(jobId, repoRoot).load()` を `loadStateByJobId` に置換する。
- [x] 各 caller で persist / dual-write には触れないことを確認する（read のみの移行）。

**Acceptance Criteria**:
- `job show <jobId>` / `job cancel <jobId>` / `resume <jobId>` が sidecar（`liveness.json` / `marker.json`）経由で `jobId → slug` を解決して state を表示・操作できる。
- archive の `resolve-target`（`resolveByJobId`）が slug 経由で load する。
- 各 caller の書き込み（dual-write / jobId ストア persist）の挙動が不変。

## T-06: archive Phase 2 の worktreePath クリアを sidecar へ repoint する（D5）

- [x] `src/core/archive/orchestrator.ts` Phase 2 の worktree 削除後に行う `new JobStateStore(jobId, cwd)` load → `persist({ ...current, worktreePath: null })` を撤去し、代わりに **sidecar（`liveness.json`）の `worktreePath` を `null` に更新**する isolated な読み書きにする。
  - [x] `livenessJsonPath(slug)` を `readFile` → JSON parse → `worktreePath: null` → `writeFile`。ENOENT / parse 失敗は best-effort で無視（warn 任意）。
  - [x] jobId ストアの read/write を Phase 2 から無くす。dual-write 本体・他 Phase の persist には触れない。

**Acceptance Criteria**:
- archive Phase 2 で jobId ストア（`.specrunner/jobs/<jobId>/`）の read/write が発生しない。
- 同 job の sidecar `liveness.json` の `worktreePath` が `null` に更新される（sidecar 不在時は no-op）。
- archive の正常系 / 冪等再実行の exit code・最終 status（`archived`）が不変。

## T-07: テストを更新・追加する

- [x] 統合テスト（AC1）: `fs.readdir` を spy し、`JobStateStore.list()` / `resolveId()` 実行で `getJobsDir(repoRoot)` の readdir（旧 section 3）が呼ばれないことをアサートする。managed の section 4 は対象外。
- [x] `tests/resolve-job-id.test.ts`（TC-02/04/05）: jobs-dir-only セットアップを新 index モデルに更新する（`create()` 後に `.specrunner/local/<slug>/liveness.json` を併置し、`resolveId` が sidecar 経由で jobId を解決することを検証）。full UUID 素通し（TC-01）と 0/2+ 件分岐は不変。
- [x] `tests/state-store.test.ts`（TC-047 corrupt-skip）: 壊れ state の skip 検証を jobs-dir flat file から worktree / archive slug 状態の壊れケースへ移す（あるいは新 index 経路の壊れケースに置き換える）。`list()` が正常 job を返しつつ壊れケースを skip することを固定する。
- [x] caller test 更新: `job show` / `job cancel` / `resume` / archive `resolve-target` の jobId load が sidecar→slug 経由で解決することを検証する（active=worktree、archived=archive、managed=jobs-dir の各経路）。
- [x] cross-branch / managed 可視性（AC3）: 別ブランチ上の local active job（worktree あり）が `list()` に出ること、active managed job（marker あり）が出ることを固定する。
- [x] dual-write 不変（AC4）: run / cancel / resume で jobId ストアへの書き込みが従来どおり発生することを回帰テストで確認する。
- [x] archive Phase 2（T-06）: jobId ストアへ触れず sidecar の worktreePath が `null` になることを検証する。

**Acceptance Criteria**:
- 追加・更新した test が green。
- spec.md の各 Scenario に対応する検証が存在する。

## T-08: 検証を green にする

- [x] `bun run typecheck` が pass。
- [x] `bun run test` が pass。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
