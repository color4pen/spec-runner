# Tasks: archive on feature branch, base reached only via merge

## T-01: archive 記帳を feature-branch working tree 上で実行する

- [x] `src/core/archive/orchestrator.ts` の Phase 1 から base 操作（`git checkout <base>` / `git pull --ff-only` / `git push origin <base>`）を削除する。
- [x] 記帳 git 操作の working directory（recordDir）を解決する: worktree モードは `resolveWorktreePathForArchive` が返す worktree path、`--no-worktree` モードは `cwd`（main repo）。
- [x] `--no-worktree` モードでは記帳前に `git checkout <feature-branch>` で feature branch を確定する（base ではない。worktree モードでは worktree が既に feature branch 上のため checkout 不要）。
- [x] `deriveAndWriteUsage` / `archiveChangeFolder` / `markJobArchived` を recordDir（repoRoot = recordDir）に対して実行し、worktree 内の change folder / state.json を対象にする。
- [x] 記帳 commit を `git push origin <feature-branch>`（recordDir 上、transport-auth 経由）で remote feature branch へ push する。push した記帳 commit の SHA を後段（CI 待ち）へ引き渡せるよう取得する。
- [x] recordDir が存在しない（worktree が既に撤去済みだが status が terminal でない）異常系は、resume 案内付き escalation を返す。
- [x] Phase 0 の terminal-status 短絡（`archived` → no-op）を worktree へ触れる前に維持する。

**Acceptance Criteria**:
- merge なし `job archive` 実行時に `git checkout <base>` / `git commit`（base 上）/ `git push origin <base>` が一切呼ばれない。
- 記帳 commit `chore: archive <slug>` が feature branch 上に作られ `git push origin <feature-branch>` で push される。
- `markJobArchived` が recordDir の change folder を解決し status を `archived` に確定する。
- 記帳済み feature branch への再実行で新規 commit が作られず no-op になる（mv skip / markArchived no-op / commit skip / push no-op）。

## T-02: post-merge cleanup を独立 step として切り出す

- [x] worktree 撤去（`WorktreeManager.remove` + `prune`、`noWorktree` 時は skip）、liveness / managed marker / sidecar dir 削除、local + remote feature branch 削除（`isRemoteRefNotFound` 許容）を、記帳から分離した独立関数として `src/core/archive/post-merge-cleanup.ts` として切り出す。
- [x] cleanup 関数の入力は slug / cwd（main repo）/ branch / worktreePath / noWorktree / baseBranch / spawn / fs / worktreeManagerFn とする。
- [x] cleanup は job status を書き込まない（base working tree を dirty にしない）。
- [x] `--no-worktree` モードの cleanup では、main repo が feature branch 上にあるため `git checkout <base>` で branch を離れてから local feature branch を削除する（この checkout は base への commit / push を伴わない）。
- [x] cleanup を best-effort かつ冪等にする（worktree / branch / sidecar 不在時 no-op）。
- [x] `runArchiveOrchestrator`（記帳）から cleanup の呼び出しを除去する。記帳関数は cleanup を呼ばない。

**Acceptance Criteria**:
- 記帳関数（merge なし経路）は worktree 撤去・feature branch 削除を呼ばない。
- cleanup 関数は status 書き込みを行わない。
- worktree モードでは `remove` / `prune` が、`--no-worktree` では skip されることが既存の DI テスト構造で確認できる。

## T-03: merge-then-archive を「記帳 → CI 待ち → merge → cleanup」へ再順序化する

- [x] `src/core/archive/merge-then-archive.ts` を、merge 成功後に記帳する現行順序から、記帳先行へ変更する: (1) 記帳 step を実行（冪等）し記帳 commit を feature branch へ push → (2) `getPullRequest` で MERGED 判定 → MERGED なら CI 待ち / merge を skip し cleanup へ → (3) protected-paths guard → CI green 待ち → squash merge → (4) cleanup。
- [x] CI green 待ちの対象 headSha を「記帳 commit push 後の headSha」にする。push した記帳 SHA を捕捉し、wait loop が `getPullRequest().headSha == 記帳 SHA` を観測してから check rollup を信頼する（記帳直後の旧 headSha 誤信頼を防ぐ）。
- [x] merge 成功後にのみ cleanup（T-02）を呼ぶ。merge せず escalation した経路では cleanup を呼ばない。
- [x] 既 MERGED 検出時（初回 `getPullRequest` / wait loop 内の両方）は記帳・merge を skip し cleanup のみ実行する。
- [x] `checkMergeableForMerge` / squash merge / branch protection `BLOCKED` escalation の既存挙動は維持する。

**Acceptance Criteria**:
- `--with-merge` が記帳 push 後の headSha に対する CI green を待ってから merge し、merge 成功後にのみ cleanup する。
- CI green にならない / `BLOCKED` の場合、merge されず cleanup も実行されない。
- 既に MERGED の PR への `--with-merge` 再実行が記帳・merge を skip し cleanup のみ実行する。

## T-04: CLI 配線を記帳専用へ更新する

- [x] `src/cli/archive.ts` の merge なし経路が記帳関数のみを呼び（cleanup を呼ばない）、`--with-merge` 経路が再順序化済み `runMergeThenArchive`（T-03）を呼ぶことを確認・調整する。
- [x] baseBranch 導出（request.md → fallback `"main"`）と token 解決の既存ロジックは維持する。記帳経路で feature push 用に token を渡す配線を保つ。
- [x] pipeline log（`archive:start` / `archive:complete` / `archive:error`）の発火点を維持する。

**Acceptance Criteria**:
- merge なし `job archive` が記帳のみ実行し feature branch / worktree を残す。
- `--with-merge` が T-03 のフローを実行する。
- `typecheck` が green。

## T-05: テストを更新・追加して受け入れ基準を固定する

- [x] merge なし `job archive` が base への `git checkout` / `git commit` / `git push` を一切行わないことを spawn spy で固定する。
- [x] 記帳 commit が feature branch 上に存在し `git push origin <feature-branch>` が呼ばれることを固定する。
- [x] base 直 push 不可（`git push origin <base>` が非 0 を返す）を模した環境で、merge なし `job archive` が exit 0 で成功し base push が呼ばれないことを固定する。
- [x] `--with-merge` が記帳 push 後の headSha に対し CI green を待ってから merge し、merge 成功後にのみ worktree / branch cleanup を行うことを固定する。
- [x] merge の有無に関わらず記帳時点で status が `archived` に確定することを固定する。
- [x] merge 後の cleanup 経路が job status を書き換えない（base working tree を dirty にしない）ことを固定する。
- [x] `archive-recorded` 等の中間 status が新規導入されていないこと（status 集合・遷移表の不変）を固定する。
- [x] 記帳済み feature branch への `job archive` 再実行が no-op であることを固定する。
- [x] `--with-merge` 再実行で既 MERGED なら cleanup のみ実行することを固定する。
- [x] 期待が反転する既存テストを更新する: `tests/unit/no-worktree-archive.test.ts`（merge なし経路では branch 削除しない方向へ）、`src/core/archive/__tests__/orchestrator.test.ts`（cleanup 境界の反転）、`tests/unit/core/archive/orchestrator.test.ts`、`tests/unit/core/archive/merge-then-archive.test.ts`。

**Acceptance Criteria**:
- 上記 9 個の受け入れ基準テストが green。
- 反転した既存テストが新挙動に整合して green。

## T-06: 検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（5641 tests passed）。

**Acceptance Criteria**:
- `typecheck && test` が green。
