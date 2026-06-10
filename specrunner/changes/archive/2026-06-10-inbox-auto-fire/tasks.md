# Tasks: inbox auto-fire

<!-- 実装順は概ね T-01 → T-08。T-01〜T-03 は基盤（config / port / marker）、T-04 が純粋 planner、
     T-05/T-06 が orchestrator と CLI、T-07 が docs、T-08 が横断テスト。 -->

## T-01: config に inbox セクションを追加する

- [x] `src/config/schema.ts` の `SpecRunnerConfig` に `inbox?: InboxConfig` を追加し、`InboxConfig { approveLabel?: string; maxStartsPerRun?: number }` を定義する
- [x] `RawConfig` に `inbox?: Partial<Record<string, unknown>>` を追加する
- [x] zod `configSchema` に `inbox` optional object を追加する: `approveLabel` は非空 string、`maxStartsPerRun` は 0 以上の整数
- [x] 既定値定数を定義する: `DEFAULT_INBOX_APPROVE_LABEL = "specrunner-approved"`、`DEFAULT_INBOX_MAX_STARTS_PER_RUN = 3`
- [x] 既定値を補って解決する純関数（例: `resolveInboxConfig(config)` → `{ approveLabel, maxStartsPerRun }`）を用意する。`maxStartsPerRun: 0` は新規起動なし（resume のみ）を意味する

**Acceptance Criteria**:
- `inbox.approveLabel` / `inbox.maxStartsPerRun` を含む config が検証を通り型付けされる
- 不正値（空文字 approveLabel、負数 / 非整数 maxStartsPerRun）が `CONFIG_INVALID` で弾かれる
- 未設定時に approveLabel が `specrunner-approved`、maxStartsPerRun が `3` に解決される
- 既存 config（inbox 未設定）が回帰なく読み込める

## T-02: GitHubClient port と adapter をラベル検索・コメント一覧で拡張する

- [x] `src/kernel/github-client.ts` の `GitHubClient` に 2 メソッドを追加する（forge 中立な doc コメント付き）:
  - `searchOpenIssuesByLabel(owner, repo, label): Promise<Array<{ number: number; title: string; body: string }>>` — 指定ラベル付きの open issue を返す。pull request は除外する。全ページ走査
  - `listIssueComments(owner, repo, issueNumber): Promise<Array<{ id: number; body: string; authorAssociation: string; createdAt: string }>>` — issue の全コメントを作成時刻昇順で返す。全ページ走査
- [x] `src/adapter/github/github-client.ts` に両メソッドを実装する。既存 `request()` の retry / rate-limit / 401 層と `parseNextLink` の Link ページネーションを再利用する
  - ラベル検索: `GET /repos/{owner}/{repo}/issues?labels=<label>&state=open&per_page=100`。レスポンス各要素のうち `pull_request` フィールドを持つものを除外し、`number` / `title` / `body`（null は空文字に正規化）へマップ
  - コメント一覧: `GET /repos/{owner}/{repo}/issues/{n}/comments?per_page=100`。`id` / `body` / `author_association`（→ `authorAssociation`）/ `created_at`（→ `createdAt`）へマップ
- [x] テスト等に存在する `GitHubClient` の mock 実装すべてに新メソッドを追加する（型の網羅性を満たす）

**Acceptance Criteria**:
- ラベル検索が PR を除外し issue のみを返す（adapter テスト、mock fetch）
- ラベル検索・コメント一覧が Link ヘッダのページネーションを最後まで辿る
- コメント一覧が author_association と createdAt を含めて返す
- 401 で `GITHUB_TOKEN_EXPIRED`、非 2xx で `GITHUB_API_ERROR` を投げる（既存メソッドと一貫）
- `typecheck` が green（全 mock が新メソッドを実装済み）

## T-03: 通知マーカーの共有述語と inbox 差し戻しコメント生成を追加する

- [x] `src/core/notify/issue-notifier.ts`（または同一 notify モジュール）に純関数を追加する:
  - `isNotificationComment(body: string): boolean` — 本文が通知マーカー接頭辞 `<!-- specrunner:notification` を含むか
  - `matchesEscalationMarker(body: string, jobId: string): boolean` — 本文が `buildMarker("escalation", jobId)` を含むか
- [x] inbox 差し戻しコメントの本文を生成する純関数を追加する（issue 番号と validate エラー文を受け取り、通知マーカー接頭辞を含む body を返す）。マーカーを含めることで将来の走査で bot コメントとして除外される
- [x] 既存 `buildMarker` / `notifyJobTerminal` の挙動は変更しない（追加のみ）

**Acceptance Criteria**:
- `isNotificationComment` が bot 通知コメントを true、一般コメントを false に判定する
- `matchesEscalationMarker` が対象 jobId の escalation マーカーのみ true にする（別 jobId のマーカーは false）
- 差し戻しコメント本文が通知マーカー接頭辞と validate エラー文を含む
- 既存 issue-notifier テストが回帰なく green

## T-04: inbox の純粋 planner を実装する

- [x] `src/core/inbox/` を新設し、plan の型を定義する（design D1 の contract: `IssueRef` / `IssueComment` / `StartAction` / `RejectAction` / `ResumeAction` / `InboxPlan`）
- [x] `planStarts(approvedIssues, jobStates, maxStarts, validate): { starts: StartAction[]; rejects: RejectAction[] }` を純関数で実装する:
  - `linkedIssueNumbers` を全 status 横断で `jobStates` から構築し、紐付け済み issue を除外する
  - 残った issue を順に validate（`parseRequestMdContent` を注入 or 直接呼ぶ）。合格は `StartAction`（slug は解析結果の slug）、不合格は `RejectAction`（reason は validate エラーメッセージ）
  - `StartAction` は `maxStarts` 件で打ち切る（reject は上限の対象外）
- [x] `planResumes(awaitingJobs, commentsByIssue): ResumeAction[]` を純関数で実装する。各 awaiting-resume + issue 紐付け job について:
  - cutoff = `matchesEscalationMarker(c.body, job.jobId)` を満たすコメントの最大 createdAt。該当なしなら resume しない（safe）
  - 候補 = createdAt > cutoff かつ `!isNotificationComment(c.body)` かつ author_association ∈ {OWNER, MEMBER, COLLABORATOR} かつ 本文先頭が `/resume`（後続は空白か行末）
  - 候補があれば最新 createdAt のものを採用し、`resumePrompt` を抽出して `ResumeAction` を生成
- [x] `parseResumePrompt(body): string | null` を実装する: 先頭 `/resume` トークンを除いた残り全体（改行含む）を trim。空なら null
- [x] `planInbox(input): InboxPlan` を `planStarts` + `planResumes` の合成として実装する

**Acceptance Criteria**:
- 紐付け済み issue が starts から除外される
- 妥当な issue が start、不正な issue が reject に振り分けられる
- starts が maxStarts で打ち切られる（rejects は打ち切られない）
- cutoff より古い / 権限なし / bot マーカー入り / `/resume` 非該当 のコメントでは resume が生成されない
- 複数の qualifying `/resume` がある場合に最新が採用される
- `parseResumePrompt` が `/resume`・`/resume <text>`・`/resume\n<multiline>` を正しく扱う
- すべて副作用なし（I/O / GitHub 呼び出しを行わない）

## T-05: inbox orchestrator を実装する

- [x] `src/core/inbox/` に orchestrator（例: `run-inbox.ts`）を実装する。依存（GitHubClient、owner/repo、repoRoot、解決済み inbox config、effect 群）を注入で受ける
- [x] 入力収集: `searchOpenIssuesByLabel` で承認ラベル付き open issue、`JobStateStore.list(repoRoot)` で全 job state を取得。awaiting-resume + issue 紐付け job についてのみ `listIssueComments` を呼び `commentsByIssue` を構築する
- [x] `planInbox` を呼び、`InboxPlan` を得る
- [x] effect 実行（注入された関数経由、デフォルト実装は既存経路）:
  - start: issue 本文を `specrunner/drafts/<slug>/request.md` へ書き出し（request store の write を再利用）、`runRunCore(draftPath, { issue: issueNumber })` を await する
  - resume: `runResumeCore(slug, { prompt: resumePrompt ?? undefined })` を await する
  - reject: T-03 の差し戻し本文で `githubClient.createIssueComment` を呼ぶ
- [x] `--dry-run` 時は plan を表示し effect を実行しない
- [x] 実行結果（起動 / 再開 / 差し戻し / スキップ）を human-readable に出力し、`--json` 時は機械可読に出力する
- [x] start / resume / reject の各 effect は独立に try/catch し、1 件の失敗が他の発火を止めないようにする（best-effort、失敗は警告ログ）

**Acceptance Criteria**:
- GitHubClient mock + 注入した job state + 注入した effect で、start / resume / reject が plan どおり呼ばれる
- 2 回目の inbox run（1 回目で起動した job が job state に紐付いている状態）で start effect が呼ばれない
- dry-run で effect が一切呼ばれない
- awaiting-resume 以外 / issue 紐付けなしの job についてコメント取得・resume を行わない

## T-06: CLI に inbox コマンドを配線する

- [x] `src/cli/` に inbox run のエントリ（例: `inbox.ts` の `runInbox`）を追加し、config / token / origin / GitHubClient / repoRoot を解決して orchestrator を呼ぶ。`loadConfigWithOverlay` / `resolveGitHubToken` / `getOriginInfo` / `createGitHubClient` / `resolveRepoRoot` を再利用する
- [x] `src/cli/command-registry.ts` の `COMMANDS` に `inbox` 親コマンドを追加する。`subcommands: { run: {...} }`、`guardedSubcommands: new Set(["run"])`
  - `run` の flags: `dry-run`（boolean）、`limit`（string→正整数 / 0 を検証）、`json`（boolean）、`verbose` / `quiet`（boolean）
  - `--limit` 指定時は `maxStartsPerRun` を上書きする
- [x] `USAGE` の Job/Aliases 付近に `inbox run` の説明行を追加し、サブコマンド usage を用意する
- [x] `bin/specrunner.ts` の親コマンド dispatch で `inbox run` が worktree guard を経由することを確認する（既存 `guardedSubcommands` 機構に乗る）

**Acceptance Criteria**:
- `specrunner inbox run` がコマンドとして解決される（registry テスト）
- worktree 内から実行すると `WORKTREE_GUARD` で拒否される
- `--limit` が不正値のとき引数エラー（exit 2）になる
- `--help` がサブコマンド usage を表示する

## T-07: 起動装置と運用のドキュメントを追加する

- [x] README に inbox の節を追加する: `inbox run` の概要、承認ラベル運用、`/resume` コメント運用、冪等性（紐付け / status / escalation マーカー時刻）の説明
- [x] config ドキュメントに `inbox.approveLabel` / `inbox.maxStartsPerRun`（既定値含む）を追記する
- [x] 起動装置の設定例を追加する:
  - ローカル: cron と launchd で `specrunner inbox run` を定期実行する例
  - GitHub Actions: `schedule`（定期）、`issues.labeled`（承認ラベル付与で起動）、`issue_comment`（`/resume` で再開）トリガーの例。`concurrency` group で多重実行を抑止する旨を明記する
- [x] 外部入力（issue 本文 / `/resume` 本文）が agent に渡る trust boundary（承認ラベル付与権限・collaborator 以上ゲート）の注意を明記する
- [ ] （任意・スコープ内）issue 本文を request.md 形式で書くための GitHub issue form テンプレート例を追加する

**Acceptance Criteria**:
- README から `inbox run` の使い方・冪等性・起動装置（cron / launchd / GitHub Actions 3 トリガー）の設定が読み取れる
- config 表に inbox の 2 キーと既定値が載っている
- trust boundary の注意書きがある

## T-08: 横断テストで受け入れ基準を満たす

- [x] planner ユニットテスト（T-04 の純関数）: start 冪等性 / validate 差し戻し / resume の cutoff・権限・bot 除外 / 起動上限 / resumePrompt パース
- [x] orchestrator テスト（GitHubClient mock + 注入 job state + 注入 effect）:
  - 承認ラベル付き・未紐付け issue から start effect が呼ばれ、2 回目（紐付け済み）で呼ばれないこと
  - 不正 issue 本文で reject コメントが投稿され start が呼ばれないこと
  - awaiting-resume + `/resume` で resume effect が resumePrompt 付きで呼ばれること
  - escalation マーカーより古い / 権限なし / bot コメントで resume が呼ばれないこと
  - 起動上限の上書き（`--limit` 相当）が効くこと
  - issue 紐付けなしの既存 job に触れないこと
- [x] adapter テスト（T-02）: ラベル検索の PR 除外・ページネーション、コメント一覧の author_association / createdAt・ページネーション
- [x] config テスト（T-01）: inbox 既定値解決と不正値拒否

**Acceptance Criteria**:
- 受け入れ基準の各項目に対応するテストが存在し green
- `typecheck && test` が green
