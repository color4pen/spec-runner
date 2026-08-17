# Tasks: request lifecycle 一本化 — draft consume on start

## T-01: `consumeDraft` helper を追加し `recopyDraftToChangeFolder` を削除する

`src/core/artifact/copy-artifacts.ts` を編集する。

- [ ] `recopyDraftToChangeFolder`（146-173 行）とその JSDoc を削除する。
- [ ] `consumeDraft(repoRoot: string, slug: string, spawn: SpawnFn): Promise<void>` を追加する。
  - flat `specrunner/drafts/<slug>.md` と directory `specrunner/drafts/<slug>/` の 2 つを対象にループする（`draftsDir()` から組み立てる。target path は `repoRoot` からの絶対 path）。
  - 各対象について: 存在しなければ skip → `git ls-files -- <relPath>`（`{ cwd: repoRoot }`）で tracked 判定 → tracked（stdout 非空）なら削除せず `stderrWrite` で警告して continue → untracked なら `fs.rm(absPath, { recursive: true, force: true })`。rm 失敗は `stderrWrite` 警告で握って continue（best-effort、`orchestrator.ts:263-279` と同一ポリシー）。
  - 消費対象 path は slug から導出し、request file path は参照しない（D2）。
- [ ] `draftsDir` を `../../util/paths.js` の import に追加する（`draftPath` は recopy 削除で不要になれば外す）。
- [ ] archive の同等ループ（`src/core/archive/orchestrator.ts:263-279`）と重複することを示す `ponytail:` コメントを `consumeDraft` に付す（統合トリガ = 3 番目の消費者）。

**Acceptance Criteria**:
- `recopyDraftToChangeFolder` が `src/` のどこにも存在しない。
- `consumeDraft` が named export として存在し、flat / directory 両形式を対象にする。
- `typecheck` が green（削除に伴う未参照 import 残りがない）。

## T-02: resume path の recopy 呼び出し（全 4 箇所）を削除する

- [ ] `src/core/runtime/workspace-materializer.ts`: `recopyDraftToChangeFolder` の import（21-26 行の import 群）と 2 つの呼び出し（`:93` resume-existing、`:119` resume-recreated/without-recorded-worktree）を削除する。付随するコメント「Resume: recopy draft ...」も削除する。attach-from-checkpoint arm は変更しない。
- [ ] `src/core/runtime/local.ts`: `if (!isRunPath) { await recopyDraftToChangeFolder(...) }` ブロック（446-449 行付近）と import を削除する。
- [ ] `src/core/runtime/managed.ts`: resume arm（`if (!branchName)`）内の `recopyDraftToChangeFolder` 呼び出し（`:167`）と import を削除する。marker 書き込みは残す。

**Acceptance Criteria**:
- `recopyDraftToChangeFolder` の呼び出しが workspace-materializer / local / managed のいずれにも残っていない。
- resume 経路（3 ファイル）に draft から change-folder request.md へのコピーが存在しない。
- `typecheck` が green。

## T-03: run path（job start）3 箇所で実体化 commit 成立後に `consumeDraft` を呼ぶ

commit（managed は push も）が成功した後、実体化ブロックの末尾で `consumeDraft` を呼ぶ（D1）。

- [ ] `src/core/runtime/workspace-materializer.ts` new-run arm: bootstrap OID 記録（`appendSynthesizedCommit`）の後、`opts?.requestFilePath` ブロックの末尾で `await consumeDraft(this.host.cwd, slug, this.host.spawnFn)` を呼ぶ。target は `this.host.cwd`（repo root）。`consumeDraft` を import する。
- [ ] `src/core/runtime/local.ts` no-worktree run path: bootstrap OID 記録の後、`if (isRunPath && opts?.requestFilePath)` ブロックの末尾で `await consumeDraft(this.cwd, slug, this.spawnFn)` を呼ぶ。`consumeDraft` を import する。
- [ ] `src/core/runtime/managed.ts` run path: `git push`（commit 後の push）成功の後、`if (opts?.requestFilePath)` ブロックの末尾で `await consumeDraft(this.cwd, slug, this.spawnFn)` を呼ぶ。`consumeDraft` を import する。

**Acceptance Criteria**:
- 3 つの run-path すべてで、`consumeDraft` 呼び出しが commit（managed は push）成功の後・実体化ブロック内に置かれている。
- commit / rev-parse / push が失敗する経路では `consumeDraft` に到達しない（throw が先行）。
- `typecheck` が green。

## T-04: テストの追加・更新・削除

- [ ] `tests/unit/util/copy-artifacts.test.ts` の TC-RECOPY-001〜005（219-357 行）と、それに伴う `recopyDraftToChangeFolder` import を削除する。同ファイルの TC-SYM-* は無変更で残す。
- [ ] `consumeDraft` の unit test を追加する（temp dir + mock `spawnFn`、既存 copy-artifacts.test.ts の harness を踏襲）:
  - directory 形式 draft を作成 → `git ls-files` は空 stdout（untracked）を返す stub → 消費後 `specrunner/drafts/<slug>/` が消えている。
  - flat 形式 draft を作成 → untracked stub → 消費後 `specrunner/drafts/<slug>.md` が消えている。
  - tracked（`git ls-files` が非空 stdout を返す stub）→ draft が残り、`process.stderr.write` に警告が出る。
  - draft 不在 → no-op（エラーなし、rm 呼び出しなし）。
- [ ] job start 消費 + 順序契約の test を追加する（`tests/unit/core/runtime/` に、`bootstrap-egress-ledger-wm.test.ts` の `WorkspaceMaterializer` + stub `MaterializerHost` harness を踏襲）:
  - **成功時消費**: `host.cwd`（temp repo root）に flat / directory draft を作成 → new-run materialize（spawnFn は全 git success、`rev-parse HEAD` は OID、`ls-files` は空）→ 両 draft が削除されている。
  - **commit 前失敗 → draft 残存**: spawnFn が `commit` に exitCode !== 0 を返す stub → materialize が reject → draft が残っている。
- [ ] resume 無 recopy / 裁定保持の test を追加する（`WorkspaceMaterializer` resume-existing arm）:
  - worktree の `changes/<slug>/request.md` に operator content を事前作成 → repo root に別内容の draft を事前作成 → resume-existing materialize → change-folder request.md が operator content のまま（draft で上書きされない）。
- [ ] `cancel --restore-draft` の復元 pin test を確認/追加する（既存があれば無変更で green を確認、無ければ `restoreDraftFromBranch` 相当を: worktree に `changes/<slug>/request.md`、drafts に draft 不在 → 実行後 `specrunner/drafts/<slug>/request.md` が worktree 内容で作成される）。

**Acceptance Criteria**:
- 追加した consume unit test が flat / directory 削除・tracked 警告・不在 no-op を検証して green。
- job start test が「成功時に両形式 draft 削除」「commit 前失敗で draft 残存」を検証して green。
- resume test が「operator 編集 request.md が resume を跨いで保持され draft に巻き戻らない」を検証して green。
- `cancel --restore-draft` が worktree の request.md から draft を復元することを検証する test が green。
- TC-RECOPY-001〜005 が削除され、他の既存 test は無変更で green。

## T-05: 全体検証

- [ ] `recopyDraftToChangeFolder` が repo 全体（`src/` と `tests/`）に 0 件であることを機械確認する（grep）。
- [ ] archive の draft cleanup（`orchestrator.ts:261-279`）が未変更であることを確認する（backstop 挙動無変更）。
- [ ] `typecheck && test` が green。

**Acceptance Criteria**:
- `recopyDraftToChangeFolder` の grep 結果が 0 件。
- `src/core/archive/orchestrator.ts` の draft 削除ループが本変更で未編集。
- `typecheck && test` が green。
