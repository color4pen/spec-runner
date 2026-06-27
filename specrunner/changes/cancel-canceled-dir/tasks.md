# Tasks: cancel 時にジョブを canceled/<slug>-<jobId8>/ へ退避する

## T-01: canceled/ ディレクトリのパスヘルパーを追加

- [ ] `src/util/paths.ts` に `CANCELED_DIR` 定数を追加する:
      `const CANCELED_DIR = `${CHANGES_DIR}/canceled`;`（`ARCHIVE_DIR` 定義の近くに置く）。
- [ ] `canceledChangesDirRel(): string` を追加し `CANCELED_DIR`（`"specrunner/changes/canceled"`）を返す。
- [ ] `canceledChangeFolderPath(dirName: string): string` を追加し ``${CANCELED_DIR}/${dirName}`` を返す。
      `dirName` は `<slug>-<jobId8>` 形式を想定する。
- [ ] このファイルは他の `src/` モジュールを import してはならない（TC-034 制約）。`slice` 等の純粋処理のみ可。

**Acceptance Criteria**:
- `canceledChangesDirRel()` が `"specrunner/changes/canceled"` を返す。
- `canceledChangeFolderPath("my-change-12345678")` が
  `"specrunner/changes/canceled/my-change-12345678"` を返す。
- `paths.ts` が `src/` 内の他モジュールを import していない。

## T-02: list() / canonical resolver で canceled/ を active から除外

- [ ] `src/store/job-state-store.ts` の `JobStateStore.list()` セクション1
      （`changes/*` 走査ループ, 既存 `if (!entry.isDirectory() || entry.name === "archive") continue;`, :223 付近）の
      skip 条件に `|| entry.name === "canceled"` を追加する。
- [ ] 同 `list()` セクション2（worktree 内 `changes/*` 走査,
      既存 `if (!slugEntry.isDirectory() || slugEntry.name === "archive") continue;`, :278 付近）の
      skip 条件にも `|| slugEntry.name === "canceled"` を防御的に追加する。
- [ ] `resolveCanonicalStateDir`（`src/core/finish/resolve-canonical-state-dir.ts`）は `changes/<slug>` と
      `archive/*` のみ走査するため改修不要。`canceled/` を canonical として解決しないことを T-04 のテストで固定する。

**Acceptance Criteria**:
- `canceled/<slug>-<jobId8>/state.json` を置いても `JobStateStore.list()`（includeArchived なし）が
  それを active として返さない。
- 既存の archive 除外・worktree 走査・managed marker 走査の挙動は不変（既存テスト green）。

## T-03: cancel runner に退避（move）+ 退避先 persist を実装し、処理順を反転する

対象: `src/core/cancel/runner.ts`

- [ ] 新しい best-effort helper `evacuateChangeFolder(state, deps, warnings, info)` を追加する:
  - [ ] `slug = getJobSlug(state)`; 空なら warning を積んで return。
  - [ ] `jobId8 = state.jobId.slice(0, 8)`、退避先 `canceledDirAbs =
        path.join(deps.repoRoot, canceledChangeFolderPath(`${slug}-${jobId8}`))` を組み立てる
        （`canceledChangeFolderPath` を `../../util/paths.js` から import）。
  - [ ] 退避元を解決する（D7）:
    - [ ] worktreePath を `resolveWorktreePathForJob(state, deps.repoRoot)` で解決し、
          `<worktreePath>/specrunner/changes/<slug>/state.json` が存在すれば worktree モードの元とする。
    - [ ] なければ canonical `path.join(deps.repoRoot, changeFolderPath(slug))` の `state.json` 存在を確認し、
          存在すれば no-worktree モードの元とする。
    - [ ] どちらも無ければ元無し（degraded）。
  - [ ] `await fs.mkdir(path.join(deps.repoRoot, canceledChangesDirRel()), { recursive: true })` で
        `canceled/` 親を用意する。
  - [ ] 元が見つかった場合は **move**: `await fs.cp(srcDir, canceledDirAbs, { recursive: true })` の後
        `await fs.rm(srcDir, { recursive: true, force: true })`（cross-device 安全な copy+remove を基線とする）。
        元が無い場合は `await fs.mkdir(canceledDirAbs, { recursive: true })` のみ。
  - [ ] info に「Evacuated change folder to specrunner/changes/canceled/<slug>-<jobId8>/」を積む。
  - [ ] helper 全体を try/catch で囲み、例外時は warning を積んで継続する（D9 best-effort）。退避先パスを返す
        （後続の persist が宛先を知るため。失敗時は null を返す）。
- [ ] `cancelSingleJob` の本体（:271-338 付近）を以下の順序に再構成する:
  - [ ] process kill（既存）→ `--restore-draft`（既存 `restoreDraftFromBranch`、**退避の前** に維持）
        → **`evacuateChangeFolder(...)`** → canceled state 構築 → **退避先へ persist** → `cleanupJobResources(...)`
        → managed marker unlink（既存）→ `--purge` sidecar 削除（既存）。
  - [ ] 既存の「`await cleanupJobResources(...)` を先に呼び、その後 transition+persist」ブロック（:283-305）を
        上記順序へ移し替える。`cleanupJobResources` は persist の **後** に呼ぶ。
  - [ ] canceled state の構築は既存どおり `transitionJob(state, "canceled", { trigger:"cancel",
        reason:"Canceled by user", patch:{ error:{code:USER_CANCELED,...}, canceledAt: now, worktreePath: null } })`。
        ただし `state.status === "canceled"`（idempotent）の場合は再 transition せず、loaded state をそのまま使う。
  - [ ] persist は退避先 `canceledDirAbs` を指す `new JobStateStore(jobId, deps.repoRoot,
        { changeDir: canceledDirAbs })` で行う（D6）。退避が null を返した degraded 時は persist を skip し
        warning を積む。
  - [ ] **既存の `if (!purge)` による persist 抑止を撤廃する**（D9）。purge でも退避先 tombstone と記録は残す。
        `--purge` は従来どおり `.specrunner/local/<slug>/` sidecar の削除のみを行う（:326-338 維持）。
- [ ] import を追加する: `canceledChangeFolderPath`, `canceledChangesDirRel`, `changeFolderPath`
      （`../../util/paths.js`）。`resolveStateStoreByJobId` の import は不要になれば削除する
      （他で未使用なら）。`JobStateStore` は既に import 済み。

**Acceptance Criteria**:
- cancel 後、`canceled/<slug>-<jobId8>/state.json` に status=canceled / error.code=USER_CANCELED /
  canceledAt が記録される（worktree-only / no-worktree 双方）。
- 退避は cleanup の前に完了し、worktree 撤去後も記録が残る。
- `--no-worktree` モードで元の canonical `changes/<slug>/` が削除される。
- worktree 撤去 + local/remote branch 削除は維持される（順序は退避・persist の後）。
- `--purge` でも退避先 tombstone が作成され、機械ローカル sidecar のみ追加削除される。

## T-04: テストを worktree-only / no-worktree / 退避・一意化・move に合わせて改修

対象: `tests/unit/core/cancel/runner.test.ts`（および必要に応じて
`src/core/cancel/__tests__/runner-branch-delete.test.ts`）

- [ ] `makeJob` を見直し、**worktree-only** を再現できるようにする（canonical 直書きで穴を隠さない）:
  - [ ] worktree モード fixture では state.json を `<worktreePath>/specrunner/changes/<slug>/` にのみ書き、
        main canonical `specrunner/changes/<slug>/` には書かない。liveness sidecar の worktreePath を
        その worktree に向ける。
  - [ ] 既存テストで canonical を前提に load していた箇所（`loadState(jobId, slug)` 等）は、退避後の
        `canceled/<slug>-<jobId8>/` を読むヘルパー（例 `loadCanceledState`）へ置き換える。
- [ ] 新規テスト: **worktree-only の記録残存（回帰防止）** — worktree-only state の job を cancel すると
      `canceled/<slug>-<jobId8>/state.json` が存在し status=canceled / error.code=USER_CANCELED /
      canceledAt を持つ。worktree（physical）が remove されても記録が残ることを assert。
- [ ] 新規テスト: **同名 slug の同日複数 cancel で衝突しない** — slug 同一・jobId 異なる 2 job を cancel し、
      `canceled/<slug>-<jobId8a>/` と `canceled/<slug>-<jobId8b>/` が独立に存在することを assert。
- [ ] 新規テスト: **--no-worktree move 保証** — canonical `changes/<slug>/` にのみ state を置いた job
      （worktreePath null）を cancel し、(1) `changes/<slug>/` が消える、(2) `canceled/<slug>-<jobId8>/` に
      のみ存在する、(3) `JobStateStore.list()` に active として現れない、ことを assert。
- [ ] 新規テスト: **request.md 保全** — change-folder の request.md が `canceled/<slug>-<jobId8>/request.md`
      に保全されることを assert。
- [ ] 新規テスト: **片付け維持** — cancel 後に worktree remove と local/remote branch 削除（spawn 呼び出し）が
      行われることを assert（既存の best-effort warning テストは維持）。
- [ ] 既存「canceled status (idempotent)」テストを新挙動へ更新する: 退避が起き、`canceled/` に移ることを
      前提に assert を書き換える（`changes/<slug>/` の updatedAt 不変前提を撤廃）。`--purge` idempotent の
      sidecar 削除アサートは維持。
- [ ] `cancelAllTerminated` 系テストは挙動不変。`makeJob` 改修で worktree-only と canonical の両 fixture が
      混在する場合は、各テストが期待する状態が `JobStateStore.list()` に正しく現れるよう fixture を調整する。
- [ ] `runner-branch-delete.test.ts`: `loadStateByJobId` / `resolveStateStoreByJobId` を mock している。
      新経路は退避先 changeDir へ直接 persist するため `resolveStateStoreByJobId` mock は未使用になる。
      退避は best-effort（D9）で fake repoRoot では warning に落ちるため branch 削除アサートは維持される想定。
      実 fs を要するなら repoRoot を実 tempDir に差し替え、branch 削除アサートが green を保つよう調整する。

**Acceptance Criteria**:
- 上記すべての新規/更新テストが green。
- worktree-only 回帰テストが、退避前の旧実装では fail し新実装で pass する（穴を塞いだことの確認）。
- `tests/unit/cli/cancel.test.ts` 等の既存 cancel テストが green（CLI 配線は不変）。

## T-05: 型・テスト・lint の最終検証

- [ ] `typecheck`（tsc）が green。
- [ ] `test`（vitest）全件 green。
- [ ] `lint`（設定がある場合）が green。
- [ ] 退避・除外に伴う新規 public API（paths ヘルパー）の命名・export が既存規約に沿う。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 既存の cancel / list / archive 関連テストにリグレッションが無い。
