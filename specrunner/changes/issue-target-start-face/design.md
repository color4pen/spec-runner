# Design: issue-target 層の新設 — start 面の移設・core→cli 解消・Development リンク登録

## Context

issue を起点に job lifecycle を操作する経路が `job start --from-issue` / inbox 起点 / positional + `--issue <n>` の 3 つに分かれつつある。現状これらは「issue からどう job を起こすか」を個別の場所に持ち、後続の resume / archive でも同型ロジックが分散する見込み。本変更は issue → job lifecycle 変換を単一所有する層 `core/issue-target/` を新設し、その **start 面** を確立する。

現状コード（検証済み）:

- `src/core/job/start-from-issue.ts` — `materializeDraftAndStart(repoRoot, slug, issueBody, issueNumber)`: `writeDraft` → `await import("../../cli/run.js")` の **動的 import** で `runRunCore` を呼ぶ（`{ inboxOrigin: true, issue }`）。core→cli の実行時依存が残る唯一の start 経路。
- `src/cli/from-issue.ts` — `--from-issue` の入口。config/token/origin 解決 → `getIssue` → `parseRequestMdContent` → base-branch guard → detach → `materializeDraftAndStart`。
- `src/core/inbox/run-inbox.ts:396` — 既定 `startJob` effect が占有 pre-check 後に `materializeDraftAndStart` を動的 import して呼ぶ。effects は注入可能。`resumeJob` effect は既に `cli/resume.js` を動的 import している（inbox→cli の既存動的 edge、本変更のスコープ外）。
- `src/cli/command-registry.ts:583` は `--from-issue` を `runFromIssue` へ route。`:622-623` の positional + `--issue <n>` は `runRun(path, { issue })` を **issue-target を経由せず**直接呼ぶ。
- `src/core/command/pipeline-run.ts:174-175` / `src/core/step/design.ts:151` / `src/core/step/commit-orchestrator.ts:403-404` — `${getBranchPrefix(type)}${slug}-${jobId.slice(0,8)}` のインライン branch 名構成が **3 箇所**重複。共有 builder は無い。
- `src/core/runtime/local.ts:478-479` — 新規 start は `remoteBaseRef = origin/<baseBranch>`（**symbolic ref**）を base に worktree を作る。`WorkspaceMaterializer` new-run arm（`workspace-materializer.ts:150-255`）が worktree 作成 → request materialize → bootstrap commit → push を 1 arm 内で行う。pipeline は `issueNumber` を state へ載せるだけで GitHub API を issue 目的で叩かない。
- `src/kernel/github-client.ts:269`（port の実体、`core/port/github-client.ts` は re-export）と `src/adapter/github/github-client.ts:670-682` の `getIssue()` は REST の `node_id` を落として `{ number, title, body }` のみ返す。adapter は REST（fetch）専用で GraphQL 未実装。`createLinkedBranch` / `linkedBranch` は現状コードに存在しない。
- `src/core/pr-create/body-template.ts:75` の `Fixes #<issueNumber>` により **PR→issue の Development リンクは既に成立**。branch 側リンクは pipeline がローカル `git worktree add -b` + push で作るため存在しない。
- GitHub API 制約: linked branch 作成は GraphQL mutation `createLinkedBranch(issueId, oid, name)` のみ。既存 branch の後付けリンクは公開 mutation に無い。

検証で判明した前提の齟齬（重要 — Decisions D2 で扱う）: request は「inbox の既存テストは effects 注入でテストされ配線非依存」と述べるが、`tests/unit/inbox/run-inbox-inbox-origin.test.ts`（TC-018）は effects を **注入せず**、`vi.mock("../../../src/cli/run.js")` で **既定 startJob の配線**（inbox→cli/run）を pin し、`inboxOrigin: true` を assert する。この 1 本だけは配線依存であり、「無改変で green」を満たすには既定 startJob から `runRunCore`（cli/run）が到達可能なままである必要がある。

## Goals / Non-Goals

**Goals**:

1. `core/issue-target/` 層を新設し、`materializeDraftAndStart` と issue 本文 parse を移設する（挙動保存）。
2. issue-target 層を静的にも動的にも **cli/ 非依存**にする（start primitive は注入）。
3. issue-linked start（3 経路）を issue-target 経由に統一し、feature branch を issue の Development linked branch として `createLinkedBranch` で登録する。
4. base OID を 1 回だけ固定し、worktree の feature branch と linked branch を同一 immutable OID から作る。
5. リンク登録は worktree 作成成功を前提とし、登録失敗は警告つき best-effort（start を止めない）。
6. branch 名構成を単一 builder に収束させ、作る側 3 箇所を収束させる（逆引きには使わない）。
7. `getIssue()` 返り値に `nodeId` を追加する port 拡張。

**Non-Goals**（request のスコープ外に準拠）:

- `job resume --from-issue` / issue→job locator 解決（後続 request）。
- `deleteLinkedBranch` によるリンク掃除（cancel / archive）。
- inbox 発見ロジック・issue notifier・fidelity gate・`JobState.issueNumber` の変更。
- managed runtime の Development リンク登録（base OID 契約は local worktree 前提。Open Questions 参照）。
- `.github/workflows/` の変更。

## Decisions

### D1: `core/issue-target/` 層の新設と start 面の移設

`src/core/issue-target/` を新設し、`materializeDraftAndStart`（issue 本文 → draft 実体化 → start）と issue 本文 parse を移設する。層の依存方向は **issue-target → core primitives の一方向のみ**。job start 本体・pipeline・step 群は issue-target を import しない。

移設の挙動保存:
- inbox の既定 `startJob` effect は引き続き同じ振る舞い（占有 pre-check → draft 実体化 → start、`inboxOrigin: true`）。
- `materializeDraftAndStart` の呼び出し引数契約（`writeDraft` を start より先に、`{ inboxOrigin: true, issue }`、SlugOccupiedError 伝播）を保存する。

**Rationale**: 3 段の責務分離（inbox=発見 / issue-target=変換 / job=実行）を型と配置で表現する。将来の issue 起点 resume / archive がこの層に閉じる。
**Alternatives**: (a) 各コマンドに個別実装のまま → 同型ロジック分散が続く。棄却。(b) `core/job/` に留置 → issue 変換と job 実行の責務が混ざる。棄却。

### D2: core→cli 依存の解消 — start primitive の注入

`materializeDraftAndStart`（および positional 経路の issue-link 関数）は `cli/run.js` を **動的にも静的にも import しない**。start の起動入口（`runRunCore` 相当）を **注入パラメータ `startPrimitive`** として受け取る。issue-target 層は cli/ 非依存を構造検査（grep）で pin する（`"cli/"` は静的 `from` も `await import` も両方部分文字列として捕捉する）。

3 経路の primitive 供給元:
- `--from-issue`（`cli/from-issue.ts`）: cli 層なので `runRunCore` を静的 import して注入。
- positional + `--issue`（`cli/command-registry.ts`）: 同上。
- inbox 既定 `startJob`（`core/inbox/run-inbox.ts` の `buildEffects`）: **動的 import を start-from-issue.ts から run-inbox.ts の既定 effect へ移す**。`const { runRunCore } = await import("../../cli/run.js")` を effect 内で行い issue-target へ注入する。

**Rationale**: TC-018（Context の齟齬）は既定 startJob → cli/run の配線を無改変で pin する。issue-target を cli-free にしつつ TC-018 を無改変 green に保つ唯一の形は、cli/run 参照を **issue-target の外**（inbox 既定 effect）へ逃がすこと。inbox→cli の動的 edge は既存 `resumeJob` effect と同型で、DSM closure test（静的 import のみ走査、attestation 済）にも掛からず新 allowlist を要しない。issue-target 層自体は完全に cli-free。
**Alternatives**: (a) `runRunCore` を core primitive へ昇格 → `wireProgressDisplay`（cli/progress）を core へ引き込むか注入増設が必要で、かつ TC-018 の `vi.mock("cli/run")` が経路から外れて赤化。棄却。(b) inbox 既定 effect からも cli を除去（primitive 必須注入）→ TC-018 が注入せず赤化、「無改変」に反する。棄却。

### D3: Development リンク登録 — 不透明 callback の注入（pipeline は issueNumber を見ない）

pipeline / start 本体が `issueNumber` を読んで Development API を叩く形にはしない。代わりに **不透明な effect `onFeatureBranchCreated(baseOid, branchName)`** を注入し、`WorkspaceMaterializer` の new-run arm が worktree 作成成功直後に呼ぶ。issue-target がこの callback を構築し（`issueNumber → createLinkedBranch` の知識を closure に閉じる）、`startPrimitive` の options に載せる。generic start（issue linkage なし）は callback を渡さない。

配線: `runRunCore(options)` → `...options` で `PipelineRunOptions.onFeatureBranchCreated` → `buildContext` が `workspaceOpts.onFeatureBranchCreated` へ → `setupWorkspace` → materializer が呼ぶ。materializer は callback の意味（issue 連携）を知らない。

**Rationale**: 「pipeline は issueNumber を state へ載せるだけ」という現行性質を保存する（要求 3）。callback を不透明にすることで materializer/pipeline は Development API を知らずに済む。
**Alternatives**: materializer に `issueNumber` を渡して materializer が API を叩く → 現行性質を壊す（要求 3 違反）。棄却。

### D4: base OID を 1 回だけ固定する

`setupWorkspace` の new-run arm で、fetch 後に `origin/<baseBranch>` を **一度だけ** `git rev-parse` して immutable OID に解決し、new-run plan に `baseOid` として載せる。materializer は同一 `baseOid` を (a) `manager.create` の base ref、(b) `onFeatureBranchCreated(baseOid, ...)` の両方に渡す。resume arm は symbolic `remoteBaseRef` のまま（リンク登録なし）。

**Rationale**: linked branch と local feature branch が同一 immutable OID から生まれることを保証し、push が同一基点からの fast-forward として成立する（createLinkedBranch が baseOid に branch を作り、local が baseOid+bootstrap で push すると FF）。base 解決を 2 回すると解決間に origin が進み OID が食い違う risk。
**Alternatives**: symbolic ref を両者に渡す → 「同一 immutable OID」を保証できず、解決タイミングで食い違う可能性。棄却。

### D5: 登録の順序契約と best-effort

順序（new-run arm 内）:

1. base OID 固定（D4）。
2. `manager.create` で local worktree + feature branch を baseOid から作成（**成功後に**次へ）。
3. `onFeatureBranchCreated(baseOid, branchName)` → `createLinkedBranch(issueId, name, baseOid)`。
4. request materialize → bootstrap commit → push（後続の step push で FF）。

worktree 作成（手順 2）が throw した場合、callback（手順 3）には到達しない → GitHub 側に空 linked branch が残らない。リンク登録の失敗（権限・API 障害等）は callback 内で捕捉し **警告（logger seam）を出して握りつぶす** — start は止めない。リンク不在時の issue 起点 resume は後続 request が fail-closed + `job attach --branch` 誘導で受け止める。

**Rationale**: 「手順 2 の成功が手順 3 の前提」を arm 内の順序で自然に満たす。createLinkedBranch を push より前に置くのは、push が branch を baseOid から進めた後に baseOid で linked branch を作ると衝突するため（先に baseOid で作り、後で FF）。
**Trade-off**: bootstrap commit（手順 4）が失敗して cleanup された場合、baseOid の空 linked branch（= `origin/<base>` と同一 tree、無害）が残り得る。掃除は `deleteLinkedBranch`（スコープ外）。best-effort の許容範囲。

### D6: port 拡張と GraphQL adapter

- `GitHubClient.getIssue()` の返り値に `nodeId: string` を追加（REST `node_id` を adapter でマッピング）。既存 caller（fidelity gate 経路 / `from-issue`）は追加 field を無視するため後方互換。
- `GitHubClient.createLinkedBranch(issueId, name, oid): Promise<void>` を追加。adapter は同一 fetch で GraphQL エンドポイントへ POST（mutation `createLinkedBranch(input:{issueId,name,oid})`）。非 2xx / GraphQL `errors` は `githubApiError` を throw（fail-closed）。caller（issue-target callback）が捕捉して best-effort 化する（責務分離: adapter は throw、caller が方針決定）。
- GraphQL エンドポイント導出: REST base が `…/api/v3` で終われば `…/api/graphql`、それ以外（`https://api.github.com`）は `+ "/graphql"`。github.com / GHES 双方をカバー。

**Rationale**: `createLinkedBranch` に渡す issueId は GraphQL node ID。REST は `node_id` を返すので port へ透過させれば追加 API 往復不要。
**Alternatives**: nodeId 専用取得 query を別途叩く → 往復増。棄却。

### D7: branch 名 builder の単一定義化

`buildFeatureBranchName(type, slug, jobId): string`（= `${getBranchPrefix(type)}${slug}-${jobId.slice(0,8)}`）を `src/config/type-config.ts`（`getBranchPrefix` の隣）に置き、**作る側 3 箇所**（`pipeline-run.ts` / `design.ts` / `commit-orchestrator.ts`）を収束させる。リンク登録は builder の出力（pipeline-run が構成し `workspaceOpts.branchName` → materializer → callback の `branchName` として流れる同一文字列）を **消費**し、独自に再構成しない。これにより local branch と linked branch の名が構成上バイト同一になる。

**この builder を branch 発見の逆関数として使うことは禁止**（issue からの job 発見は Development リンク + checkpoint identity で行う。後続 request の契約）。

**Rationale**: issue-target は jobId を知らない（jobId は pipeline 内で採番）ため builder を呼べない。pipeline-run が builder で 1 回構成し、その文字列を worktree 作成と callback の双方が消費する形が単一真理を最も強く保証する（再構成による drift を排除）。
**Alternatives**: callback 側で builder を再呼び出し → issue-target に type/slug/jobId を渡す必要が生じ結合が増え、再構成 drift の余地も残る。棄却。

### D8: positional + `--issue` の route と no-worktree

- positional + `--issue <n>` は issue-target 経由で route する（`inboxOrigin` は付けない — request.md は issue 本文とは別に転記され得るため fidelity gate 比較を残す）。command-registry は当該経路で GitHub client を構成し（`--from-issue` / inbox と同型の config/token/origin 解決）、issue-target の positional-link 関数へ渡す。detach 判定は現行位置（issue routing の前）を維持。
- no-worktree run 経路（`local.ts setupWorkspaceNoWorktree`）も callback を発火させる: `git checkout -b` 前に `git rev-parse HEAD` で HEAD OID を 1 回固定し、checkout 成功後に `onFeatureBranchCreated(headOid, branchName)` を呼ぶ。best-effort が unpushed-HEAD による createLinkedBranch 失敗を吸収する。

**Rationale**: 3 経路すべてでリンクが発火する受け入れ基準を満たす。no-worktree を落とすと issue-linked + no-worktree の sibling が黙って壊れる。best-effort で degrade 可能なので発火自体は共通化する。
**Trade-off**: no-worktree の base（local HEAD）が origin 未 push なら createLinkedBranch は失敗 → 警告 → start 継続。許容。

## Risks / Trade-offs

- [Risk] TC-018 の配線依存を見落とすと、core→cli 完全除去に走って既存 inbox テストが赤化。→ **Mitigation**: D2 で inbox 既定 effect に cli/run 動的 import を残す設計を明示。issue-target 層のみ cli-free を構造検査で pin。
- [Risk] callback を多層に通す配線（runRunCore→PipelineRunOptions→WorkspaceOptions→materializer）でどこか一箇所落とすとリンクが発火しない。→ **Mitigation**: 各層で optional 1 フィールドの受け渡し。3 経路発火をテストで pin。
- [Risk] base OID を 2 回解決すると「同一 immutable OID」契約が破れる。→ **Mitigation**: new-run arm で 1 回だけ rev-parse、plan に載せ両消費者へ配布。「解決 1 回」をテストで pin。
- [Risk] createLinkedBranch を push 後に実行すると branch 衝突。→ **Mitigation**: D5 の順序（worktree → link → materialize/commit/push）を arm 内位置で固定しテストで pin。
- [Risk] port `getIssue` に `nodeId` 追加で既存 mock（テスト内 client リテラル）の型が壊れる。→ **Mitigation**: `nodeId: string` は required を維持し、影響を受ける mock リテラル（`run-inbox-inbox-origin.test.ts` / `from-issue.test.ts`）に `nodeId` フィールドを 1 行追加する（B 案）。挙動 assert は無改変のまま型エラーを解消する。optional 化（`nodeId?: string`）は不採用。

<!-- spec-fixer-deferred: no-worktree Scenario に対応する TC を test-cases.md に追加できなかった（spec-fixer は test-cases.md への書き込み権限を持たない）。tasks.md T-04 AC に要件を追記済み。implementer が TC を追加するか、次回 test-case-gen で補完すること。 -->

## Open Questions

- managed runtime の issue-linked start に Development リンクを登録するか。base OID 契約は local worktree（`origin/<base>` rev-parse）前提で、managed の branch 生成経路は別。本 request では local のみ対象とし、managed は callback を発火しない（リンク不在は後続 resume が fail-closed で受ける）。managed issue-linked start を実際に運用する時点で別途設計する想定 — 実装/レビューで異論あれば要提起。
- GHES の GraphQL エンドポイント導出（`…/api/v3` → `…/api/graphql`）は一般的な GHES 構成前提。非標準 `apiBaseUrl` 明示設定時の導出はテストで固定するが、想定外のホスト形状は best-effort 失敗に落ちる（start は止まらない）。
