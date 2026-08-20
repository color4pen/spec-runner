# Tasks: issue-target 層の新設 — start 面

<!-- 実装順の目安: T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-07。
     T-01/T-02 は下地（builder / port）。T-03 が層本体。T-04 が配線。T-05 が 3 経路 route。 -->

## T-01: branch 名 builder の単一定義化（D7）

- [ ] `src/config/type-config.ts` に `buildFeatureBranchName(type: string, slug: string, jobId: string): string` を追加する（`getBranchPrefix` の隣）。実装は `${getBranchPrefix(type)}${slug}-${jobId.slice(0, 8)}`。
- [ ] `src/core/command/pipeline-run.ts:174-175` のインライン構成を `buildFeatureBranchName(request.type, slug, jobState.jobId)` に置換する。
- [ ] `src/core/step/design.ts:151` の fallback branch 構成を `buildFeatureBranchName(deps.request.type, deps.slug, state.jobId)` に置換する（`state.branch` 優先の三項は維持）。
- [ ] `src/core/step/commit-orchestrator.ts:403-404` の `setsBranch` 経路の構成を `buildFeatureBranchName(deps.request.type, deps.slug, s.jobId)` に置換する。
- [ ] builder を **逆引き（branch 名 → job 発見）に使わない**ことを doc-comment に明記する。

**Acceptance Criteria**:
- `buildFeatureBranchName("bug-fix", "my-slug", "abcdef0123")` が `feat/my-slug-abcdef01`（bug-fix の prefix に依存）を返す最小 unit test が存在し green。
- 作る側 3 箇所（pipeline-run / design / commit-orchestrator）がすべて `buildFeatureBranchName` を参照し、インライン `${getBranchPrefix(...)}...slice(0, 8)` 構成が repo から消える（grep で 0 件）。
- 3 経路の branch 名が変更前と同一文字列であることが既存テストで green（挙動不変）。

## T-02: port 拡張と GraphQL adapter（D6）

- [ ] `src/kernel/github-client.ts` の `getIssue()` 返り値型に `nodeId: string` を追加する。doc-comment を更新。
- [ ] `src/kernel/github-client.ts` に `createLinkedBranch(issueId: string, name: string, oid: string): Promise<void>` を追加する。doc-comment に「新規 branch を issue の Development linked branch として作る（既存 branch の後付け不可）／非 2xx・GraphQL errors は throw（fail-closed）」を記す。
- [ ] `src/adapter/github/github-client.ts` の `getIssue()`（670-682）で REST `node_id` を `nodeId` にマッピングして返す。
- [ ] `src/adapter/github/github-client.ts` に GraphQL POST 用の内部 helper（REST `request()` と同じ auth/retry ミドルウェアを再利用）と GraphQL エンドポイント導出（REST base が `…/api/v3` で終われば `…/api/graphql`、それ以外は `+ "/graphql"`）を追加する。
- [ ] `createLinkedBranch` を GraphQL mutation `createLinkedBranch(input:{issueId,name,oid})` として実装する。GraphQL レスポンスの `errors` 非空・非 2xx は `githubApiError` で throw する。

**Acceptance Criteria**:
- adapter の `getIssue()` が REST `node_id` を `nodeId` として返すことを、fetch を mock した unit test で assert（`{ number, title, body, nodeId }`）。
- `createLinkedBranch(issueId, name, oid)` が GraphQL エンドポイントへ、`issueId` / `name` / `oid` を variables に含む mutation を POST することを、fetch を mock した unit test で assert（body に 3 値が渡ること）。
- GraphQL エンドポイント導出が `https://api.github.com` → `https://api.github.com/graphql`、`https://HOST/api/v3` → `https://HOST/api/graphql` になることが unit test で pin される。
- GraphQL `errors` 非空 / 非 2xx で `createLinkedBranch` が throw することが unit test で pin される。
- `bun run typecheck` green（`getIssue` の型拡張が既存 caller を壊さない）。

## T-03: `core/issue-target/` 層の新設と start 面の移設（D1・D2・D3・D5）

- [ ] `src/core/issue-target/` を新設する。`src/core/job/start-from-issue.ts` の `materializeDraftAndStart` と issue 本文 parse 利用箇所を移設する（`src/core/job/start-from-issue.ts` は削除するか re-export を残さない — 参照元は T-05 で更新）。
- [ ] `materializeDraftAndStart` を **注入された start primitive** で起動する形に変える（`await import("../../cli/run.js")` を持ち込まない）。signature 例: `materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber, githubClient, owner, repo, startPrimitive, startOptions })`。挙動契約: `writeDraft` を start より先に呼ぶ／start primitive を `{ inboxOrigin: true, issue: issueNumber, onFeatureBranchCreated }` を含む options で呼ぶ／primitive の例外（SlugOccupiedError 等）をそのまま伝播する。
- [ ] positional 経路用の issue-link start 関数（例: `startWithIssueLink({ repoRoot, requestMdPath, issueNumber, githubClient, owner, repo, startPrimitive, startOptions })`）を追加する。start primitive を `{ issue: issueNumber, onFeatureBranchCreated }`（**inboxOrigin は付けない**）で呼ぶ。
- [ ] 両関数が共有する **best-effort リンク callback builder**（例: `buildLinkedBranchRegistrar({ githubClient, owner, repo, issueNumber }) => (baseOid, branchName) => Promise<void>`）を追加する。callback 内で `getIssue` により `nodeId` を取得 → `createLinkedBranch(nodeId, branchName, baseOid)` を呼ぶ。**失敗は捕捉し logger seam（`stderrWrite`）で警告して握りつぶす**（throw しない）。
- [ ] issue-target 層は `cli/` を静的にも動的にも import しない（`stderrWrite` は `logger/`、client は `port/`、parse は `parser/`、draft は `inbox/draft-writer` — すべて core→core/kernel）。

**Acceptance Criteria**:
- `materializeDraftAndStart` の relocated 版が、注入した mock start primitive を `{ inboxOrigin: true, issue: <n> }` を含む options で呼び、`writeDraft` を start より先に呼び、primitive の SlugOccupiedError を伝播することを unit test で pin（assert 内容は先行 request のものを保存、mock 対象は注入 primitive に更新）。
- リンク callback が worktree 成功時に `getIssue`→`createLinkedBranch(nodeId, branchName, baseOid)` を呼ぶこと、`createLinkedBranch` の throw を callback が握りつぶす（再 throw しない）ことを unit test で pin。
- 構造検査: `grep -rn "cli/" src/core/issue-target` が 0 件（静的 `from` / 動的 `await import` 双方を捕捉）。`tests/unit/architecture/module-boundary.test.ts` に該当テストを追加する。

## T-04: リンク登録 callback の配線と base OID 固定（D3・D4・D5・D8）

- [ ] `src/cli/run.ts` の `runRunCore` / `runRun` の options 型に `onFeatureBranchCreated?: (baseOid: string, branchName: string) => Promise<void>` を追加する（`...options` で下流へ流れることを確認）。
- [ ] `src/core/command/pipeline-run.ts` の `PipelineRunOptions` に `onFeatureBranchCreated?` を追加し、`buildContext` の `workspaceOpts` に `onFeatureBranchCreated: this.options.onFeatureBranchCreated` を載せる。
- [ ] `src/core/port/runtime-strategy.ts` の `WorkspaceOptions` に `onFeatureBranchCreated?: (baseOid: string, branchName: string) => Promise<void>` を追加する（doc-comment に「不透明 effect: 呼び出し側が意味を持つ／materializer は内容を知らない」）。
- [ ] `src/core/runtime/local.ts` の `setupWorkspace` new-run arm で、fetch 後に `origin/<baseBranch>` を **1 回だけ** `git rev-parse` して `baseOid` に解決し、new-run plan に `baseOid` を載せる（`WorktreeMaterializationPlan` の `"new-run"` variant に `baseOid` を追加）。既存の behind/ahead 警告は `remoteBaseRef` のまま。
- [ ] `src/core/runtime/workspace-materializer.ts` の new-run arm で `manager.create` の base ref に `plan.baseOid` を渡し、`manager.create` **成功後・request.md copy/commit の前**に `plan.branchName` があれば `await opts?.onFeatureBranchCreated?.(plan.baseOid, plan.branchName)` を呼ぶ。
- [ ] `src/core/runtime/local.ts` の `setupWorkspaceNoWorktree` run 経路で、`git checkout -b` の前に `git rev-parse HEAD` で `headOid` を 1 回固定し、checkout 成功後・request copy の前に `branchName` があれば `await opts?.onFeatureBranchCreated?.(headOid, branchName)` を呼ぶ。
- [ ] resume 系 arm（resume-existing / resume-recreated / resume-without-recorded / attach-from-checkpoint）は callback を呼ばない（変更しない）。

**Acceptance Criteria**:
- linked branch 登録が **local feature branch と同一 immutable base OID** から行われることが test で pin される（`rev-parse origin/<base>` が 1 回だけ実行され、その値が `manager.create` の base ref と `onFeatureBranchCreated` の第 1 引数の双方に等しい）。
- worktree 作成（`manager.create`）が throw したとき `onFeatureBranchCreated` が呼ばれないことが test で pin される。
- `onFeatureBranchCreated` が reject/throw しても materialize が継続し start が成功することが test で pin される（best-effort）。
- 順序（worktree create → onFeatureBranchCreated → bootstrap commit）が test で pin される。

## T-05: 3 経路の issue-target route 配線（D2・D8）

- [ ] `src/cli/from-issue.ts` を relocated `materializeDraftAndStart`（issue-target）へ向け直し、`runRunCore` を静的 import して `startPrimitive` に注入する。`githubClient` / `owner` / `repo` は既に解決済のものを渡す。base-branch guard / detach / 副作用ゼロ停止の既存挙動は保存。
- [ ] `src/core/inbox/run-inbox.ts` の `buildEffects` 既定 `startJob` effect を、占有 pre-check 後に `const { runRunCore } = await import("../../cli/run.js")` で primitive を得て issue-target の `materializeDraftAndStart` を呼ぶ形にする（`githubClient` / `owner` / `repo` は buildEffects スコープの `opts` から渡す）。**cli/run の動的 import はこの effect 内に残す**（TC-018 を無改変 green にするため）。
- [ ] `src/cli/command-registry.ts` の positional + `--issue <n>` 経路（`:616-623` 付近）を、`issue !== undefined` のとき issue-target の positional-link 関数へ route する。当該経路で GitHub client（config/token/origin 解決）を構成し、`runRunCore` を `startPrimitive` に注入する。`issue === undefined` は現行どおり `runRun` 直呼び。detach 判定は現行位置を維持。
- [ ] 先行 request のテスト更新（assert 内容保存・mock 対象 / import path のみ変更）:
  - `src/core/job/__tests__/start-from-issue.test.ts` → issue-target の新 path へ移動 or import 更新。`cli/run.js` mock を注入 primitive の assert に置き換える。TC-001 の assert（`{ inboxOrigin: true, issue }` / writeDraft→start 順序 / SlugOccupiedError 伝播）は保存。
  - `src/cli/__tests__/from-issue.test.ts:90` の `vi.mock("../../core/job/start-from-issue.js")` を新 issue-target path に更新。TC-002〜TC-012 の assert は保存。

**Acceptance Criteria**:
- 3 経路（`--from-issue` / inbox / positional + `--issue`）すべてで、start が issue-target を経由し Development リンク登録（`onFeatureBranchCreated`）が発火することが test で pin される。
- positional + `--issue <n>` が issue-target 経由で route されることが test で pin される（従来の `runRun` 直呼びでないこと）。
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts`（TC-018）が **挙動 assert 無改変**で green（既定 startJob → `runRunCore({ inboxOrigin: true })`）。port 型拡張（`getIssue` の `nodeId` 追加）に伴う mock リテラルへの `nodeId` フィールド追加のみ許可。
- `from-issue.test.ts` / `start-from-issue.test.ts` の変更が mock 対象 / import path 更新に限られ、assert 内容（呼び出し引数契約・書き込み順序・エラー伝播）が保存されている。
- inbox の他の既存テスト（orchestrator / occupancy-propagation 等、effects 注入型）が無改変で green。

## T-06: spec に基づくテストの整備（Layer-1 振る舞いの pin）

- [ ] spec.md の各 Requirement / Scenario に対応する unit test が存在することを確認・補完する（T-03/T-04/T-05 の Acceptance で概ねカバー。欠けを追加）。
- [ ] リンク登録失敗が警告つきで start を止めないシナリオを、logger seam の警告出力とともに pin する。

**Acceptance Criteria**:
- spec.md の全 Requirement に最低 1 つの pinning test が対応する。
- リンク登録失敗時に警告が出力され、start の exit code が成功のままであることが test で pin される。

## T-07: 全体検証（受け入れ基準の gate）

- [ ] `tests/unit/architecture/` が green（新 allowlist エントリを追加しない — `arch-allowlist.ts` 無変更）。
- [ ] `bun run typecheck` green。
- [ ] `bun run test` green。

**Acceptance Criteria**:
- `tests/unit/architecture/` green かつ `tests/unit/architecture/arch-allowlist.ts` に差分が無い。
- `bun run typecheck` / `bun run test` がいずれも green。
