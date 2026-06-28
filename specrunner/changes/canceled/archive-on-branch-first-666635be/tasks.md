# Tasks: archive をブランチ上で先に実行し、base への直接影響を merge のみに限定する

## T-01: status lifecycle に `archive-recorded` を追加する

- [x] `src/state/schema.ts`: `JobStatus` union に `"archive-recorded"` を追加し、`validateJobState` 内の `VALID_STATUSES` 配列にも追加する。
- [x] `src/state/lifecycle.ts`: `VALID_TRANSITIONS` を更新する。
  - `awaiting-archive` の遷移先を `{ archive-recorded, archived, canceled }` にする（`archived` エッジは外部 merge 検出経路のため残す）。
  - `archive-recorded` の行を追加し遷移先を `{ archived, canceled }` にする。
- [x] `TERMINAL_STATUSES` は `{ archived, canceled }` のまま変更しない（`archive-recorded` は非 terminal）。`ACTIVE_STATUSES` には `archive-recorded` を含めない（PR open だが active session ではないため。ただし sidecar orphan 判定は T-02 で別途扱う）。

**Acceptance Criteria**:
- `archive-recorded` が `JobStatus` 型の一員として typecheck を通る。
- `canTransition("awaiting-archive", "archive-recorded")` / `canTransition("archive-recorded", "archived")` / `canTransition("archive-recorded", "canceled")` が true。
- `canTransition("archive-recorded", "running")` 等の未許可遷移が false。
- `isTerminal("archive-recorded")` が false。

## T-02: `JobStatus` を消費する全箇所に `archive-recorded` を反映する

- [x] `src/cli/command-registry.ts`: `--status` フィルタの values 配列に `"archive-recorded"` を追加する。
- [x] `src/cli/ps.ts`: PR open 扱いの分岐（現在 `awaiting-archive` のみ）に `archive-recorded` を含め、PR merged チェック対象 / 表示が `awaiting-archive` と同等になるようにする。
- [x] `src/core/cancel/runner.ts`: 「PR open のため `--force` 必要」ガード（現在 `awaiting-archive && !force`）に `archive-recorded` を含める。
- [x] `src/core/doctor/checks/storage/orphan-sidecars.ts`: `ACTIVE_STATUSES`（orphan 扱いしない status 集合）に `"archive-recorded"` を追加する。
- [x] `src/state/reconcile.ts`: `reconcilePrState` を、`status === "awaiting-archive"` に加え `status === "archive-recorded"` でも `prStatus === "MERGED"` 時に `archived` へ遷移するよう拡張する。

**Acceptance Criteria**:
- `archive-recorded` の job が `ps` で PR open（merged チェック対象）として扱われる。
- `archive-recorded` の job を `cancel`（`--force` なし）すると open PR ガードで停止する。
- doctor の orphan sidecar 判定が `archive-recorded` を orphan としない。
- `reconcilePrState(archive-recorded, "MERGED")` が `archived` への TransitionResult を返す。

## T-03: `markJobArchived` を記帳用・terminal 用の 2 関数に分割する

- [x] `src/core/finish/job-state-update.ts` に `markJobArchiveRecorded(slug, stateRoot)` を追加する。`resolveCanonicalStateDir` で state dir を解決し、`transitionJob(..., "archive-recorded", { trigger: "archive", reason: "archive recorded on feature branch" })` を適用、idempotent（既に `archive-recorded` なら no-op）に persist する。
- [x] 既存 `markJobArchived(slug, stateRoot)` は `archived` 遷移を維持する（idempotent: 既に `archived` なら no-op）。merge 確定経路のみが呼ぶ。
- [x] `assertJobFinishable` は `canTransition(status, "archived")` のまま変更しない（`awaiting-archive` / `archive-recorded` 双方で finishable が成立することを確認する）。

**Acceptance Criteria**:
- `markJobArchiveRecorded` が `awaiting-archive` → `archive-recorded` 遷移を永続化し、再実行で no-op（同一 status）になる。
- `markJobArchived` が `archive-recorded` → `archived` 遷移を永続化する。
- `assertJobFinishable` が status `awaiting-archive` / `archive-recorded` を finishable と判定し、`running` で `JOB_NOT_FINISHABLE` を投げる。

## T-04: orchestrator を `recordArchiveOnBranch` と `cleanupAfterMerge` に再構成する

- [x] `src/core/archive/orchestrator.ts` の Phase 1 を `recordArchiveOnBranch` として再定義する。動作ディレクトリ `workdir`（feature branch がチェックアウトされた場所）上で以下を順に実行する。base への `git checkout` / `git commit` / `git push` は一切行わない。GitHubClient を import しない（client-closed 維持）。
  - `git checkout <featureBranch>`（worktree mode は worktree 内で feature branch 既出のため実質確認 / no-worktree mode は cwd を feature branch へ。**base へは checkout しない**）
  - `deriveAndWriteUsage`（workdir 上、mv 前）
  - `archiveChangeFolder`（workdir 上）
  - `markJobArchiveRecorded(slug, workdir)`
  - draft 削除 stage + `git add specrunner/changes/`
  - `commitArchive`（`chore: archive <slug>`、workdir 上）
  - `git push origin <featureBranch>`
- [x] Phase 2 を `cleanupAfterMerge` として独立 export する。merge 確定経路（T-06）からのみ呼ばれる。
  - `git checkout <base>` + `git pull --ff-only`（cwd、merge 済み archived folder の materialize）
  - `markJobArchived(slug, cwd)`（`archive-recorded` → `archived`、local 編集のみ。base へ commit/push しない）
  - worktree remove + prune（worktree mode のみ、`noWorktree` を尊重）
  - liveness / managed marker / sidecar dir 削除（best-effort）
  - feature branch 削除（local `git branch -D` + remote `git push origin --delete`、best-effort）
- [x] 公開 `runArchiveOrchestrator`（no-merge 経路）を「Phase 0 pre-flight（state load + terminal no-op + `assertJobFinishable`）→ `recordArchiveOnBranch`」に変更し、**cleanup を呼ばない**。
- [x] Phase 0 の terminal no-op 判定（`TERMINAL_STATUSES.has(status)`）は維持する。`archive-recorded` は非 terminal のため再実行時は `recordArchiveOnBranch` の各 step が idempotent skip する。

**Acceptance Criteria**:
- no-merge `runArchiveOrchestrator` が base への `git checkout`/`git commit`/`git push` を呼ばず、`git push origin <featureBranch>` を呼ぶ。
- no-merge `runArchiveOrchestrator` が worktree remove / branch delete を呼ばない。
- `cleanupAfterMerge` が export され、`markJobArchived`（archived 遷移）+ worktree/branch cleanup を実行する。
- orchestrator モジュールが `src/core/port/github-client.ts` を import しない。

## T-05: `recordArchiveOnBranch` の動作ディレクトリ / feature branch 解決を実装する

- [x] worktree mode: `resolveWorktreePathForArchive` で worktreePath を解決し `workdir = worktreePath` とする。解決不能なら escalation（記帳先 feature branch checkout が特定できない旨 + 再実行ガイダンス）。
- [x] `--no-worktree` mode（`state.noWorktree === true`）: `workdir = cwd` とし、`git checkout <featureBranch>`（base ではなく feature branch）を行う。
- [x] `featureBranch` は `state.branch` から取得する。`archiveChangeFolder` / `commitArchive` / `deriveAndWriteUsage` には `cwd: workdir` を渡す。`markJobArchiveRecorded` の stateRoot に `workdir` を渡す。
- [x] feature branch への push は transport auth（`createTransportAuth` + `wrapSpawn`）を経由する。push 失敗は escalation で扱う。

**Acceptance Criteria**:
- worktree mode で記帳の git 操作が worktreePath を cwd として実行される。
- no-worktree mode で `git checkout <featureBranch>` が呼ばれ、base への checkout は呼ばれない。
- worktreePath 解決不能時に escalation（exit 1）を返す。

## T-06: `runMergeThenArchive` を「記帳 → wait → merge → cleanup」順に再構成する

- [x] `src/core/archive/merge-then-archive.ts` の実行順を変更する。
  - Step: job state load → PR number 解決（既存）。
  - `getPullRequest` + `state.status` 確認:
    - `MERGED` かつ `state.status === "archive-recorded"` → `cleanupAfterMerge` のみ実行して return（冪等再実行）。
    - `MERGED` かつ `state.status === "awaiting-archive"` → 早期 return しない。feature branch が remote に存在するなら `recordArchiveOnBranch` → `cleanupAfterMerge` を実行する。feature branch が存在しない場合は escalation で停止する。
  - `recordArchiveOnBranch`（記帳を feature branch へ commit + push。idempotent skip 対応）。
  - protected-paths merge guard（既存ロジックを記帳後に評価）。
  - CI green wait loop（既存。head SHA は毎ループ再取得のため記帳 push 後の新 head を待つ）。
  - `checkMergeableForMerge` + squash merge（既存）。
  - merge 成功 → `cleanupAfterMerge`。
- [x] merge 失敗・wait timeout・conflict・guard ブロック時は cleanup を実行せず escalation で停止する（記帳は feature branch に残り、再実行で回復）。

**Acceptance Criteria**:
- `--with-merge` で記帳 push が merge より前に呼ばれる。
- merge 成功後にのみ `cleanupAfterMerge`（worktree/branch cleanup）が呼ばれる。
- PR が既に `MERGED` かつ `state.status === "archive-recorded"` の場合、記帳・wait・merge を skip し cleanup のみ実行する。
- PR が既に `MERGED` かつ `state.status === "awaiting-archive"` の場合、早期 return せず通常フローを継続する（feature branch 存在確認 → recordArchiveOnBranch → cleanupAfterMerge または escalation）。
- merge 失敗系では cleanup が呼ばれない。

## T-07: CLI `archive.ts` の配線を更新する

- [x] `src/cli/archive.ts` の no-merge 経路で、feature branch push のため GitHub token を解決し（既存 best-effort 解決を維持）`githubToken` を `runArchiveOrchestrator` に渡す。
- [x] `baseBranch` 解決ロジック（request.md 由来）は維持する。`runArchiveOrchestrator` / `runMergeThenArchive` の入力契約変更があれば呼び出し側を追従させる。

**Acceptance Criteria**:
- `job archive <slug>` / `job archive --with-merge <slug>` の CLI 経路が typecheck を通り、新オーケストレータ契約に整合する。

## T-08: no-merge 経路のテストを追加・更新する

- [x] `tests/unit/core/archive/orchestrator.test.ts` を新仕様に更新する。
  - base に対する `git checkout <base>` / base 上 `git commit` / `git push origin <base>` が呼ばれないことを固定。
  - 記帳コミットが feature branch 上に作られ `git push origin <featureBranch>` が呼ばれることを固定。
  - status が `archive-recorded` になり `archived` にならないことを固定。
  - worktree remove / branch delete が呼ばれないことを固定。
  - 記帳済み（status `archive-recorded`、change folder 移動済み）の再実行が no-op（mv/commit skip, exit 0）であることを固定。
- [x] protected base を模したケース（base への push が reject される spawn mock）でも no-merge `job archive` が exit 0 で成功することを固定する。
- [x] `tests/unit/no-worktree-archive.test.ts` を更新し、no-worktree 記帳が cwd の feature branch 上で行われ、cleanup が no-merge では行われないことを固定する。

**Acceptance Criteria**:
- 上記シナリオを検証するテストが pass する。
- base 直 push が起きないこと・feature branch へ push されることが assertion で固定される。

## T-09: `--with-merge` 経路のテストを追加・更新する

- [x] `tests/unit/core/archive/merge-then-archive.test.ts` を新順序に更新する。
  - 記帳 push が merge の前に呼ばれることを固定。
  - CI green を待ってから merge することを固定（既存 wait loop テストの順序整合）。
  - merge 成功後にのみ worktree/branch cleanup が呼ばれることを固定。
  - merge 完了前に status が `archived` にならないことを固定（記帳段階は `archive-recorded`）。
  - PR が既に `MERGED` かつ `state.status === "archive-recorded"` の場合は記帳・wait・merge を skip し cleanup のみ実行することを固定。
  - PR が既に `MERGED` かつ `state.status === "awaiting-archive"` の場合は早期 return せず `recordArchiveOnBranch` → `cleanupAfterMerge` の順で継続することを固定。
  - merge 失敗・timeout・conflict で cleanup が呼ばれないことを固定。

**Acceptance Criteria**:
- 上記シナリオを検証するテストが pass する。
- 「merge 完了前に `archived` にならない」が独立した assertion で固定される。

## T-10: lifecycle / state-update / consumer のテストを追加・更新する

- [x] `tests/unit/state/lifecycle.test.ts` に `awaiting-archive → archive-recorded`、`archive-recorded → archived`、`archive-recorded → canceled` の許可と未許可遷移の拒否を追加する。
- [x] `markJobArchiveRecorded` / `markJobArchived` の遷移・冪等性テストを追加する（`tests/finish-job-state.test.ts` 等の既存配置に合わせる）。
- [x] T-02 で更新した consumer（ps / cancel / doctor orphan-sidecars / reconcile）の `archive-recorded` 取り扱いに対する回帰テストを追加または更新する。

**Acceptance Criteria**:
- lifecycle・state-update・consumer のテストが pass する。
- `reconcilePrState(archive-recorded, "MERGED")` の `archived` 遷移がテストで固定される。

## T-11: 検証

- [x] `typecheck && test`（プロジェクトの検証コマンド）を実行し green であることを確認する。

**Acceptance Criteria**:
- `typecheck` がエラーなく通る。
- 全テストが pass する。

---

### 補足（実装者向け）

- 新 ADR（ADR-20260603 を supersede）は adr-gen step が生成する。実装者は手書きしない。design.md の D6 と Risks/Trade-offs を根拠資料として残してある。
- terminal `archived` の永続化先（design.md [Q1]）は**案A（merge 後 cwd の base checkout への local 編集）で確定**している。案B（local sidecar marker + `list()` 拡張）は採用しない。T-04 の `cleanupAfterMerge` は案A を前提とする。
