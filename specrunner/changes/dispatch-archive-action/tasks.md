# Tasks: Actions dispatch に archive を追加し、merge 後の head branch 削除に耐える

## T-01: dispatch workflow に archive action を追加する

対象: `.github/workflows/specrunner-dispatch.yml`

- [x] `on.workflow_dispatch.inputs.action.options` に `- archive` を追加する（`start` / `resume` は維持、`default: start` も維持）
- [x] `action` の `description` を archive を含む説明に更新する（例: `start: issue 本文から新規 job を起動 / resume: escalation 済み job を再開 / archive: 完走した job を取り込む`）
- [x] ファイル冒頭のコメントブロックに archive の 1 段落を追加する。2 相であること（1 回目 = archive record 作成で `awaiting-archive` 維持、PR merge 後に再実行して完了）と、相判定は CLI 側にあることを書く
- [x] `Run pipeline` step の shell 分岐に archive の枝を追加する。既存の `if [ "$ACTION" = "resume" ] ... else ... fi` に `elif [ "$ACTION" = "archive" ]; then` を挿入し、本文は `bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` の 1 行のみとする
- [x] `--with-merge` を付けない。PR / merge 状態を見るコマンド（`gh pr` 等）を足さない
- [x] `env:` block は変更しない（`ISSUE` / `ACTION` は既に渡っている）
- [x] `concurrency.group` / `permissions` / checkout 以降の step 構成は変更しない

**Acceptance Criteria**:
- `action` の `options` が `start` / `resume` / `archive` の 3 件になっている
- `$ACTION` が `archive` のときの分岐本文が `job archive --from-issue "$ISSUE"` の呼び出し 1 件のみで構成されている
- workflow yaml 全体に `--with-merge` の文字列が存在しない
- `resume` / `start` の分岐本文が従来と一致している（引数の条件付き付与を含む）
- `tests/grep-workflow-actions-pinned.test.ts` が無変更で green（`uses:` 行を触っていないこと）

---

## T-02: archive record からの slug 解決を core に追加する

対象: `src/core/archive/job-context.ts`

- [x] `isArchiveRecordDir(sourceChangeDir: string): boolean` を export する。実装は `nodePath.basename(nodePath.dirname(sourceChangeDir)) === "archive"`
- [x] `resolveArchiveJobContext` 内の `archiveRecorded` 算出（現行のインライン式）を `isArchiveRecordDir(sourceChangeDir)` の呼び出しに置き換える。判定内容は変えない
- [x] `resolveArchivedSlugByJobId({ cwd, jobId, issueNumber }: { cwd: string; jobId: string; issueNumber: number }): Promise<string | null>` を export する
- [x] 実装: `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` を呼び、`entry.state.jobId === jobId` かつ `entry.state.issueNumber === issueNumber` かつ `isArchiveRecordDir(entry.sourceChangeDir)` を満たす最初の entry を選ぶ
- [x] 該当 entry の `getJobSlug(entry.state)` が空文字列でなければそれを返す。該当なし、または slug が空文字列なら `null` を返す
- [x] 多重一致の分岐・エラーは実装しない（`listWithSourceDirs` が jobId で dedup 済みのため到達しない）
- [x] 新規 import を追加しない（`nodePath` / `JobStateStore` / `getJobSlug` は既に import 済み）。`src/adapter` / `src/cli` を import しない
- [x] JSDoc に「merge 後は base に載った archive record が正である」ことと、jobId + issueNumber の 2 field 照合である理由を書く

**Acceptance Criteria**:
- `isArchiveRecordDir` / `resolveArchivedSlugByJobId` が `src/core/archive/job-context.ts` から export されている
- `resolveArchiveJobContext` の `archiveRecorded` が `isArchiveRecordDir` を経由して算出されている（archive record の判定式がファイル内に 2 つ存在しない）
- `src/core/archive/job-context.ts` の import 集合が変更前と同一である
- `src/core/archive/__tests__/` 配下の既存テストが無変更で green

---

## T-03: `runArchiveFromIssue` に archive record fallback を挿入する

対象: `src/cli/archive-from-issue.ts`

- [x] `resolveArchivedSlugByJobId` を `../core/archive/job-context.js` から import する
- [x] `localState !== null` の分岐（既存）の直後、closing PR 解決ブロック（`resolveArchiveBranchFromIssue` 以降）の**前**に、archive record fallback の分岐を挿入する
- [x] fallback 分岐: `resolveArchivedSlugByJobId({ cwd: repoRoot, jobId, issueNumber })` を呼び、非 null なら `slug` に代入して以降の解決処理をすべて skip する
- [x] fallback が hit したとき、`resolveArchiveBranchFromIssue` / `runAttachVerification` / `LocalRuntime#setupWorkspace` をいずれも呼ばない
- [x] fallback が hit したとき、post-merge 経路であることが分かる 1 行を stdout に出す（例: 解決元が base 上の archive record である旨と slug）
- [x] fallback が `null` を返したときは、既存の closing PR + attach 経路をそのまま実行する（既存コードを移動・改変しない）
- [x] 最終の `runArchive({ slug, withMerge: opts.withMerge, cwd: repoRoot, mergeWaitMs: opts.mergeWaitMs })` 呼び出しは 3 経路で共有したまま変更しない
- [x] `runPlainArchive` / `completeAfterMerge` / `runPostMergeCleanup` / `runAttachVerification` / `resolveCheckpointSlug` / `loadStateByJobId` を変更しない
- [x] ファイル冒頭の JSDoc（現在は「completed marker → local short-circuit → closing-PR → rebind → archive」）を 3 段の解決順序に更新する

**Acceptance Criteria**:
- 解決順序が local state → archive record → closing PR + attach の 3 段になっている
- `src/core/attach/` / `src/core/issue-target/` / `src/core/archive/plain-archive.ts` / `src/core/archive/merge-completion.ts` / `src/git/checkpoint-ref.ts` / `src/core/job-access/load-by-job-id.ts` に差分が無い
- 新しい job status / pipeline step / verifier / error code を追加していない

---

## T-04: 設定検査テスト（dispatch workflow）

対象: 新規 `tests/dispatch-workflow-archive-action.test.ts`

- [x] `.github/workflows/specrunner-dispatch.yml` を `fs.readFile` で読む（`tests/grep-workflow-actions-pinned.test.ts` の `path.resolve(__dirname, "../.github/workflows")` と同じ解決方法を使う）
- [x] yaml parser package を追加しない。テストファイル内に indent scope で block を切り出す helper を書く
- [x] helper 1: 指定した key 行（例: `action:` → その配下の `options:`）から、より深い indent が続く範囲を block として返す
- [x] helper 2: `run: |` script 本文を取り出し、`$ACTION` の分岐（`if` / `elif` / `else` の各枝）ごとに本文行を返す
- [x] `on.workflow_dispatch.inputs.action.options` の block を切り出し、`- ` 要素列が `start` / `resume` / `archive` を含むことを assert する
- [x] archive 分岐の本文行（空行・コメント除去後）が 1 行であり、`job archive` と `--from-issue` と `"$ISSUE"` を含むことを assert する
- [x] archive 分岐の本文に `--with-merge` が含まれないことを assert する
- [x] workflow yaml 全体に `--with-merge` が含まれないことを assert する
- [x] `resume` 分岐の本文に `job resume --from-issue` が、`else`（start）分岐の本文に `job start --from-issue` が含まれることを assert する（既存分岐の非退行）
- [x] block 抽出に失敗した場合（`options:` が見つからない等）は、抽出できなかった旨と読み取った block をそのまま error message に含めて fail させる

**Acceptance Criteria**:
- ファイル全体に対する素の `expect(content).toContain("archive")` を使っていない（すべて切り出した block に対する assert である）
- `package.json` の `dependencies` / `devDependencies` / `optionalDependencies` に差分が無い
- T-01 の workflow 変更を revert すると本テストが fail する

---

## T-05: archive record fallback の解決テスト（core）

対象: 新規 `src/core/archive/__tests__/archived-slug-by-job-id.test.ts`

- [x] tmpdir に実ファイルで `<tmp>/specrunner/changes/archive/2026-01-01-<slug>/state.json` を作る fixture helper を書く（既存 `src/store/__tests__/job-state-store-list-with-source-dirs.test.ts` の fixture 構成を参照する）
- [x] state.json には `jobId` / `issueNumber` / `request.slug` / `status: "awaiting-archive"` / `updatedAt` / `pullRequest.number` を含める
- [x] jobId + issueNumber 一致の archive record → 当該 slug が返ること
- [x] jobId 不一致（issueNumber 一致）→ `null` が返ること
- [x] issueNumber 不一致（jobId 一致）→ `null` が返ること
- [x] `issueNumber` を持たない record（jobId 一致）→ `null` が返ること
- [x] active な `<tmp>/specrunner/changes/<slug>/state.json`（archive 配下ではない）に jobId + issueNumber 一致の state がある → `null` が返ること
- [x] archive dir 自体が存在しない tmpdir → `null` が返ること
- [x] 同じ fixture に対し `resolveArchiveJobContext({ cwd, slug })` を呼び、`archiveRecorded === true` になることを assert する（fallback が返す slug と `archiveRecorded` の整合を pin する）

**Acceptance Criteria**:
- 上記 7 ケースがすべて green
- `resolveArchivedSlugByJobId` の照合条件のいずれか 1 つ（jobId / issueNumber / archive 配下）を実装から外すと、対応するケースが fail する

---

## T-06: 解決順序 routing テスト（CLI）

対象: `src/cli/__tests__/archive-from-issue.test.ts`（既存ファイルへの追記 + 最小限の更新）

- [x] `vi.mock("../../core/archive/job-context.js", ...)` を追加し、`resolveArchivedSlugByJobId` を mock 化する（既定は `null` を返す = miss）
- [x] 既存 TC-018（local state hit）: `resolveArchivedSlugByJobId` が呼ばれないことの assert を追加する。既存の assert は変更しない
- [x] 既存 TC-019（closing PR 経路）: `resolveArchivedSlugByJobId` が `null` を返す前提を beforeEach に明示する。既存の assert（`resolveArchiveBranchFromIssue` / `runAttachVerification` が呼ばれる）は変更しない
- [x] 新規ケース「post-merge / head branch 削除済み」: `loadStateByJobId` が `JOB_NOT_FOUND`、`resolveArchivedSlugByJobId` が `"archived-slug"` を返す。assert:
  - [x] `resolveArchiveBranchFromIssue` が呼ばれない（= closing PR 列挙と `git fetch` を経ない）
  - [x] `runAttachVerification` が呼ばれない
  - [x] `LocalRuntime#setupWorkspace` が呼ばれない（mock でカバー）
  - [x] `runArchive` が `{ slug: "archived-slug" }` を含む引数で呼ばれる
  - [x] `runArchiveFromIssue` の戻り値が 0（`runArchive` mock が 0 を返す前提）
- [x] 新規ケース「fallback miss + closing PR 経路も不成立」: `resolveArchivedSlugByJobId` が `null`、`resolveArchiveBranchFromIssue` が `archiveFromIssueUnconfirmedError` を throw → 戻り値が `ARCHIVE_FROM_ISSUE_UNCONFIRMED` の exit code（`EXIT_CODE.ARG_ERROR`）であることを assert する
- [x] 新規ケース「`resolveArchivedSlugByJobId` に jobId と issueNumber が渡る」: 呼び出し引数が `{ jobId: "test-job-id", issueNumber: 42 }` を含むことを assert する
- [x] 既存 TC-015 / TC-016 / TC-017 / TC-025 / TC-026 / TC-027 / TC-028 は変更しない

**Acceptance Criteria**:
- 上記の新規ケースがすべて green
- 変更したのは TC-018 / TC-019 の 2 describe（および共通 mock 定義）のみで、他の describe は無変更
- `--with-merge` 経路（TC-017）が無変更で green

---

## T-07: 非退行確認

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] `bun run lint` が green
- [x] `src/core/archive/__tests__/plain-archive.test.ts`（#1051 の `awaiting-archive` 維持を pin）が無変更で green
- [x] `src/core/issue-target/__tests__/archive.test.ts` が無変更で green
- [x] `src/cli/__tests__/attach.test.ts` / `src/cli/__tests__/resume-from-issue.test.ts` が無変更で green
- [x] `tests/unit/architecture/` 配下の DSM / 不変条件テストが無変更で green
- [x] `git diff --stat` を確認し、変更ファイルが次の範囲に収まっていること: `.github/workflows/specrunner-dispatch.yml` / `src/core/archive/job-context.ts` / `src/cli/archive-from-issue.ts` / `src/cli/__tests__/archive-from-issue.test.ts` / 新規テスト 2 件 / `specrunner/changes/dispatch-archive-action/tasks.md`

**Acceptance Criteria**:
- `typecheck && test && lint` がすべて green
- 上記以外の source file に差分が無い
- `package.json` の依存 3 種に差分が無い
