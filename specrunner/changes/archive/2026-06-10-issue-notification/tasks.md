# Tasks: job を GitHub issue に紐付け、escalation / 完走を issue コメントで通知する

## T-01: `JobState` に `issueNumber` フィールドを追加する

- [x] `src/state/schema.ts` の `JobState` interface に `issueNumber?: number | null` を追加する
  （backward compat のため optional。JSDoc で「`--issue` 起動時に設定、未設定 job は通知対象外」を明記）（D3）
- [x] `validateJobState` に present 時のみの軽量検証を加える: `issueNumber` が存在し number だが
  正の整数でない場合はエラーにする（欠落・undefined は許容＝backward compat）。pass-through を壊さない
- [x] `buildInitialJobState`（`src/store/job-state-store.ts`）は変更しない（issueNumber は post-bootstrap
  でセットするため初期値不要）

**Acceptance Criteria**:
- `issueNumber` を持つ `JobState` を persist → load して値が保持される
- `issueNumber` を持たない legacy state が `validateJobState` を通過する（regression なし）
- `bun run typecheck` が green

## T-02: `GitHubClient` port に `createIssueComment` を追加する

- [x] `src/kernel/github-client.ts` の `GitHubClient` interface に
  `createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<{ id: number; url: string }>`
  を追加する。JSDoc で forge 中立な意味論・201 期待・401 ハンドリングを記述する（D2）
- [x] `src/core/port/github-client.ts` の re-export は型に追従するため変更不要であることを確認する

**Acceptance Criteria**:
- `GitHubClient` interface に `createIssueComment` が宣言される
- `bun run typecheck` が green（adapter / 全テストダブル未実装の段階では落ちるため、本タスク単体では
  port 宣言のみを確認し、配線完了は T-03 / T-07 後に green）

## T-03: GitHub adapter に `createIssueComment` を実装する

- [x] `src/adapter/github/github-client.ts` の `GitHubApiClient` に `createIssueComment` を実装する。
  既存 `request()` 経由で `POST ${baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments` を
  `Content-Type: application/json` + `JSON.stringify({ body })` で呼ぶ（D2）
- [x] 201 のとき `{ id, url }` を返す（REST `id` と `html_url` をマップ）。201 以外は
  `githubApiError(status, ...)` を throw する（401 は `request()` が `githubTokenExpiredError` を throw）
- [x] 実装形は既存 `createPullRequest`（POST / 201 / JSON body）に倣う

**Acceptance Criteria**:
- `createIssueComment` が 201 レスポンスから id / url を返す
- 非 201 で `githubApiError` を throw する
- `bun run typecheck` が green

## T-04: `--issue` フラグを CLI に配線する

- [x] `src/cli/command-registry.ts` の `run`（alias）と `job` の `start` の `flags` に
  `issue: { type: "string" }` を追加する
- [x] 両 handler で issue を number へ parse + 検証する: `Number(value)` を取り、`Number.isInteger(n) && n > 0` を満たさなければ（trailing garbage 含む非整数・0・負数を含む）
  `logError` + `process.exit(EXIT_CODE.ARG_ERROR)`。検証後の number を `runRun` の options に渡す（D4）
- [x] `USAGE` の `job start` 行に `--issue <number>` の説明を追記する
- [x] `src/cli/run.ts` の `runRunCore` / `runRun` の options 型に `issue?: number` を追加し、
  `PipelineRunCommand` の構築まで透過させる
- [x] `src/core/command/pipeline-run.ts` の `PipelineRunOptions` に `issue?: number` を追加し、
  `prepare()` で `bootstrapJob` の後に
  `if (this.options.issue !== undefined) jobState.issueNumber = this.options.issue` をセットする
  （`noWorktree` のセットと同じ箇所・同じ形）

**Acceptance Criteria**:
- `job start <slug> --issue 42` / `run <slug> --issue 42` の双方で `jobState.issueNumber === 42` になる
- `--issue` 省略時は `jobState.issueNumber` が未設定のまま
- 不正値（非数値 / 0 以下）で exit code 2
- `bun run typecheck` が green

## T-05: 通知モジュール `issue-notifier` を実装する

- [x] `src/core/notify/issue-notifier.ts` を新規作成する。import は `core/port`（`GitHubClient`）/
  `state/schema`（`JobState`）/ `logger/stdout`（`logWarn`）のみ（DSM 適合、adapter 非依存、runtime 分岐なし）（D5）
- [x] `buildMarker(kind: "escalation" | "completed", jobId: string): string` を実装する。形式は
  `<!-- specrunner:notification kind="<kind>" jobId="<jobId>" version="1" -->`（D6）。
  JSDoc に「`jobId` に `-->` を含む文字列を渡してはならない」と明記し、
  `if (jobId.includes("-->")) throw new Error(...)` の安価な guard を先頭に置く
- [x] `buildEscalationComment(state: JobState): string`（純粋）: marker + 停止 step
  （`state.resumePoint?.step`）+ 理由（`state.resumePoint?.reason`）+ 再開手順
  （`specrunner job resume <slug>`、`slug` は `state.request.slug`、null 時は汎用文言にフォールバック）
- [x] `buildCompletionComment(state: JobState): string`（純粋）: marker + PR URL
  （`state.pullRequest?.url`、不在時は URL 行を省略 or 注記で graceful degrade）+ archive 手順
- [x] `notifyJobTerminal(state, ctx: { githubClient; owner; repo }): Promise<void>` を実装する:
  (1) `state.issueNumber` が未設定なら即 return（**issue API を呼ばない**）/ (2) `state.status` が
  `awaiting-resume`→escalation / `awaiting-archive`→completed / その他→return / (3) body 生成 /
  (4) `try { await ctx.githubClient.createIssueComment(ctx.owner, ctx.repo, state.issueNumber, body) }
  catch (err) { logWarn(...) }`（D5 / D7）
- [x] body 生成・コメント本文には絵文字を含めない（プレーンテキスト見出しを使う）

**Acceptance Criteria**:
- `notifyJobTerminal` が `issueNumber` 未設定で `createIssueComment` を一度も呼ばない
- `createIssueComment` が throw しても `notifyJobTerminal` は throw せず warn のみ
- `notifyJobTerminal` は `state.status` を変更しない
- `bun run typecheck` が green

## T-06: pipeline の terminal 収束点に通知フックを差し込む

- [x] `src/core/pipeline/pipeline.ts` の `runInternal` 末尾、`while` ループを抜けた直後・`return state`
  の手前に `await notifyJobTerminal(state, deps)` を 1 箇所だけ追加する（`deps` は `githubClient` /
  `owner` / `repo` を持ち `NotifyCtx` を構造的に満たす）（D1）
- [x] `notifyJobTerminal` を `../notify/issue-notifier.js` から import する（domain→domain、同層 import）
- [x] 通知呼び出しが状態遷移・永続化（`commitFinalState` 含む）の **後** に来ることを確認する
  （完走経路で `state.pullRequest` 確定済み）

**Acceptance Criteria**:
- 完走（`awaiting-archive`）・escalate-terminal（`awaiting-resume`）・loop 上限（`awaiting-resume`）の
  3 経路すべてが収束点を通り `notifyJobTerminal` に到達する
- `failed` / `running` 残存の終了では通知が no-op
- `bun run typecheck` が green

## T-07: 全 `GitHubClient` テストダブルに `createIssueComment` を追加する

- [x] `createIssueComment` 未実装で型エラーになる全テストファイルの `GitHubClient` full-literal を更新する。
  `grep -rln "listPullRequestFiles" tests/` で full-literal を構築するファイルを洗い出し（約 40 ファイル）、
  各々に `createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" })`
  を追加する（judge-verdict change の `verifyFindingRefs` 追加と同パターン）
- [x] `tests/unit/core/pr-create/runner.test.ts` の `makeMockGithubClient`、
  `tests/unit/core/pipeline/pipeline.transitions.test.ts` の `makeMinimalDeps().githubClient` を含む
- [x] `src/cli/doctor.ts` は `DoctorGitHubClient`（narrower interface）を使うため変更不要であることを確認する

**Acceptance Criteria**:
- `bun run typecheck` が green（全 full-literal が interface を満たす）
- 既存テストが regression なく pass する

## T-08: notifier のユニットテスト

- [x] `tests/unit/core/notify/issue-notifier.test.ts` を新規作成する
- [x] `buildMarker` / `buildEscalationComment` / `buildCompletionComment`（純粋）:
  - escalation body に marker（kind=escalation, jobId）・停止 step・resumePoint reason・
    `specrunner job resume <slug>` が含まれる
  - completion body に marker（kind=completed, jobId）・PR URL が含まれる
  - PR URL 不在の state で completion body が graceful degrade する
- [x] `notifyJobTerminal`（mock `GitHubClient` 注入）:
  - `issueNumber` 設定 + `awaiting-resume` → `createIssueComment` が正しい owner/repo/issueNumber/body で呼ばれる
  - `issueNumber` 設定 + `awaiting-archive` → `createIssueComment` が PR URL 入り body で呼ばれる
  - `issueNumber` 未設定 → `createIssueComment` が **呼ばれない**
  - `createIssueComment` が reject → `notifyJobTerminal` は throw せず、state.status 不変

**Acceptance Criteria**:
- 上記ケースが pass する
- マーカー含有・理由含有・PR URL 含有・未指定で no-call・失敗隔離が検証される
- `bun run test` で当該テストが pass

## T-09: adapter `createIssueComment` のユニットテスト

- [x] `tests/unit/adapter/github/github-client-issue-comment.test.ts` を新規作成する
  （`github-client-pr.test.ts` の stub fetch パターンに倣う）
- [x] 201 レスポンス（`{ id, html_url }`）→ `{ id, url }` を返す
- [x] 非 201（例: 404 issue 不在）→ `githubApiError` を throw する
- [x] POST 先 URL が `/repos/{owner}/{repo}/issues/{issueNumber}/comments` で body に `{ body }` が乗る

**Acceptance Criteria**:
- 201 / 非 201 の両ケースが pass する
- `bun run test` で当該テストが pass

## T-10: pipeline 通知配線の統合テスト

- [x] pipeline テスト（`tests/unit/core/pipeline/` 配下に追記 or 新規）で、`deps.githubClient` の
  `createIssueComment` を spy し以下を検証する:
  - `issueNumber` を持つ state で完走（`awaiting-archive`）→ `createIssueComment` が PR URL 入りで呼ばれる
  - `issueNumber` を持つ state で escalation（loop 上限 → `awaiting-resume`）→ `createIssueComment` が
    再開手順入りで呼ばれる
  - `issueNumber` を持たない state → `createIssueComment` が呼ばれない
  - `createIssueComment` が reject → 最終 `state.status` と pipeline の戻り値が不変（exit code に影響しない）

**Acceptance Criteria**:
- 上記 4 ケースが pass する
- 通知失敗が pipeline の最終状態を変えないことが検証される
- `bun run test` で当該テストが pass

## T-11: `--issue` CLI parse と state 永続化のテスト

- [x] flag parse テスト: `job start <slug> --issue 42` / `run <slug> --issue 42` で options に
  `issue: 42` が渡ること、不正値で exit code 2 になることを検証する
- [x] state 永続化テスト: `issueNumber` を持つ `JobState` を persist → load して値が保持されること、
  `issueNumber` 無しの legacy state が load できることを検証する（受け入れ基準「永続化・復元で保持」）

**Acceptance Criteria**:
- `--issue` の parse / 検証 / 伝播が検証される
- `issueNumber` の round-trip（persist→load）が検証される
- `bun run test` で当該テストが pass

## T-12: 最終検証

- [x] `bun run typecheck` が green
- [x] `bun run test` で全テストが pass（regression なし）
- [x] `grep -rn "createIssueComment\|notifyJobTerminal\|issueNumber" src/` で配線が正しいことを確認する
- [x] architecture invariant テスト（`tests/unit/architecture/core-invariants.test.ts`）が pass する
  （`src/core/notify/` が adapter を import せず、`logWarn` seam 経由で stderr を扱い、`config.runtime` を
  分岐しないこと＝B-1 / B-7 / B-8 / DSM 適合）

**Acceptance Criteria**:
- `typecheck && test` が green
- アーキテクチャ不変条件テストが pass する
- 受け入れ基準（spec.md の全 Requirement / Scenario）が満たされる
