# Tasks: plain archive の状態遷移を merge 境界に合わせる

実装順序は T-01 → T-07 を推奨（共有抽出 → orchestrator 変更 → plain 経路追加 → CLI 配線 → テスト → docs）。

全タスク共通の不変条件:

- `src/state/lifecycle.ts`（`VALID_TRANSITIONS` / `TERMINAL_STATUSES`）は変更しない。
- `src/core/attach/checkpoint-policy.ts`（`attachArchivePolicy`）は変更しない。
- 新しい CLI コマンド / flag を追加しない。
- `src/core/archive/orchestrator.ts` は GitHubClient を import しない（client-closed 不変）。
- 既存テストのうち変更してよいのは `src/core/archive/__tests__/orchestrator.test.ts` の TC-010（plain archive の旧意味を pin するテスト）のみ。それ以外の archive / from-issue / with-merge 系テストは無変更で green であること。

---

## T-01: archive job context の解決を共有 module へ抽出する

- [ ] `src/core/archive/job-context.ts` を新規作成し、`resolveArchiveJobContext({ cwd, slug })` を実装する
  - `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` で slug 一致 entry を取得し、`updatedAt` 降順の先頭を採用する
  - 返却値: `{ found: true, state, prNumber?: number, branch: string | null, worktreePath: string | null, noWorktree: boolean, archiveRecorded: boolean, recordDir: string }`、一致なしは `{ found: false, message: string }`
  - `archiveRecorded` = `nodePath.basename(nodePath.dirname(sourceChangeDir)) === "archive"`（`merge-then-archive.ts:208-211` の規則をそのまま移設）
  - `recordDir` = `noWorktree ? cwd : (worktreePath ?? cwd)`（`merge-then-archive.ts:213-214` の規則をそのまま移設）
  - `worktreePath` は既存 `resolveWorktreePathForArchive(state, cwd)` を用いて解決する
  - not-found メッセージは既存文言 `No job found with slug '<slug>'. Run 'specrunner ps' to see available jobs.` を保つ
- [ ] `src/core/archive/merge-then-archive.ts` の Step 1 をこの関数の呼び出しに置き換える
  - PR number 不在時の exit 2 メッセージ（`Job <jobId> is missing PR number. Was the pr-create step completed?`）は with-merge 側の gate として現状のまま残す
  - `jobStateForFloor` は返却された `state` を用いる
  - state 読み込み時の例外を exit 2 に変換する既存挙動を維持する

**Acceptance Criteria**:
- `src/core/archive/job-context.ts` が存在し、`resolveArchiveJobContext` を export する
- `merge-then-archive.ts` に `archiveRecorded` / `recordDir` の導出ロジックが重複して残っていない
- `src/core/archive/__tests__/merge-then-archive.test.ts` を**無変更**で実行し全て green（`listWithSourceDirs` が `(cwd, { includeArchived: true })` で呼ばれることを pin する既存 assertion を含む）
- `bun run typecheck` / `bun run build` が成功する

---

## T-02: post-merge 完了処理を共有 module へ抽出する

- [ ] `src/core/archive/merge-completion.ts` を新規作成する
  - `completeAfterMerge(input, stdoutWrite)`: `markJobArchived(slug, recordDir)` を best-effort で呼び（成功時 `Job <slug> marked as archived.` を stdout、失敗時は `stderrWrite` に警告を出して継続）、続けて `runPostMergeCleanup({ slug, cwd, branch, worktreePath, noWorktree, baseBranch, spawn, fs, worktreeManagerFn })` を呼ぶ
  - `mergedBeforeRecordEscalation({ slug, prNumber, baseBranch, resumeCommand })`: `merge-then-archive.ts:262-274` の escalation を生成する（`failedStep` / `detectedState` / `recommendedAction` の文言はそのまま、`resumeCommand` のみ引数化）
- [ ] `merge-then-archive.ts` の `performPostMergeTransition` を削除し、3 箇所（Step 2 の already-merged resume / wait ループ内の merge 検出 / Step 6 の merge 成功後）を `completeAfterMerge` 呼び出しへ置き換える
- [ ] `merge-then-archive.ts` の記帳前 merge escalation を `mergedBeforeRecordEscalation({ ..., resumeCommand: "specrunner job archive --with-merge <slug>" })` へ置き換える

**Acceptance Criteria**:
- `markJobArchived` → `runPostMergeCleanup` の順序が `completeAfterMerge` 内で保証される（transition が throw しても cleanup が走る）
- `merge-then-archive.ts` が `markJobArchived` / `runPostMergeCleanup` を直接呼ぶ箇所が無い
- `src/core/archive/__tests__/merge-then-archive.test.ts` を**無変更**で実行し全て green（特に TC-004 / TC-005 / TC-006 / TC-014 / TC-015 / TC-016 と `markJobArchived` の呼び出し引数 assertion）
- `bun run typecheck` / `bun run build` が成功する

---

## T-03: archive orchestrator から terminal transition を取り除く

- [ ] `src/core/archive/orchestrator.ts` の `markJobArchived` 呼び出しブロック（`orchestrator.ts:240-258`）を削除する
- [ ] `markJobArchived` の import を削除する（`assertJobFinishable` の import は維持）
- [ ] `ArchiveInput.deferArchivedTransition` フィールドは**残す**が、JSDoc を「deferral は無条件になったため入力は無視される。`--with-merge` 呼び出し側との契約互換のためだけに残る deprecated 入力」に書き換える
- [ ] module 冒頭の docstring から `markJobArchived` を除き、「記帳のみ・status 遷移は行わない」ことを Phase 1 の説明に反映する
- [ ] 他の副作用（change folder mv / draft 削除 / topic emission / mark-hook / commit / push / headSha 取得 / terminal 短絡 / finishable gate）は一切変更しない

**Acceptance Criteria**:
- `src/core/archive/orchestrator.ts` に `markJobArchived` の参照が存在しない
- `orchestrator.ts` が GitHubClient を import していない
- `deferArchivedTransition` の有無で `runArchiveOrchestrator` の副作用が変わらない
- `src/core/archive/__tests__/orchestrator.test.ts` の TC-010 以外のテスト（T-01〜T-10 / T-DTE-01〜03 / TC-009）が無変更で green（ここで TC-009 は `orchestrator.test.ts` 内のテストラベル「deferArchivedTransition: true → markJobArchived NOT called」を指す。`test-cases.md` の TC-009「merge-then-archive.ts が markJobArchived / runPostMergeCleanup を直接呼ばない」とは別物）
- `bun run typecheck` / `bun run build` が成功する

---

## T-04: plain 経路 module `runPlainArchive` を追加する

- [ ] `src/core/archive/plain-archive.ts` を新規作成し、`runPlainArchive(input, stdoutWrite)` を実装する
  - 入力: `{ slug, cwd, spawn, fs, baseBranch?, githubToken?, designLayer?, githubClient?, owner?, repo?, worktreeManagerFn? }`
  - 戻り値は既存 `ArchiveResult`（`{ exitCode: 0; headSha? } | { exitCode: 1; escalation } | { exitCode: 2; message }`）を再利用する
  - `githubClient` は型のみ import（`GitHubClient` port）し、optional とする
- [ ] 処理順序を実装する
  1. `resolveArchiveJobContext({ cwd, slug })`。not-found → `{ exitCode: 2, message }`
  2. `TERMINAL_STATUSES.has(state.status)` → `Already finished (<status>).` を stdout に出し `{ exitCode: 0 }`（PR 問い合わせ・記帳・cleanup は行わない）
  3. `githubClient && owner && repo && prNumber` が揃うときのみ `getPullRequest(owner, repo, prNumber)` を呼ぶ
     - 例外 → `stderrWrite` に警告（merge 状態未確認のため terminal transition を保留する旨）を出し、記帳へ進む
     - `state === "MERGED"` かつ `archiveRecorded` → `completeAfterMerge(...)` → `{ exitCode: 0 }`（orchestrator は呼ばない）
     - `state === "MERGED"` かつ `!archiveRecorded` → `mergedBeforeRecordEscalation({ ..., resumeCommand: "specrunner job archive <slug>" })` → `{ exitCode: 1, escalation }`
     - それ以外 → 記帳へ進む
  4. `runArchiveOrchestrator({ slug, cwd, spawn, fs, baseBranch, githubToken, designLayer, deferArchivedTransition: true })` を呼ぶ。`exitCode !== 0` ならその結果をそのまま返す
  5. 記帳成功後:
     - `prNumber` あり → `markJobArchived` は呼ばず、stdout に「archive record を push した / job は `awaiting-archive` のまま / PR #<n> の merge 後に `specrunner job archive <slug>` を再実行すると `archived` + cleanup まで完了する」旨を出力し `{ exitCode: 0, headSha }`
     - `prNumber` なし → `markJobArchived(slug, recordDir)` を呼び（失敗時は escalation を返す）、PR が無いため merge 境界なしで terminal にした旨を stdout に出力し `{ exitCode: 0, headSha }`。post-merge cleanup は呼ばない
- [ ] check status 取得 / merge 実行 / CI 待ちのコードを一切含めない
- [ ] `KeepAlive` は `runArchiveOrchestrator` 内で取得されるため二重取得しない

**Acceptance Criteria**:
- `plain-archive.ts` が `getCheckStatus` / `mergePullRequest` を参照しない
- `runPostMergeCleanup` の呼び出しが `MERGED` 検出分岐の内側にのみ存在する（`completeAfterMerge` 経由）
- `markJobArchived` の呼び出しが「MERGED 検出後（`completeAfterMerge` 経由）」と「PR 無し job の記帳成功後」の 2 箇所のみである
- `MERGED` 検出時に `runArchiveOrchestrator` が呼ばれない
- `bun run typecheck` / `bun run build` が成功する

---

## T-05: CLI の非 --with-merge 分岐を runPlainArchive に配線する

- [ ] `src/cli/archive.ts` の `opts.withMerge` が false の分岐で `runArchiveOrchestrator` の直呼びをやめ、`runPlainArchive` を呼ぶ
- [ ] 同分岐で GitHub client を best-effort に構築する
  - config 読込 → `resolveGitHubHost` / `resolveGitHubApiBaseUrl`（失敗時は既定値）
  - `resolveGitHubToken` → 失敗時は token / client とも undefined のまま続行（既存の best-effort 挙動を維持）
  - `getOriginInfo(opts.cwd, githubHost)` → 失敗時は owner/repo undefined のまま続行
  - token と origin が揃ったときのみ `createGitHubClient(fetch, token, apiBaseUrl)` を渡す
  - client 構築のいずれかの段階で失敗しても exit code に影響させない（例外を外へ投げない）
- [ ] `designLayer` / `baseBranch` / `githubToken` の解決と受け渡しは既存どおり維持する
- [ ] `--with-merge` 分岐（`runMergeThenArchive` 呼び出しと config 解決）は一切変更しない

**Acceptance Criteria**:
- `runArchive({ withMerge: false })` が `runPlainArchive` に委譲する
- GitHub token / origin が解決できない環境でも plain archive が exit code 0 で完了する
- `tests/unit/cli/archive-minimum-assurance.test.ts`（with-merge の config 伝播）が無変更で green
- `src/cli/__tests__/archive-from-issue.test.ts`（`runArchive` への委譲を pin）が無変更で green
- `tests/dead-code-adapter-cli.test.ts`（`src/cli/archive.ts` の dry-run 不在 / ARCHIVE_USAGE 構造）が無変更で green

---

## T-06: テストを新契約に更新・追加する

- [ ] `src/core/archive/__tests__/orchestrator.test.ts` の TC-010 を新契約へ更新する
  - 旧: `deferArchivedTransition` 未指定 → `markJobArchived` が呼ばれる
  - 新: `deferArchivedTransition` 未指定 → `markJobArchived` が呼ばれない。かつ mv / commit / push / headSha は実行される
  - ファイル冒頭の TC 一覧コメントも新しい意味に更新する
- [ ] `src/core/archive/__tests__/plain-archive.test.ts` を新規作成する（module mock は `merge-then-archive.test.ts` と同じ構成: `store/job-state-store.js` / `../orchestrator.js` / `../post-merge-cleanup.js` / `../../finish/job-state-update.js` / `logger/stdout.js`）
  - PR `OPEN` → orchestrator が呼ばれる / `markJobArchived` 未呼び出し / `runPostMergeCleanup` 未呼び出し / exit 0
  - PR `MERGED` + archiveRecorded → `markJobArchived` + `runPostMergeCleanup` が呼ばれる / orchestrator 未呼び出し / exit 0
  - PR `MERGED` + !archiveRecorded → exit 1 escalation / `markJobArchived` 未呼び出し / `runPostMergeCleanup` 未呼び出し
  - `githubClient` 未注入 → orchestrator が呼ばれる / transition・cleanup なし / exit 0
  - `getPullRequest` が throw → orchestrator が呼ばれる / transition・cleanup なし / exit 0
  - `pullRequest` 無し job → orchestrator が呼ばれる / `markJobArchived` が呼ばれる / `runPostMergeCleanup` 未呼び出し / `getPullRequest` 未呼び出し
  - status が `archived` → orchestrator・`getPullRequest`・cleanup いずれも未呼び出し / exit 0
  - `getCheckStatus` / `mergePullRequest` が一度も呼ばれない（CI 非観測の pin）
  - 記帳済み・未merge からの再実行 → orchestrator が `skipped` 相当（`archiveChangeFolder` / `commitArchive` skip）でも exit 0 かつ transition なし
  - 記帳成功時の stdout に再実行案内が含まれる
- [ ] CLI 配線テスト（`tests/unit/cli/` 配下、例: `archive-plain-merge-detection.test.ts`）を新規作成する
  - token / origin が解決できる場合 → `runPlainArchive` に `githubClient` / `owner` / `repo` が渡る
  - token 解決に失敗する場合 → `runPlainArchive` は呼ばれるが `githubClient` は undefined、exit code は 0
- [ ] 既存テストの回帰確認: `bun run test` 全体を実行し、変更したのが TC-010 のみであることを確認する

**Acceptance Criteria**:
- 更新は `orchestrator.test.ts` の TC-010 のみ。他の既存 archive / from-issue / with-merge テストの差分がゼロ
- 新規テストが受け入れ基準 8 項目（awaiting-archive 維持 / feature branch への push / CI failure でも awaiting-archive / out-of-band merge 後の完結 / with-merge 維持 / 記帳済み再実行の冪等性 / merge 前 cleanup なし）をカバーする
- `bun run test` が全て green
- `bun run lint` が green

---

## T-07: コマンド help と README を新しい契約に合わせる

- [ ] `src/cli/command-registry.ts` の `ARCHIVE_USAGE` を更新する
  - 先頭行の `Archive the completed change folder` という文字列は**残す**（`tests/unit/cli/help-flag-dispatch.test.ts` が pin している）
  - 「plain 実行は archive record を feature branch に積み、PR が merge されるまで job は `awaiting-archive` のまま。merge 後に同じコマンドを再実行すると `archived` + cleanup が完了する」旨を追記する
  - `--from-issue` / `--with-merge` / `--merge-wait-ms` の記述と相互排他の注記は維持する
- [ ] 同ファイルの `job archive <slug>` の help summary（`change folder 移動・worktree 撤去・status 更新`）を新しい意味（archive record 記帳 / merge 後に terminal）に合わせる
- [ ] `README.md` の Job commands 一覧の `specrunner job archive <slug>` の説明行を新しい意味に更新する（`--with-merge` を使う既存例は変更しない）

**Acceptance Criteria**:
- `ARCHIVE_USAGE` に `Archive the completed change folder` が含まれたままである
- `ARCHIVE_USAGE` に「merge 前は awaiting-archive のまま」「merge 後の再実行で完了」が明記されている
- `tests/unit/cli/help-flag-dispatch.test.ts` / `src/cli/__tests__/archive-from-issue.test.ts` の `ARCHIVE_USAGE` 関連テストが無変更で green
- `bun run test` / `bun run lint` が green
