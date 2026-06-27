# Tasks: cancel-canceled-dir

## T-01: `canceled/` パスヘルパーを `src/util/paths.ts` に追加する

対象ファイル: `src/util/paths.ts`

- [x] `archive` 系ヘルパー（`archivedChangesDirRel` / `archivedChangeFolderPath`）の近くに、`canceled` 系ヘルパーを追加する。
  - [x] `canceledChangesDirRel(): string` → `"specrunner/changes/canceled"` を返す（`CHANGES_DIR` を再利用、定数 `CANCELED_DIR = \`${CHANGES_DIR}/canceled\`` を追加）。
  - [x] `canceledChangeFolderPath(dirName: string): string` → `\`${CANCELED_DIR}/${dirName}\`` を返す。
  - [x] `canceledDirName(slug: string, jobId: string): string` → `\`${slug}-${jobId.slice(0, 8)}\`` を返す（`buildWorktreePath` と同一の `slice(0, 8)` 粒度）。
- [x] 各ヘルパーに JSDoc コメント（例つき）を付ける。
- [x] このファイルは他の `src/` モジュールを import しない制約（既存 TC-034）を維持する（純粋関数のみ）。

**Acceptance Criteria**:

- `canceledChangesDirRel()` が `"specrunner/changes/canceled"` を返す。
- `canceledChangeFolderPath("foo-1234abcd")` が `"specrunner/changes/canceled/foo-1234abcd"` を返す。
- `canceledDirName("foo", "1234abcd-aaaa-bbbb-cccc-ddddeeeeffff")` が `"foo-1234abcd"` を返す。
- `src/util/paths.ts` が引き続き他 `src/` モジュールを import していない。

---

## T-02: `JobStateStore.list` の `changes/` スキャンで `canceled/` を予約名として skip する

対象ファイル: `src/store/job-state-store.ts`

- [x] section 1（`specrunner/changes/*` を slug dir として走査するループ、job-state-store.ts:222-235 付近）の skip 条件 `entry.name === "archive"` を `entry.name === "archive" || entry.name === "canceled"` に変更する。
- [x] コメントで `canceled/` も `archive/` と同じ予約サブディレクトリであることを明記する。

**Acceptance Criteria**:

- `specrunner/changes/canceled/` が存在しても `JobStateStore.list` が `canceled` という名の slug を走査せず、例外なく完了する。
- 既存の `archive` skip 挙動は変わらない（回帰なし）。

---

## T-03: 退避ロジック `evacuateChangeFolder` を `src/core/cancel/runner.ts` に追加する

対象ファイル: `src/core/cancel/runner.ts`

- [x] 退避元 change-folder の物理ディレクトリを解決する内部ヘルパーを追加する。解決順は `load-by-job-id.ts` と同じ:
  1. worktree slug dir: `resolveWorktreePathForJob(state, repoRoot)` で得た `worktreePath` が非 null なら `path.join(worktreePath, changeFolderPath(slug))`（`fs.access` で存在確認）。
  2. canonical: `resolveCanonicalStateDir(slug, repoRoot)`（active `changes/<slug>/` または `archive/<dated>/`）。
  3. managed sidecar: `path.join(repoRoot, localSidecarDir(slug))`（`fs.access` で存在確認）。
  - いずれも該当しなければ `null` を返す。
- [x] 退避先ディレクトリの絶対パスを `path.join(repoRoot, canceledChangeFolderPath(canceledDirName(slug, state.jobId)))` で算出する。
- [x] `evacuateChangeFolder(state, deps, warnings)` を実装する:
  - [x] `getJobSlug(state)` で slug を導出。空なら warning を積んで return（退避先を作れない）。
  - [x] 退避先の親（`canceledChangesDirRel()` 相当の絶対パス）を `fs.mkdir(..., { recursive: true })` で作成。
  - [x] 退避元ディレクトリが解決できたら、退避先へ `fs.cp(sourceDir, destDir, { recursive: true })` で再帰コピー（既存 `copy-artifacts.ts` の `fs.cp` パターンに倣う）。失敗時は warning を積む（throw しない）。
  - [x] 退避元が解決できない場合は warning を積み、退避先ディレクトリ（`destDir`）だけ `fs.mkdir` で用意して return（後続 persist が fresh write できるように）。
  - [x] 退避先絶対パス（`destDir`）を呼び出し側が persist に使えるよう return する。
- [x] 退避は best-effort：内部のいかなる失敗も throw せず warning に集約する（cleanup 系ヘルパーと同じ方針 / runner.ts:153 のコメント参照）。

**Acceptance Criteria**:

- 退避元が worktree slug dir のとき、`canceled/<slug>-<jobId8>/` に change-folder の全ファイルが再帰コピーされる。
- 退避元が解決できないとき、warning を積みつつ `canceled/<slug>-<jobId8>/` 空ディレクトリを用意して return する（throw しない）。
- `slug` が空のときは warning を積んで安全に return する。

---

## T-04: `cancelSingleJob` を再配線する（退避 → cleanup → 退避先へ persist）

対象ファイル: `src/core/cancel/runner.ts`

- [x] 処理順を次に整える（runner.ts:271-305 付近）:
  1. kill（running、現状維持）
  2. restore-draft（opt-in、現状維持 / cleanup 前）
  3. **退避**: `status !== "canceled" && !purge` のとき `evacuateChangeFolder(...)` を呼び、退避先絶対パス `canceledDirAbs` を得る（**cleanup の前**）。
  4. cleanup: `cleanupJobResources(...)`（worktree 撤去 + local/remote branch 削除、現状維持）。
  5. **canceled persist**: `status !== "canceled" && !purge` のとき、`transitionJob(state, "canceled", { trigger: "cancel", reason: "Canceled by user", patch: { error: { code: USER_CANCELED, ... }, canceledAt, worktreePath: null } })` の結果を `new JobStateStore(state.jobId, deps.repoRoot, { changeDir: canceledDirAbs }).persist(updated)` で退避先へ直接書き込む。
  6. marker unlink（現状維持 / runner.ts:307-320）
  7. purge（現状維持 / runner.ts:322-338）
- [x] `resolveStateStoreByJobId` 経由の persist（runner.ts:301-304）を削除する。未使用になった `resolveStateStoreByJobId` の import を削除する。
- [x] `--purge` 時は退避も canceled persist も行わない（machine-local sidecar 削除のみ）。`status === "canceled"`（冪等）時も退避・persist をスキップし、cleanup と marker unlink のみ実行する（現挙動踏襲）。
- [x] 新規に必要な import（`changeFolderPath` / `canceledChangeFolderPath` / `canceledDirName` / 退避ヘルパー、既存の `resolveCanonicalStateDir` / `localSidecarDir` / `JobStateStore` など）を追加・整理する。
- [x] `worktreePath: null` パッチは退避先 state にも引き継ぐ（現状維持）。

**Acceptance Criteria**:

- worktree-only local ジョブを cancel すると、退避先 `canceled/<slug>-<jobId8>/state.json` に `status=canceled` / `error.code=USER_CANCELED` / `canceledAt` が記録される。
- cleanup（worktree 撤去 + branch 削除）が引き続き実行される。
- `--purge` 時は `canceled/` に何も作られず、`.specrunner/local/<slug>/` が削除される。
- `status === "canceled"` の再 cancel は退避・persist を行わず冪等（cleanup / marker unlink のみ）。
- `resolveStateStoreByJobId` の import が runner.ts から消え、未使用 import の typecheck エラーが無い。

---

## T-05: `.gitignore` に `canceled/` を追加する

対象ファイル: `.gitignore`

- [x] `specrunner/changes/canceled/` を ignore する行を追加する（退避物を git の追跡対象に入れない）。
- [x] `specrunner init` が管理する `.specrunner/*` + `!.specrunner/config.json` ブロックは変更しない（独立した行として追加する）。
- [x] 何のための行か分かる短いコメントを付ける（例: `# Canceled job gravestones (local reference only)`）。

**Acceptance Criteria**:

- `.gitignore` に `specrunner/changes/canceled/` が含まれる。
- 既存の `.specrunner/*` / `!.specrunner/config.json` の 2 行構成が壊れていない。

---

## T-06: cancel runner テストを worktree-only 再現へ作り直し、退避を固定する

対象ファイル: `tests/unit/core/cancel/runner.test.ts`

- [x] `makeJob` を **worktree-only レイアウト**に作り直す（canonical 直書きの穴を塞ぐ）:
  - [x] state.json / events.jsonl を **worktree 内** `<worktreeDir>/specrunner/changes/<slug>/` に書く。`worktreeDir = extras.worktreePath ?? buildWorktreePath(tempDir, slug, jobId)`。
  - [x] main checkout（`tempDir/specrunner/changes/<slug>/`）への canonical state 直書きは**やめる**（worktree-only 再現の要）。
  - [x] liveness sidecar（`.specrunner/local/<slug>/liveness.json`）の `worktreePath` を `worktreeDir` に設定する（`resolveJobIdToSlug` 経由で worktree slug dir が解決されるように）。
  - [x] worktree 内 change-folder に `request.md` を書く（退避コピー対象を用意）。内容は固定文字列で可。
  - [x] `slug` を明示指定できるオプション引数を追加する（同名 slug 衝突テスト用）。未指定時は従来どおり `cancel-${jobId.slice(0,8)}`。
- [x] 退避先 state を読むヘルパー `loadCanceledState(jobId, slug)` を追加する: `new JobStateStore(jobId, tempDir, { changeDir: path.join(tempDir, canceledChangeFolderPath(canceledDirName(slug, jobId))) }).load()`。
- [x] worktree 内 state を読むヘルパー（冪等ケース用）`loadWorktreeState(jobId, slug, worktreeDir)` を追加する（`{ slug, stateRoot: worktreeDir }` で load）。
- [x] 既存の status 遷移テスト（awaiting-merge --force / running / awaiting-resume / failed / terminated、および "state file content"）の `loadState(...)` を `loadCanceledState(...)` に置き換え、`status=canceled` / `error.code=USER_CANCELED` / `canceledAt` を退避先で検証する。
- [x] 冪等 `canceled` テストは `loadWorktreeState(...)` で `status=canceled` かつ `updatedAt` 不変を検証する（退避・persist が起きないこと）。
- [x] `--restore-draft` 系テストは worktree-only レイアウトに合わせて調整する（`worktreePath` を渡し、その worktree 内 change-folder に request.md を置く形へ）。drafts への復元挙動（成功 / 既存 skip / source 欠落）は維持する。
- [x] 新規 acceptance テストを追加する:
  - [x] **記録喪失の回帰防止**: worktree-only ジョブを cancel し、`worktreeManager.remove` mock が実際に worktree dir を削除する設定にしたうえで、`canceled/<slug>-<jobId8>/state.json` に `USER_CANCELED` / `canceledAt` が残ることを検証する。
  - [x] **request.md 保全**: 上記で `canceled/<slug>-<jobId8>/request.md` が存在し内容が一致することを検証する。
  - [x] **同名 slug 同日衝突なし**: 同一 `slug` を明示指定した別 jobId のジョブを 2 件作り、両方 cancel すると `canceled/<slug>-<jobIdA8>/` と `canceled/<slug>-<jobIdB8>/` が両立し互いに上書きしないことを検証する。
  - [x] **片付け維持**: cancel 後に worktree（`worktreeManager.remove` 呼び出し）と local/remote branch 削除（`git branch -D` / `git push origin --delete` の spawn 呼び出し）が実行されることを検証する。
  - [x] **--purge は退避なし**: `--purge` で cancel すると `canceled/` に当該ジョブのディレクトリが作られないことを検証する。
- [x] `cancelAllTerminated` テスト群は worktree-only レイアウト下でも `JobStateStore.list`（worktree 走査）で対象ジョブを検出できることを確認し、必要なら fixture を調整する（sidecarAbsent 系アサートは維持）。

**Acceptance Criteria**:

- `makeJob` が canonical を直書きせず worktree-only state を生成する。
- worktree-only ジョブの cancel で `canceled/<slug>-<jobId8>/` に `USER_CANCELED` / `canceledAt` 入りの state が残ることがテストで固定される。
- 同名 slug を同日に 2 回 cancel しても `canceled/` で衝突しないことがテストで固定される。
- cancel 後に worktree と local/remote branch が削除されることがテストで固定される。
- request.md が `canceled/` に保全されることがテストで固定される。
- `--purge` で `canceled/` に墓標が作られないことがテストで固定される。
- 冪等 `canceled` 再 cancel で state が不変であることがテストで固定される。

---

## T-07: typecheck と test が green であることを確認する

対象: リポジトリ全体

- [x] `bun run typecheck` が error なしで完了する。
- [x] `bun run test` が全テスト pass で完了する。

**Acceptance Criteria**:

- `typecheck` 出力に error が 0 件。
- `test` 出力に failed テストが 0 件。
