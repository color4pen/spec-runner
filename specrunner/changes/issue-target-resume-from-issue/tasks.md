# Tasks: job resume --from-issue

<!-- Implementer executes these. design.md D-refs are the rationale; do not restate. -->

## T-01: Development リンク列挙を GraphQL adapter に追加する

- [ ] `src/adapter/github/github-client.ts` の `GitHubApiClient` に public メソッド
      `listIssueLinkedBranches(owner: string, repo: string, issueNumber: number): Promise<string[]>`
      を追加する（`GitHubClient` port の shape は変更しない — D2）。
- [ ] 既存の `graphqlEndpoint()` と `request()` を再利用し、issue **番号**で 1 クエリ発行:
      `repository(owner,name){ issue(number){ linkedBranches(first:50){ nodes{ ref{ name } } }
      closedByPullRequestsReferences(first:50){ nodes{ headRefName } } } }`
      （node ID を得るための `getIssue` は呼ばない — D5）。
- [ ] `linkedBranches` の ref 名と `closedByPullRequestsReferences` の head 名を union し、
      重複を除いた `string[]` を返す。リンク不在は `[]`。
- [ ] fail-closed: 非 2xx / GraphQL `errors` 非空は `githubApiError(...)` を throw
      （`createLinkedBranch` と同一方針。黙って `[]` に落とさない）。
- [ ] `issue` が null（存在しない）の場合の扱いを決めて実装する（`githubApiError` を提案）。

**Acceptance Criteria**:
- linked branch 形（`linkedBranches` に ref）と linked PR head 形
  （`closedByPullRequestsReferences` に headRefName）の双方が候補として返ることが
  テストで pin される（両形が union・重複除去される）。
- 非 2xx / GraphQL errors 非空で `GITHUB_API_ERROR` が throw されることがテストで pin される。
- GraphQL endpoint が github.com / GHES で正しく導出される（既存 `graphqlEndpoint` を使用）。
- `GitHubClient` port（`src/kernel/github-client.ts`）の interface は無変更で、既存の
  `: GitHubClient` typed mock が typecheck を通り続ける。

## T-02: escalation marker から jobId を抽出する純関数を追加する

- [ ] `src/core/notify/issue-notifier.ts` に純関数
      `parseEscalationJobId(body: string): string | null` を追加する。
- [ ] `buildMarker("escalation", jobId)` が生成する marker format
      `<!-- specrunner:notification kind="escalation" jobId="<jobId>" version="1" -->`
      の逆で jobId を抽出する（format は変更しない — スコープ外）。marker 不在は `null`。
- [ ] 抽出は `buildMarker` と同一の format 定義に結び付け、format 変更時に両者が乖離しない
      ようにする（正規表現は marker の literal 構造に対応させる）。

**Acceptance Criteria**:
- `parseEscalationJobId(buildMarker("escalation", id))` が `id` を返す round-trip がテストで
  pin される（full jobId、`-->` を含まない前提）。
- marker を含まない body / `kind="completed"` のみの body で `null` を返すことが pin される。

## T-03: 3 種の fail-closed typed error を追加する

- [ ] `src/errors.ts` の `ERROR_CODES` に追加: `RESUME_FROM_ISSUE_NO_MARKER` /
      `RESUME_FROM_ISSUE_NO_LINK` / `RESUME_FROM_ISSUE_UNCONFIRMED`（D8）。
- [ ] factory を追加:
      - `resumeFromIssueNoMarkerError(issueNumber)`: 「issue #n に再開可能な escalation が無い」。
      - `resumeFromIssueNoLinkError(issueNumber)`: Development リンク 0 件。hint で
        `specrunner job attach --branch <branch>` → `job resume` の手動経路を案内する（D6）。
      - `resumeFromIssueUnconfirmedError(detail)`: 何が照合に失敗したか（jobId / issueNumber /
        branch の不一致、複数一致、候補 branch 名）を message に含める。
- [ ] exit code を `EXIT_CODE_MAP` に登録する（Open Question: `ARG_ERROR`(2) を提案）。

**Acceptance Criteria**:
- 3 コードが `ERROR_CODES` に存在し、各 factory が対応する `code` を持つ error を返す。
- `error-codes.test.ts`（特定コードの有無のみ検査）が無改変で green。

## T-04: issue-target resume face（core resolver）を実装する

- [ ] 新 `src/core/issue-target/resume.ts` を追加する。`cli/`・`adapter/` を import しない
      （module-boundary TC-001 / B-1）。import 可能: `kernel`/`core/port`（port 型）、
      `git/checkpoint-ref`、`state`、`errors`、`logger`、`core/notify/issue-notifier`（T-02）。
- [ ] 狭い locator port を定義する（D2）:
      `Pick<GitHubClient, "listIssueComments"> & { listIssueLinkedBranches(owner,repo,issueNumber): Promise<string[]> }`。
- [ ] `resolveEscalationJobId({ client, owner, repo, issueNumber }): Promise<string>`:
      `listIssueComments` を走査 → 各 comment body に `parseEscalationJobId` → 一致した中で
      `createdAt` 最新の jobId を返す。0 件 → `resumeFromIssueNoMarkerError`。
- [ ] `resolveResumeBranchFromIssue({ client, owner, repo, issueNumber, jobId, spawnFn, cwd }):
      Promise<{ branch: string; slug: string; checkpointOid: string }>`:
      - `listIssueLinkedBranches` で候補 branch を列挙。0 件 → `resumeFromIssueNoLinkError`。
      - 各候補: `git fetch origin <branch>` → `readCheckpointFromRef(spawnFn, cwd, "origin/<branch>")`
        → state.json を軽量 parse（jobId / issueNumber / branch）。read 不能な候補は「非一致」
        として記録しスキップ（job branch でないリンクを握り潰さない）。
      - identity 3 照合（D3）: `state.jobId===jobId && state.issueNumber===issueNumber
        && state.branch===候補 branch 名`。全一致のみ「確定」。
      - 確定が 1 本 → その branch / slug / checkpointOid を返す。0 本 or 複数 →
        `resumeFromIssueUnconfirmedError`（不一致理由・候補名を明示）。
- [ ] checkpointOid は `git rev-parse origin/<branch>^{commit}` 由来を返す（後段 rebind と
      整合する OID。実体化の一次情報は rebind 側 `runAttachVerification` が再解決する）。
- [ ] resolve 経路で `getIssue`（body を返す）を呼ばない（D5）。

**Acceptance Criteria**:
- marker 複数時に `createdAt` 最新の jobId が選ばれることが単体テストで pin される。
- marker 不在で `RESUME_FROM_ISSUE_NO_MARKER` が throw されることが pin される。
- linked branch 形・linked PR head 形の双方の候補から identity 3 照合で 1 本に確定できることが
  pin される。
- `state.issueNumber` 不一致 / `state.jobId` 不一致の checkpoint が確定されず
  `RESUME_FROM_ISSUE_UNCONFIRMED` で拒否されることがそれぞれ pin される。
- Development リンク 0 件で `RESUME_FROM_ISSUE_NO_LINK`、複数 full 一致で
  `RESUME_FROM_ISSUE_UNCONFIRMED` が throw されることが pin される。
- resolver 経路で `getIssue` が呼ばれないことが（spy で）pin される。
- `grep -rn "cli/" src/core/issue-target` が 0 件（module-boundary TC-001 が green）。

## T-05: CLI orchestrator（resume-from-issue）を実装する

- [ ] 新 `src/cli/resume-from-issue.ts` に
      `runResumeFromIssue(issueNumber, opts, ctx?): Promise<number>` を追加する。
      cwd / repoRoot は引数で受け、ファイル内で `process.cwd()` を直読みしない（D7）。
- [ ] setup: config / token / origin / `createGitHubClient` を from-issue.ts と同一パターンで
      解決する。runtime が local でなければ `attachRuntimeUnsupportedError`（rebind は local 専用）。
- [ ] transport-auth: `createTransportAuth({ token, cwd: repoRoot })` + `wrapSpawn(spawnCommand)`
      で spawnFn を作り、resolver（identity read）と rebind（`runAttachVerification`）に渡す。
- [ ] 連鎖:
      1. `jobId = resolveEscalationJobId(...)`。
      2. local short-circuit（D4）: `loadStateByJobId(repoRoot, jobId)` を try。存在すれば
         `slug = getJobSlug(state)`、rebind 不要フラグ、以降 5 へ。
      3. `{ branch, slug, checkpointOid } = resolveResumeBranchFromIssue(...)`、rebind 必要。
      4. detach（D7）: `opts.detach && !isDetachedChild(env)` なら `detachSelf({ args, repoRoot,
         slug, env })` して return（子は再入して 1〜3 を再実行 → 5〜6 を本実行）。
      5. rebind（rebind 必要時のみ）: `runAttachVerification({ cwd: repoRoot, branch, spawnFn,
         expectedRepo:{owner,name} })` → `LocalRuntime.setupWorkspace(slug, jobId,
         { attachCheckpoint:{ branch: verified.branch, checkpointRef: verified.checkpointOid },
         baseBranch })`（attach.ts と同一）。検証失敗は既存エラーをそのまま伝播。
      6. resume 合流: `runResumeCore(slug, { ...resumeOpts, cwd: repoRoot, repoRoot })` を return。
- [ ] `opts` は resume 契約を透過させる: `prompt` / `detach` / `from` / `force` / `applyCanon`
      / `adoptCommits` / `noWorktree` / `json` / `logLevel`（`--from` などその他 resume flag の
      挙動は変更しない）。
- [ ] 各 SpecRunnerError は logError + hint + exitCode で終了（副作用ゼロ停止を保つ）。

**Acceptance Criteria**:
- ローカル state 無し相当（`loadStateByJobId` が JOB_NOT_FOUND）で、marker → jobId → 候補列挙
  → 3 照合 → `runAttachVerification` → `setupWorkspace` → `runResumeCore` 到達の連鎖が、
  linked branch 形・linked PR head 形の双方でテストで pin される。
- ローカルに同 jobId の state がある場合、`resolveResumeBranchFromIssue` と
  `runAttachVerification` が呼ばれず（rebind skip）`runResumeCore` に合流することが pin される。
- `--detach` 併用時、親が slug を確定してから `detachSelf` を呼び、rebind/resume を本実行しない
  ことが pin される（`--prompt` 併用も既存 resume 契約どおり透過）。
- 経路で `getIssue` が呼ばれないことが pin される（D5）。
- `grep -rn "process.cwd(" src/cli/resume-from-issue.ts` が 0 件（新 CWD allowlist エントリ不要）。

## T-06: command-registry に --from-issue を配線する

- [ ] `job resume` spec の flags に `"from-issue": { type: "integer", min: 1 }` を追加する。
- [ ] resume handler で `--from-issue` を検出:
      - positional `<slug>` と `--from-issue` 同時指定は usage エラー（`logError` + `ARG_ERROR`）。
      - `--from-issue` 指定時は `runResumeFromIssue(issueNumber, { ...resumeOpts, cwd: process.cwd(),
        repoRoot: ctx?.repoRoot }, ctx)` へ route し `process.exit(code)`。`process.cwd()` は
        既存 CWD allowlist と同一 literal `cwd: process.cwd(),` として書く（D7 / 新エントリ不要）。
      - `--detach` / `--prompt` / `--prompt-file` などの既存前処理（相互排他・警告）は
        `--from-issue` 経路でも成立させる（`--prompt-file` 読込などは既存分岐を流用）。
- [ ] `JOB_RESUME_USAGE` に `--from-issue <n>` の契約を追記する: locator 解決規則（marker →
      Development リンク → checkpoint identity）・rebind 内包・positional 排他・リンク不在時の
      `job attach --branch` 誘導。
- [ ] `job resume` の help `summary` に `--from-issue` の 1 行を追加する。

**Acceptance Criteria**:
- positional slug と `--from-issue` 同時指定で `ARG_ERROR`(2) + "mutually exclusive" 系メッセージ
  になることがテストで pin される。
- `--from-issue <n>` 単独指定で `runResumeFromIssue` に route されることが pin される。
- `JOB_RESUME_USAGE` に `--from-issue` と `job attach --branch` 誘導が含まれる
  （resume-help / help-output 系テストが green）。
- `command-registry.ts` の新 `process.cwd()` 出現が既存 CWD allowlist エントリで被覆される。

## T-07: CLI 組み込み guide に契約を反映する

- [ ] `src/core/command/guide.ts` の `escalation` topic に `--from-issue` の復帰経路を追記する:
      issue 番号だけで再開する契約（locator 解決規則・rebind 内包・positional 排他・リンク不在時の
      `job attach --branch` 誘導）。
- [ ] 表として既存の復帰 flag 分岐と並べ、`--from-issue` を「issue 起点の再開」行として加える。

**Acceptance Criteria**:
- `specrunner guide escalation` の本文に `resume --from-issue` と `job attach --branch` 誘導が
  含まれる。
- guide 関連の既存テスト（topic 一覧・render）が green。

## T-08: 統合テストと回帰確認

- [ ] T-01〜T-06 の Acceptance Criteria を満たすテストを、既存の colocated 様式で配置する
      （resolver: `src/core/issue-target/__tests__/resume.test.ts`、CLI: `src/cli/__tests__/
      resume-from-issue.test.ts`、adapter: 新 `tests/unit/adapter/github/*dev-links*.test.ts`）。
      既存 `from-issue.test.ts` の mock 様式（port / detach / runRunCore の vi.mock）を流用する。
- [ ] 主連鎖テストは linked branch 形と linked PR head 形の両方を張る。
- [ ] 既存 attach / resume / inbox のテストを無改変で green に保つ（新規メソッドは port shape を
      変えないため既存 `: GitHubClient` mock は無改変）。

**Acceptance Criteria**:
- `bun run typecheck` green。
- `bun run test` green（新規テスト含む）。
- `tests/unit/architecture/` green（新 allowlist エントリ無し: CWD ratchet・module-boundary
  TC-001・B-1 のいずれも新違反なし）。
- 既存 attach / resume / inbox のテストが無改変で green。
