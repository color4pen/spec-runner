# Tasks: job start --from-issue

## T-01: 単一 core 関数へ「issue body → draft → start」を抽出し inbox を委譲化

- [x] `materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber }): Promise<number>` を新設する
      （配置は `src/core/job/start-from-issue.ts` 目安。挙動非依存）。
- [x] 中身は現状 inbox startJob 後半と byte 等価: `writeDraft(repoRoot, slug, issueBody)` →
      `const { runRunCore } = await import("../../cli/run.js")` → `return runRunCore(\`specrunner/drafts/${slug}/request.md\`, { cwd: repoRoot, issue: issueNumber, inboxOrigin: true })`。
- [x] `src/core/inbox/run-inbox.ts` の default `startJob` effect（378-401）を、occupancy pre-check を残したまま
      後半 2 行（writeDraft + runRunCore）だけ `materializeDraftAndStart` 呼び出しへ置換する。draft path 文字列・
      渡す options（cwd/issue/inboxOrigin）は現状と同一に保つ。
- [x] inbox の occupancy pre-check（SlugOccupiedError throw）は core 関数へ移さず inbox に残す。

**Acceptance Criteria**:
- `materializeDraftAndStart` が存在し、inbox default startJob がそれを経由する。
- inbox の既存テスト（`src/core/inbox/__tests__/run-inbox.test.ts`）が**無改変で** green。
- `writeDraft` に渡す slug / 本文、`runRunCore` に渡す `{ cwd, issue, inboxOrigin:true }` と draft path が統合前と同一。

## T-02: `--from-issue` flag 追加・positional optional 化・排他検査

- [x] `RUN_JOB_FLAGS`（`src/cli/command-registry.ts:540`）に `"from-issue": { type: "integer", min: 1 }` を追加する。
- [x] `job start` の `args` を `[{ name: "slug|file", required: false }]` に変更する（`run` alias にも波及、意図通り）。
- [x] `runJobHandler` 冒頭に exclusivity / presence 検査を追加する:
  - `--from-issue` あり + positional あり → usage エラー + `process.exit(EXIT_CODE.ARG_ERROR)`。
  - `--from-issue` あり + `--issue` あり → usage エラー + `EXIT_CODE.ARG_ERROR`。
  - `--from-issue` なし + positional なし → 「slug|file か --from-issue が必要」の usage エラー + `EXIT_CODE.ARG_ERROR`。
- [x] `--from-issue` があるときは generic detach 分岐（561-575）より前に `runFromIssue`（T-03）へ委譲し return する。
- [x] `parsed.positional` の参照（`requestMdPath` 代入）は from-issue 委譲 return の後、positional が確実に存在する経路でのみ行う
      （現在 `runJobHandler` 冒頭にある `const requestMdPath = parsed.positional!` の非 null 断言を from-issue ルーティングの後に移動する）。
- [x] 既存 positional 経路（detach 含む）と inbox 経路の挙動は変えない。

**Acceptance Criteria**:
- `job start some-slug --from-issue 5` が非ゼロ exit（ARG_ERROR）の usage エラーで、job state を作らない。
- `job start --from-issue 5 --issue 6` が非ゼロ exit（ARG_ERROR）の usage エラーで、job state を作らない。
- positional のみ / inbox の起動挙動が回帰しない（既存 CLI テスト green）。

## T-03: from-issue オーケストレーション（fetch → parse → guard → detach/run）

- [x] `src/cli/from-issue.ts` に `runFromIssue(issueNumber, opts, ctx)` を新設する（`runInboxRun` と同型のエントリ）。
- [x] GitHub client 組み立ては `src/cli/inbox.ts:36-69` と同じ関数列（config → `resolveGitHubToken` → `getOriginInfo` →
      `createGitHubClient`）を用いる。inbox.ts 側は触らない。
- [x] `githubClient.getIssue(owner, repo, issueNumber)` で本文を取得する。
- [x] `parseRequestMdContent(body, "issue#<n>")` で `slug` / `baseBranch` を得る。parse throw はそのまま
      非ゼロ exit（`writeDraft` より前 → 副作用ゼロ）。
- [x] base-branch guard を parse の後・writeDraft の前に実施する（T-04 の helper / error を使用）。
- [x] `opts.detach` かつ detached-child でない場合は `detachSelf({ args: process.argv.slice(2), repoRoot, slug, env })` を呼び、
      その exit code で `process.exit`（親は fetch/parse/guard 済みで slug を確定してから detach する）。
- [x] それ以外は `materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber })` の exit code で `process.exit`。
- [x] repoRoot は `ctx?.repoRoot ?? process.cwd()`。logLevel / noWorktree / json は既存 handler と同じ解決を渡す。

**Acceptance Criteria**:
- 正常系: base-branch 一致・有効 issue で、draft が実体化し job が起動、state に `issueNumber` と `inboxOrigin=true` が立つ。
- parse 失敗時: 非ゼロ exit、draft も job state も生成されない（テストで pin）。
- slug 占有時: `runRunCore` 内の既存 `assertNoDuplicateLiveJob`（SlugOccupiedError）経路で拒否される。
- `--from-issue <n> --detach` が通常の detach 契約（親は登録完了まで待って return）で成立する。

## T-04: base-branch guard の git helper と専用エラー

- [x] `src/git/` に `getCurrentBranch(cwd): Promise<string | null>` を追加する
      （`gitExec(defaultSpawnFn, cwd, ["symbolic-ref", "--short", "-q", "HEAD"])`。detached / 非 git / エラーは `null`）。
- [x] `src/errors.ts` に error code `BASE_BRANCH_MISMATCH`（`EXIT_CODE.ARG_ERROR` へ mapping）と
      factory `baseBranchMismatchError(current: string | null, baseBranch: string)` を追加する。
- [x] 文言は両値を含む（例: `current branch "develop" does not match request base-branch "main"`。
      `current === null` の場合は detached HEAD を明示する文言）。
- [x] `runFromIssue` で `current = await getCurrentBranch(repoRoot)` を取り、`current !== baseBranch`（null 含む）なら
      `baseBranchMismatchError` を throw（job state 作成前・writeDraft 前）。

**Acceptance Criteria**:
- 現在 branch が base-branch と不一致: job state 未作成・draft 未残留・非ゼロ exit・両値を含む文言（テストで pin）。
- detached HEAD が不一致として扱われ、同様に停止する（テストで pin）。
- guard は `--from-issue` 起動時のみ発火し、positional / inbox 経路には影響しない。

## T-05: help / guide の追随

- [x] `job start` の help summary（`src/cli/command-registry.ts:835` 付近）に `--from-issue <n>` 行を追加し、
      fidelity skip・base-branch guard・positional/`--issue` 排他を一言で示す。
- [x] guide の `jobs` topic（`src/core/command/guide.ts` の `GUIDE_TOPICS` 内 `name: "jobs"` の body）起動節に
      `--from-issue` の契約（issue 番号のみで起動・fidelity skip・base-branch guard・排他）を反映する。

**Acceptance Criteria**:
- `job start -h` / usage 出力に `--from-issue` が現れる。
- `specrunner guide jobs` の出力に `--from-issue` の契約が反映される。
- 既存 guide / help のスナップショット系テストがあれば整合更新される。

## T-06: テストによる受け入れ基準の pin

- [x] fidelity skip: `--from-issue` 由来（`inboxOrigin=true`）の job に対し entrance fidelity gate が comparator を
      呼ばず skip することを pin する（`issue-fidelity-gate` の skip 経路 / `inboxOrigin` 伝播を検証）。
- [x] base-branch 不一致: job state 未作成・draft 未残留・非ゼロ exit・両値を含む文言を pin する。
- [x] detached HEAD 不一致を pin する。
- [x] 排他 2 系（positional 併用 / `--issue` 併用）が usage エラー（ARG_ERROR）で job state を作らないことを pin する。
- [x] parse 失敗で draft・job state とも副作用ゼロでエラー終了することを pin する。
- [x] slug 占有時に既存 SlugOccupiedError 経路へ乗ることを pin する。
- [x] inbox の既存テストが無改変で green であることを確認する（統合の挙動保存の証拠）。

**Acceptance Criteria**:
- 上記 pin が新規/既存テストで表現され、`bun run typecheck` と `bun run test` が green。
- inbox テストは差分なしで green。
