# Tasks: `--with-merge` の archive-record 後 merge 失敗からの回復

## T-01: `runArchiveOrchestrator` に `archived` 遷移遅延 option を追加する

- [ ] `src/core/archive/orchestrator.ts` の `ArchiveInput` に `deferArchivedTransition?: boolean`（default `false`）を追加する。
- [ ] `deferArchivedTransition === true` のとき、Phase 1 の `markJobArchived(slug, recordDir)` 呼び出しとその escalation/stdout ハンドリングを **skip** する。`git mv`（`archiveChangeFolder`）/ draft 削除・staging / design-layer hook / `commitArchive` / `git push origin <feature-branch>` / headSha 捕捉はこれまで通り実行する。
- [ ] `deferArchivedTransition` 未指定（`false`）のときは現行と完全に同一挙動（`markJobArchived` を実行し status を `archived` に確定）を保つ。
- [ ] Phase 0 の terminal-status 短絡（`TERMINAL_STATUSES.has(state.status)` → no-op）はそのまま維持する。`awaiting-archive` は非 terminal のため、遅延経路の再実行は短絡せず idempotent 再記帳へ進む。

**Acceptance Criteria**:
- `deferArchivedTransition: true` で呼ぶと `markJobArchived` が呼ばれず、mv / commit / push / headSha 捕捉は実行される。
- option 未指定で呼ぶと従来通り `markJobArchived` が呼ばれ status が `archived` になる。
- 記帳済み（folder 移動済・commit 済）の feature branch への `deferArchivedTransition: true` 再実行が新規 commit を作らず exit 0 で headSha を返す（mv skip / commit skip / push no-op）。

## T-02: `listWithSourceDirs` に worktree archive 走査を追加する

- [ ] `src/store/job-state-store.ts` の `listWithSourceDirs` の worktree 走査（section 2）に、`opts?.includeArchived === true` を条件とする worktree archive 走査を追加する。各 worktree の `specrunner/changes/archive/*/state.json` を走査し、main checkout archive を走査する section 1b と対称に compose する。
- [ ] `parseArchiveDirName` で dated dir 名から slug を抽出し、`composeSplitLayout` に `{ slug, stateRoot: worktreePath }` を渡す。`sourceChangeDir` は当該 worktree の archive dated dir（`<worktreePath>/specrunner/changes/archive/<dated-slug>`）とする。
- [ ] dedup は既存 `tryMerge`（jobId・newest updatedAt 勝ち）に委ねる。読み取り不能・不正 state はスキップ（既存 section と同じ tolerant 挙動）。
- [ ] `includeArchived: false` の呼び出しでは worktree archive を走査しない（走査コスト・可視性を section 1b と同じ gate に揃える）。

**Acceptance Criteria**:
- worktree の archive dated dir にある state が `includeArchived: true` で発見され、`sourceChangeDir` が当該 worktree archive dir を指す。
- `includeArchived: false` では worktree archive の state が発見されない。
- main checkout / 他 worktree の active・archive 走査（section 1 / 1b / 2）の既存挙動が不変。

## T-03: `merge-then-archive` を「記録済みシグナル分離 + 遷移遅延 + post-merge 遷移」へ改修する

- [ ] `src/core/archive/merge-then-archive.ts` の Step 1 を `JobStateStore.list` から `JobStateStore.listWithSourceDirs`（`{ includeArchived: true }`）へ変更する。slug filter → newest updatedAt で解決した entry の `state` と `sourceChangeDir` を保持する。
- [ ] 「archive 記録済み」判定を `path.basename(path.dirname(sourceChangeDir)) === "archive"`（= `archiveRecorded`）で導出する。`jobStatus === "archived"` による判定を廃止する。
- [ ] 記帳が行われた working tree を `recordDir = noWorktree ? cwd : (worktreePath ?? cwd)` で導出する（post-merge 遷移の対象）。
- [ ] Step 2 の初回 MERGED 分岐を次へ置き換える: `prData.state === "MERGED"` かつ `archiveRecorded` → merge 後 resume（下記の post-merge 遷移 + `runPostMergeCleanup`）。`prData.state === "MERGED"` かつ `!archiveRecorded` → 既存の順序エラー escalation。
- [ ] Step 3 の `runArchiveOrchestrator` 呼び出しに `deferArchivedTransition: true` を渡す（T-01）。
- [ ] post-merge 遷移ヘルパを導入する: `markJobArchived(slug, recordDir)` を best-effort で実行（成功で `awaiting-archive → archived`、既 `archived` は no-op、失敗は `stderrWrite` で warning を出し継続）。`markJobArchived` を import する。
- [ ] post-merge cleanup を呼ぶ全経路で cleanup の直前に post-merge 遷移を実行する: (1) Step 2 の MERGED+記録済み resume、(2) Step 4 wait loop 内の merge-during-wait（MERGED）、(3) Step 5 の fresh merge 成功（`postMergeVerify` 設定時は integrity check pass 後）。
- [ ] merge せず escalation する経路（conflict / check failure / timeout / BLOCKED / protected-paths 等）では post-merge 遷移も cleanup も実行しない既存挙動を維持する。CI 待ち・headSha 照合・squash merge・branch protection escalation の既存ロジックは不変。

**Acceptance Criteria**:
- Step 1 が `listWithSourceDirs({ includeArchived: true })` を用い、記録済み判定を folder 位置で行う。
- 記帳後・merge 前は status が `awaiting-archive` のまま（記帳経路は `deferArchivedTransition: true`）。
- MERGED+記録済みの resume が `markJobArchived` を実行してから cleanup する。MERGED+未記録は順序エラー escalation を返し cleanup しない。
- fresh merge 成功・merge-during-wait のいずれも cleanup 直前に `archived` へ遷移する。
- merge 失敗（escalation）経路では遷移も cleanup も走らない。

## T-04: store の worktree archive 走査テストを追加する

- [ ] `src/store/__tests__/` に real-fs fixture テストを追加する（`job-state-store-list-with-source-dirs.test.ts` に追記、または新ファイル）。tmp repo に `.git/specrunner-worktrees/<wt>/specrunner/changes/archive/<YYYY-MM-DD>-<slug>/state.json`（status `awaiting-archive`）を作り、`listWithSourceDirs(repoRoot, { includeArchived: true })` が当該 job を発見し `sourceChangeDir` が worktree archive dir を指すことを固定する。
- [ ] `includeArchived: false` では発見されないことを固定する。
- [ ] 同一 jobId が main checkout archive と worktree archive の双方に存在する場合の dedup（newest updatedAt 勝ち）を固定する。

**Acceptance Criteria**:
- 受け入れ基準「worktree の archive/ 配下の記帳済み state が includeArchived 走査で再解決可能」が real-fs テストで固定される。
- `includeArchived: false` 非発見・dedup のテストが green。

## T-05: `merge-then-archive` のテストを更新・追加する

- [ ] `src/core/archive/__tests__/merge-then-archive.test.ts` の module mock を更新する: `JobStateStore` に `listWithSourceDirs` を追加（Step 1 が使用）、`../../finish/job-state-update.js` の `markJobArchived` を mock（post-merge 遷移が使用）。
- [ ] 既存 T-01 / T-02 / T-PMI-04 を新シグナルへ更新する: state を `status: "awaiting-archive"` にし、`listWithSourceDirs` が `sourceChangeDir` を archive/ 配下（記録済み）または active（未記録）で返すよう mock する。`list` 呼び出し前提の assertion を `listWithSourceDirs` へ置換する。
- [ ] 受け入れ基準テストを追加する:
  - 記帳後・merge 前に status が `awaiting-archive` 相当で再解決可能（Step 3 が `deferArchivedTransition: true` で呼ばれる）ことを固定。
  - merge 失敗（`runArchiveOrchestrator` stub 失敗 or merge escalation）後の再実行で job が解決され（`listWithSourceDirs` が archive/ 配下 entry を返す）、idempotent 記帳を経て merge へ進める（「No job found」を返さない）ことを固定。
  - fresh merge 成功後に `markJobArchived(slug, recordDir)` が呼ばれ、続けて `runPostMergeCleanup` が呼ばれることを固定。
  - MERGED + 記録済み（archive/ 配下）の crash resume で `markJobArchived` → `runPostMergeCleanup` が呼ばれ exit 0 を返すことを固定。
  - MERGED + 未記録（active `<slug>/`）で順序エラー escalation を返し cleanup / 遷移が呼ばれないことを固定。
- [ ] merge-during-wait 経路（`TC-015` 相当）でも cleanup 直前に `markJobArchived` が呼ばれ、integrity check は呼ばれない既存挙動を維持することを固定。

**Acceptance Criteria**:
- 上記の受け入れ基準テストが green。
- 更新した既存テスト（T-01 / T-02 / T-PMI-04 / TC-015）が新挙動へ整合して green。

## T-06: `runArchiveOrchestrator` の遷移遅延テストを追加する

- [ ] `src/core/archive/__tests__/orchestrator.test.ts` に、`deferArchivedTransition: true` で `markJobArchived`（mock 済）が呼ばれず、`archiveChangeFolder` / `commitArchive` / feature push は呼ばれることを固定するテストを追加する。
- [ ] `deferArchivedTransition` 未指定で従来通り `markJobArchived` が呼ばれることを固定する（既存挙動の回帰防止）。

**Acceptance Criteria**:
- 遅延 option の有無で `markJobArchived` の呼び出しが切り替わることがテストで固定される。
- plain 経路（option 未指定）の記帳挙動が不変であることが既存 + 追加テストで確認できる。

## T-07: 既存テストの回帰確認と検証

- [ ] `tests/unit/no-worktree-archive.test.ts` / `tests/unit/core/archive/*.test.ts` / `src/core/archive/__tests__/*` のうち `--with-merge` なし `job archive` の挙動を固定するテストが不変で green であることを確認する（R3）。
- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green。

**Acceptance Criteria**:
- `--with-merge` なし `job archive` の既存テストが不変で green。
- `typecheck && test` が green。
