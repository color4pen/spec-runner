# Tasks: awaiting-archive checkpoint の issue 起点取り込み

<!-- Implementer note: tests are vitest, colocated under __tests__/. Mirror existing patterns in
src/core/issue-target/__tests__/resume.test.ts and src/cli/__tests__/resume-from-issue.test.ts.
Do NOT modify src/core/attach/verify-checkpoint.ts generic layer, the archive orchestrator bodies
(merge-then-archive.ts / archive/orchestrator.ts), or the resume locator (issue-target/resume.ts). -->

## T-01: awaiting-archive policy + quiescent composite (D1, D2)

- [ ] `src/core/attach/checkpoint-policy.ts` に `attachArchivePolicy: CheckpointVerificationPolicy` を追加する。
      verify は 2 点のみ: `state.status !== "awaiting-archive"` → `checkpointNotAttachableError("not-quiescent", ...)`,
      `state.pullRequest?.number` 欠落 → `checkpointNotAttachableError("missing-pr-number", ...)`。
      resumePoint / pipeline descriptor / reads() precheck は課さない。
- [ ] 同ファイルに `attachQuiescentPolicy: CheckpointVerificationPolicy` を追加する。
      `ctx.state.status === "awaiting-resume"` → `attachResumePolicy.verify(ctx)`、
      `=== "awaiting-archive"` → `attachArchivePolicy.verify(ctx)`、それ以外 →
      `checkpointNotAttachableError("not-quiescent", ...)` に委譲/分岐する。
- [ ] `attachResumePolicy` と generic 層（verify-checkpoint.ts）は無改変であることを確認する。
- [ ] `src/core/attach/__tests__/checkpoint-policy.test.ts`（新規）を追加し、`attachArchivePolicy` を
      `verifyCheckpoint(input, attachArchivePolicy)` 経由で検証する（fixture は awaiting-archive/awaiting-resume/
      running の state.json を用意。既存の verify-checkpoint fixture 構築手順に倣う）。

**Acceptance Criteria**:
- awaiting-archive + `pullRequest.number` 有りの checkpoint が accept される。
- awaiting-resume / running の checkpoint が `not-quiescent` で reject される。
- awaiting-archive で `pullRequest.number` 欠落が reject される。
- `attachResumePolicy` と `verifyCheckpoint` 本体の diff がない。

## T-02: runAttachVerification に policy 注入点を追加 (D3)

- [ ] `src/core/attach/orchestrator.ts` の `AttachVerificationInput` に
      `policy?: CheckpointVerificationPolicy` を追加し、`verifyCheckpoint(..., input.policy)` へ素通しする
      （未指定時は verifyCheckpoint の default = attachResumePolicy が効く）。
- [ ] import は `../attach/checkpoint-policy.js` の型のみ（generic 層は触らない）。

**Acceptance Criteria**:
- `policy` 未指定の `runAttachVerification` 呼び出しは従来どおり attachResumePolicy で検証される
      （resume-from-issue の既存挙動不変）。
- `policy` 指定時はその policy が verifyCheckpoint に渡る。
- `typecheck` が green。

## T-03: job attach を両 status 受理・hint 出し分けに変更 (D2)

- [ ] `src/cli/attach.ts` の `runAttachVerification(...)` 呼び出しに `policy: attachQuiescentPolicy` を渡す。
- [ ] 成功時の next-step hint（現行 line 161-163 の固定文言）を `verified.state.status` で分岐する:
      awaiting-resume → `Run 'specrunner job resume <slug>' ...`、
      awaiting-archive → `Run 'specrunner job archive <slug> --with-merge' ...`。
- [ ] `src/cli/__tests__/attach.test.ts`（新規）を追加。resume-from-issue.test.ts の mock 方式に倣い
      `runAttachVerification` / `LocalRuntime` / config / github client / logger を mock し、
      awaiting-archive と awaiting-resume の両 status で `runAttach` が成功し hint 文言が status に一致することを固定する。

**Acceptance Criteria**:
- awaiting-archive checkpoint の attach が成功し、hint に `job archive` `--with-merge` が含まれる。
- awaiting-resume checkpoint の attach が成功し、hint に `job resume` が含まれる。
- attach.ts が composite policy を明示的に渡している。

## T-04: completed marker parse/resolve (D4)

- [ ] `src/core/notify/issue-notifier.ts` に `parseCompletedJobId(body: string): string | null` を追加する
      （`kind="completed"` 専用 regex。`ESCALATION_MARKER_RE` と対称に `COMPLETED_MARKER_RE` を定義し、
      `buildMarker("completed", jobId)` の逆関数にする）。
- [ ] `src/core/issue-target/archive.ts`（新規）に `resolveCompletedJobId(input)` を追加する
      （`resolveEscalationJobId` と対称: `client.listIssueComments` を全走査 → `parseCompletedJobId` で収集 →
      createdAt 降順で最新を採用 → 0 件は `archiveFromIssueNoMarkerError(issueNumber)`）。
- [ ] narrow client 型 `IssueArchiveClient = Pick<GitHubClient, "listIssueComments" | "listIssueClosingPullRequests">`
      を archive.ts に定義する（DSM: domain 層は kernel port のみ import）。
- [ ] `src/core/issue-target/__tests__/archive.test.ts`（新規）に completed marker 解決のテストを追加する。

**Acceptance Criteria**:
- `parseCompletedJobId` が `buildMarker("completed", jobId)` と round-trip し、escalation marker では null を返す。
- `resolveCompletedJobId` が escalation marker を無視し、複数 completed marker で最新を選ぶ。
- completed marker 不在で `ARCHIVE_FROM_ISSUE_NO_MARKER` が throw される。

## T-05: closing-PR 列挙メソッドを port + adapter に追加 (D5)

- [ ] `src/kernel/github-client.ts` の `GitHubClient` interface に
      `listIssueClosingPullRequests(owner: string, repo: string, issueNumber: number): Promise<Array<{ number: number; headRefName: string }>>`
      を追加する（doc comment: fail-closed。非2xx / GraphQL errors / null issue は GITHUB_API_ERROR）。
- [ ] `src/adapter/github/github-client.ts` に実装を追加する。GraphQL
      `closedByPullRequestsReferences(first: 50) { nodes { number headRefName } }` を単発クエリで発行し、
      `{ number, headRefName }` 配列を返す。null issue / GraphQL errors / 非2xx は `githubApiError` を throw する
      （既存 `listIssueLinkedBranches` の error handling を踏襲）。
- [ ] `src/adapter/github/__tests__/` に既存 adapter テストがあれば closing-PR 応答マッピングの単体テストを追加する
      （無ければ本項はスキップ可 — locator テスト T-06 が振る舞いを固定する）。

**Acceptance Criteria**:
- `GitHubApiClient` が `listIssueClosingPullRequests` を実装し `typecheck` が green（唯一の full 実装は adapter）。
- GraphQL 応答 `nodes: [{number, headRefName}]` が `{number, headRefName}[]` に写る。
- null issue / GraphQL errors で GITHUB_API_ERROR が throw される。

## T-06: closing-PR branch locator (4 点照合) (D5)

- [ ] `src/core/issue-target/archive.ts` に `resolveArchiveBranchFromIssue(input)` を追加する。
      `client.listIssueClosingPullRequests` で候補 PR を列挙 → 0 件は `archiveFromIssueNoPrError(issueNumber)`。
- [ ] 各候補 PR について `spawnFn("git", ["fetch", "origin", headRefName])` → `rev-parse origin/<headRefName>^{commit}` →
      `readStateJsonFromRef` → 軽量 JSON parse を行い、4 点照合
      （`jobId` / `issueNumber` / `branch === headRefName` / `pullRequest.number === PR.number`）で confirmed に集める。
      fetch/rev-parse/parse 失敗・不一致は `logWarn` して skip。
- [ ] confirmed 1 件 → `{ branch, slug, checkpointOid }` を返す。0 件 / 複数 → `archiveFromIssueUnconfirmedError(detail)`。
- [ ] 軽量 identity 型に `pullRequest?: { number?: number }` を含める（archive.ts 内で定義。resume.ts の型は流用しない）。
- [ ] `src/core/issue-target/__tests__/archive.test.ts` に locator のテストを追加する
      （resume.test.ts の `makeSpawnFn` 方式に倣う。state.json fixture に `pullRequest.number` を含める）。

**Acceptance Criteria**:
- 一意 4 点一致で branch/slug/checkpointOid が返る。
- closing PR 0 件で `ARCHIVE_FROM_ISSUE_NO_PR`。
- confirmed 複数で `ARCHIVE_FROM_ISSUE_UNCONFIRMED`。
- 4 点のいずれか（特に PR number）不一致の候補が skip され、他に確定が無ければ `ARCHIVE_FROM_ISSUE_UNCONFIRMED`。

## T-07: archive-from-issue の typed error (D10)

- [ ] `src/errors.ts` の `ERROR_CODES` に `ARCHIVE_FROM_ISSUE_NO_MARKER` / `ARCHIVE_FROM_ISSUE_NO_PR` /
      `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を追加し、`EXIT_CODE_MAP` で 3 つとも `EXIT_CODE.ARG_ERROR`(2) に割り当てる。
- [ ] factory を追加する: `archiveFromIssueNoMarkerError(issueNumber)` /
      `archiveFromIssueNoPrError(issueNumber)`（hint に `job attach --branch` 手動経路を案内）/
      `archiveFromIssueUnconfirmedError(detail)`。resume 版 factory の文面に倣う。

**Acceptance Criteria**:
- 3 コードが `ERROR_CODES` に存在し、各 factory が対応 code と exitCode 2 を返す。
- `archiveFromIssueNoPrError` の hint に `job attach --branch` が含まれる。

## T-08: runArchiveFromIssue CLI orchestrator (D6, D7, D9)

- [ ] `src/cli/archive-from-issue.ts`（新規）に `runArchiveFromIssue(issueNumber, opts, ctx?)` を追加する。
      resume-from-issue.ts の骨格に倣い: config load → `config.runtime === "local"` 確認（非 local は
      `attachRuntimeUnsupportedError`）→ token / origin 解決 → githubClient + transport-auth spawn 構築。
- [ ] jobId 解決: `resolveCompletedJobId({ client, owner, repo, issueNumber })`。
- [ ] local short-circuit: `loadStateByJobId(repoRoot, jobId)` が返れば slug を `getJobSlug` で得て
      直接 `runArchive` へ（rebind せず）。`JOB_NOT_FOUND`（code 判定）のみ次段へ。
- [ ] branch 解決 + rebind: `resolveArchiveBranchFromIssue(...)` → `runAttachVerification({ ..., policy: attachArchivePolicy })`
      → `LocalRuntime.setupWorkspace(verified.slug, verified.jobId, { attachCheckpoint: { branch, checkpointRef: checkpointOid }, baseBranch })`。
      slug は `verified.slug` を採用する。
- [ ] archive 実行接続: 両経路とも最後に `runArchive({ slug, withMerge: opts.withMerge, cwd: repoRoot, mergeWaitMs: opts.mergeWaitMs })`
      を呼んで exit code を返す。archive orchestrator 本体は触らない。
- [ ] `--detach` は追加しない。
- [ ] `src/cli/__tests__/archive-from-issue.test.ts`（新規）を追加。resume-from-issue.test.ts の mock 方式に倣い、
      (a) local short-circuit で locator/rebind が呼ばれず runArchive が local slug で呼ばれる、
      (b) local 無し時に resolve → rebind → runArchive の順で verified slug が渡る、
      (c) `withMerge` が runArchive に引き継がれる、を固定する。

**Acceptance Criteria**:
- local state 有りで `resolveArchiveBranchFromIssue` / `runAttachVerification` が呼ばれず `runArchive` に直行する。
- local state 無しで rebind（awaiting-archive policy）後に verified slug で `runArchive` が呼ばれる。
- `--with-merge` が `runArchive` の `withMerge` に反映される。
- 非 local runtime で `attachRuntimeUnsupportedError`（exit code）が返る。

## T-09: command-registry の archive 配線 (D8)

- [ ] `src/cli/command-registry.ts` の archive command に `"from-issue": { type: "integer", min: 1 }` flag を追加し、
      `args` の slug を `required: false` に変更する。
- [ ] handler で厳密 XOR を強制する: `fromIssue !== undefined && positional !== undefined` → 
      `logError("... mutually exclusive")` + exit 2、`fromIssue === undefined && !positional` → 
      usage error + exit 2。
- [ ] `--from-issue` 経路は `runArchiveFromIssue(fromIssue, { withMerge, mergeWaitMs, cwd, repoRoot, logLevel }, ctx)` に routing。
      slug 経路は現行 `runArchive` を維持する。`--merge-wait-ms` の lenient parse は両経路で共有する。
- [ ] `ARCHIVE_USAGE`（help detail）に `--from-issue <n>` と slug 排他を追記する。
- [ ] `src/cli/__tests__/` に CLI 配線テストを追加する（resume の command-registry テスト方式に倣う）:
      両指定 exit 2 / 両欠落 exit 2 / `--from-issue --with-merge` が `runArchiveFromIssue` に withMerge=true で届く。

**Acceptance Criteria**:
- slug + `--from-issue` 同時指定で exit 2、両欠落で exit 2。
- `--from-issue` 単独で `runArchiveFromIssue` に routing され、`--with-merge` が届く。
- slug 単独の既存経路（`runArchive`）が不変。
- `ARCHIVE_USAGE` に `--from-issue` が記載される。

## T-10: issue 起点 resume の不変を固定 (要件 4)

- [ ] `src/core/attach/__tests__/checkpoint-policy.test.ts`（T-01 と同ファイル可）に、
      `attachResumePolicy` が awaiting-archive checkpoint を `not-quiescent` で拒否することを固定するテストを追加する
      （resume rebind が awaiting-archive を受理しないことの証跡）。
- [ ] 既存 `src/cli/__tests__/resume-from-issue.test.ts` / `src/core/issue-target/__tests__/resume.test.ts` /
      archive 系テストを**無変更**で green に保つ（変更が必要になったら設計を疑う）。

**Acceptance Criteria**:
- `attachResumePolicy` が awaiting-archive を `not-quiescent` で拒否するテストが green。
- resume-from-issue / resume locator / attach / archive の既存テストが無変更で green。

## T-11: guide の取り込み経路追記 (要件・受け入れ基準)

- [ ] `src/core/command/guide.ts` の jobs topic（「4. 取り込み — archive --with-merge」節）に、
      remote 完走 job を issue から取り込む `specrunner job archive --from-issue <n> --with-merge` を追記する。
- [ ] merge topic に、issue 起点取り込み（completed marker → closing PR → rebind → archive）と、
      Development リンクが解決できない場合の `job attach --branch <branch>` 手動経路を追記する。

**Acceptance Criteria**:
- jobs topic 本文に `archive --from-issue` が含まれる。
- merge topic 本文に issue 起点取り込みと `job attach --branch` の手動経路が含まれる。

## T-12: 全体検証

- [ ] `bun run typecheck && bun run test` が green。

**Acceptance Criteria**:
- typecheck / test が全て green。
