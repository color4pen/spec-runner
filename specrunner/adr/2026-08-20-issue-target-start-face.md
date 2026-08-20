# issue-target 層の新設: start 面・core→cli 解消・Development リンク登録

**Date**: 2026-08-20
**Status**: accepted
**Related**:
- `specrunner/adr/2026-08-20-job-start-from-issue.md`（先行: `--from-issue` CLI 契約）
- `specrunner/adr/2026-06-07-no-worktree-execution-mode.md`（no-worktree 起動モード）
- `specrunner/adr/2026-06-01-dsm-closure-src-wide.md`（DSM closure 境界）

## Context

`job start --from-issue`（先行 request）に続き、issue 起点の resume・archive が要る。これらを各コマンドに個別実装すると「issue から job を起こす方法」が start / resume / archive に分散する。本変更はその前に **issue-target 層**（`core/issue-target/`）を確立し、start 面を最初の実例として置く。

先行 request が残した二つの構造的負債を同時に解消する:

1. **core→cli の実行時依存**: `core/job/start-from-issue.ts` が `await import("../../cli/run.js")` で `runRunCore` を動的に呼び出しており、層境界（core → cli）を逆方向に越えている。
2. **issue-linked start の GitHub Integration 欠落**: pipeline はローカルで `git worktree add -b` してから push するだけで GitHub 側の Development linked branch が生まれない。`Fixes #N` による PR→issue リンクは既に成立しているが、branch→issue リンクは存在しない。後続 request（issue-target-resume-from-issue）が issue → job を発見するには GitHub の `linkedBranches` index が必要。

加えて、branch 名の inline テンプレート（`${getBranchPrefix(type)}${slug}-${jobId.slice(0,8)}`）が 3 箇所に重複していた。

## Decisions

### D1: 3 段の責務分離と `core/issue-target/` 層の新設

```
inbox       = issue を「発見する」（ラベル検索・承認 gating）
issue-target = 発見済み issue を「job lifecycle へ変換する」
job         = 実際に「仕事をする」
```

`src/core/issue-target/` を新設し、先行 request の `materializeDraftAndStart`（issue 本文 → draft 実体化 → start primitive 呼び出し）と issue 本文 parse を移設する。移設は挙動保存。層の依存方向は **issue-target → core primitives の一方向のみ**。job start 本体・pipeline・step 群は issue-target を import しない。

**採用理由**: 3 stage の境界が型と配置で表現される。将来の issue 起点 resume / archive がこの層に閉じる。

**却下案**: 各コマンドに個別実装のまま → 同型ロジック分散が続く。`core/job/` に留置 → issue 変換と job 実行の責務が混ざる。

### D2: core→cli 依存の解消 — start primitive の注入

`core/issue-target/` は `cli/` を静的にも動的にも import しない。start の起動入口（`runRunCore` 相当）を **注入パラメータ `startPrimitive`** として受け取る形にする。

3 経路での primitive 供給:

| 経路 | 供給元 |
|------|--------|
| `--from-issue`（`cli/from-issue.ts`）| cli 層なので `runRunCore` を静的 import して注入 |
| positional + `--issue`（`cli/command-registry.ts`）| 同上 |
| inbox 既定 `startJob`（`core/inbox/run-inbox.ts`）| 既定 effect 内で `await import("../../cli/run.js")` を行い注入 |

inbox の既定 effect に動的 import を移した理由: `tests/unit/inbox/run-inbox-inbox-origin.test.ts` は effects を注入せず `vi.mock("../../../src/cli/run.js")` で**既定 startJob の配線**（inbox→cli/run）を pin し `inboxOrigin: true` を assert する。issue-target を cli-free にしつつこのテストを無改変 green に保つ唯一の形は、cli/run 参照を**issue-target の外**（inbox 既定 effect）へ逃がすこと。inbox→cli の動的 edge は既存 `resumeJob` effect と同型で DSM closure 検査（静的 import のみ走査）にも掛からず新 allowlist を要しない。

issue-target 層の cli 非依存は構造検査（`"cli/"` を含む import がゼロ）でアーキテクチャテストに pin する。

**却下案**:
- `runRunCore` を core primitive へ昇格: `wireProgressDisplay`（cli/progress）を core へ引き込むか注入増設が必要で、かつ `run-inbox-inbox-origin.test.ts` の `vi.mock("cli/run")` が経路から外れて赤化。却下。
- inbox 既定 effect からも cli を除去（primitive 必須注入）: 同テストが注入なしで赤化、「無改変」に反する。却下。

### D3: Development リンク登録 — 不透明 callback の注入

pipeline / start 本体が `issueNumber` を読んで GitHub Development API を叩く形にはしない。代わりに **不透明 effect `onFeatureBranchCreated(baseOid, branchName)`** を注入し、`WorkspaceMaterializer` の new-run arm が worktree 作成成功直後に呼ぶ。issue-target がこの callback を構築する（`issueNumber → createLinkedBranch` の知識を closure に閉じる）。generic start（issue linkage なし）は callback を渡さない。

配線経路: `runRunCore(options)` → `PipelineRunOptions.onFeatureBranchCreated` → `buildContext` → `workspaceOpts.onFeatureBranchCreated` → `setupWorkspace` → materializer が呼ぶ。materializer は callback の意味（issue 連携）を知らない。

**採用理由**: 「pipeline は issueNumber を state へ載せるだけ」という先行実装の性質を保存する。callback を不透明にすることで materializer / pipeline は Development API を知らずに済む。

**却下案**: materializer に `issueNumber` を渡して materializer が API を叩く → 現行性質を破壊し、pipeline の責務が拡大する。却下。

### D4: base OID を 1 回だけ固定する

`setupWorkspace` の new-run arm で、fetch 後に `origin/<baseBranch>` を **一度だけ** `git rev-parse` して immutable OID に解決し、new-run plan に `baseOid` として載せる。materializer は同一 `baseOid` を (a) `manager.create` の base ref、(b) `onFeatureBranchCreated(baseOid, ...)` の両方に渡す。

**採用理由**: linked branch と local feature branch が同一 immutable OID から生まれることを保証し、push が同一基点からの fast-forward として成立する。base を 2 回解決すると解決間に origin が進んで OID が食い違う risk がある。「解決 1 回」をテストで pin する。

**却下案**: symbolic ref を両者に渡す → 解決タイミングで食い違う可能性が残る。却下。

### D5: リンク登録の順序契約と best-effort

new-run arm 内の順序:

1. base OID 固定（D4）
2. `manager.create` で local worktree + feature branch を baseOid から作成（**成功後に**次へ）
3. `onFeatureBranchCreated(baseOid, branchName)` → `createLinkedBranch(issueId, name, baseOid)`
4. request materialize → bootstrap commit → push

worktree 作成（手順 2）が throw した場合、callback（手順 3）には到達しない → GitHub 側に空 linked branch が残らない。リンク登録失敗（権限・API 障害等）は callback 内で捕捉し **警告を出して握りつぶす** — start は止めない。

bootstrap commit（手順 4）が失敗して cleanup された場合、baseOid の空 linked branch（= `origin/<base>` と同一 tree、無害）が残り得る。掃除は `deleteLinkedBranch`（スコープ外）。best-effort の許容範囲とする。

**採用理由**: createLinkedBranch を push より前に置く理由は、push が branch を baseOid から進めた後に baseOid で linked branch を作ると衝突するため（先に baseOid で作り、後で FF push）。

### D6: port 拡張と GraphQL adapter

- `GitHubClient.getIssue()` 返り値に `nodeId: string`（required、optional 化しない）を追加。REST `node_id` を adapter でマッピング。既存 caller は追加フィールドを無視するため後方互換。
- `GitHubClient.createLinkedBranch(issueId, name, oid): Promise<void>` を追加。adapter は同一 fetch で GraphQL エンドポイントへ POST（mutation `createLinkedBranch(input:{issueId,name,oid})`）。非 2xx / GraphQL `errors` は throw（fail-closed）。caller（issue-target callback）が捕捉して best-effort 化する（責務分離: adapter は throw、caller が方針決定）。
- GraphQL エンドポイント導出: REST base が `…/api/v3` で終われば `…/api/graphql`、それ以外は `+ "/graphql"`。github.com / GHES 双方をカバー。

**採用理由**: `createLinkedBranch` に渡す issueId は GraphQL node ID。REST は `node_id` を返すので port へ透過させれば追加 API 往復不要。`nodeId?: string`（optional 化）は型の弱体化となるため採用しない。

### D7: branch 名 builder の単一定義化

`buildFeatureBranchName(type, slug, jobId): string` を `src/config/type-config.ts`（`getBranchPrefix` の隣）に置き、作る側 3 箇所（`pipeline-run.ts` / `design.ts` / `commit-orchestrator.ts`）をすべて収束させる。リンク登録は builder の出力（pipeline-run が構成し `workspaceOpts.branchName` → materializer → callback の `branchName` として流れる同一文字列）を消費し、独自に再構成しない。

**この builder を branch 発見の逆関数として使うことは禁止する**。issue からの job 発見は Development リンク + checkpoint identity で行う（後続 request: issue-target-resume-from-issue の契約）。

**採用理由**: issue-target は jobId を知らない（jobId は pipeline 内で採番）ため builder を呼べない。pipeline-run が 1 回構成し、その文字列を worktree 作成と callback の双方が消費する形が単一真理を最も強く保証する。

**却下案**: callback 側で builder を再呼び出し → issue-target に type/slug/jobId を渡す必要が生じ結合が増え、再構成 drift の余地も残る。却下。

### D8: positional + `--issue` の route と no-worktree

- positional + `--issue <n>` も issue-target 経由で route する（`inboxOrigin` は付けない — request.md は issue 本文とは別に転記され得るため fidelity gate 比較を残す）。command-registry が GitHub client を構成し issue-target の positional-link 関数へ渡す。
- no-worktree run 経路（`local.ts setupWorkspaceNoWorktree`）も callback を発火させる: `git checkout -b` 前に `git rev-parse HEAD` で HEAD OID を 1 回固定し、checkout 成功後に `onFeatureBranchCreated(headOid, branchName)` を呼ぶ。best-effort が unpushed-HEAD による createLinkedBranch 失敗を吸収する。

**採用理由**: 3 経路すべてでリンクが発火する受け入れ基準を満たす。no-worktree を落とすと issue-linked + no-worktree の sibling が黙って壊れる。

**Trade-off**: no-worktree の base（local HEAD）が origin 未 push なら createLinkedBranch は失敗 → 警告 → start 継続。許容。

## Alternatives Considered

### Alternative 1: D1 — 各コマンドに issue→job 変換を個別実装のまま維持する

- **Pros**: 層新設コストがゼロ。既存コードを触らない。
- **Cons**: resume / archive が同型の「issue からどう job を起こすか」ロジックをそれぞれ持ち始め、同型ロジックが 3 箇所以上に分散する。修正が 1 箇所で済まなくなる。
- **Why not**: 後続 request（resume / archive）が来るたびに負債が膨らむことが確実なため。今が分離コストが最小のタイミング。

### Alternative 2: D1 — `core/job/` に留置する（層を新設しない）

- **Pros**: ディレクトリ新設なし。`materializeDraftAndStart` は `core/job/` に既にある。
- **Cons**: issue 変換ロジック（issue → request source）と job 実行ロジック（pipeline 起動・状態管理）の責務が同じディレクトリに混在する。future の resume が `core/job/` 内で issue locator 解決を持つと境界がなくなる。
- **Why not**: 責務の型と配置での表現が失われ、3 段モデル（inbox / issue-target / job）が成立しない。

### Alternative 3: D2 — `runRunCore` を core primitive へ昇格させる

- **Pros**: 動的 import が不要になり、依存が完全に静的になる。issue-target も inbox も cli を import しなくなる。
- **Cons**: `runRunCore` は `wireProgressDisplay`（`cli/progress`）を参照しており、昇格には progress 表示を core へ引き込むか別途注入する必要がある。さらに `tests/unit/inbox/run-inbox-inbox-origin.test.ts` は `vi.mock("cli/run")` で inbox→cli/run 配線を pin しているため、cli/run が経路から外れると同テストが赤化し「無改変 green」の受け入れ基準に反する。
- **Why not**: テスト無改変の制約と progress 表示の依存拡大が同時に阻む。コストが利益を上回る。

### Alternative 4: D2 — inbox 既定 effect からも cli を除去し、primitive を必須注入にする

- **Pros**: inbox→cli の動的 edge が完全に消える。すべての経路で primitive が明示的に注入される。
- **Cons**: `tests/unit/inbox/run-inbox-inbox-origin.test.ts` が effects を注入せず既定 startJob を通す形でテストしており、primitive 必須注入にするとこのテストが注入なしで赤化する。「inbox の既存テストは無改変で green」という受け入れ基準に直接反する。
- **Why not**: 既存テストの無改変 green が絶対制約であり、この案はそれを破る唯一の点で棄却。

### Alternative 5: D3 — materializer または pipeline が `issueNumber` を受け取り Development API を直接叩く

- **Pros**: callback 注入の多層配線（PipelineRunOptions → WorkspaceOptions → materializer）が不要になり、配線がシンプルになる。
- **Cons**: 「pipeline は issueNumber を state へ載せるだけで GitHub API を issue 目的で叩かない」という先行実装の性質を破壊する。materializer / pipeline が GitHub Development API を知ることになり、responsibility が拡大する。issue-linked でない通常 start との分岐ロジックが pipeline 内部に侵食する。
- **Why not**: 現行性質の保存が要求 3 の明示的な制約であり、選択の余地がない。

### Alternative 6: D4 — symbolic ref（`origin/<baseBranch>`）を worktree 作成と `createLinkedBranch` の両方に渡す

- **Pros**: `git rev-parse` の追加コマンド実行が不要。シンプル。
- **Cons**: symbolic ref は解決タイミングで指し示す OID が変わる。worktree 作成と `createLinkedBranch` の間に他の push が origin を進めると、両者が別の OID から branch を作ることになり「同一 immutable OID から作られる」という受け入れ基準に反する。
- **Why not**: OID 食い違いによる fast-forward 失敗や linked branch の不整合リスクが受け入れ基準違反に直結する。

### Alternative 7: D6 — `nodeId` を optional（`nodeId?: string`）にし、呼び出し側で non-null 断言する

- **Pros**: 既存の mock リテラルへの `nodeId` フィールド追加を不要にできる（型エラーが出ない）。
- **Cons**: 型が弱くなる。null/undefined が実行時に `createLinkedBranch` の issueId に流れ込んだ場合、GitHub API が不正な mutation を受けてエラーになるまで検出されない。request も「optional 化は不採用」と明示している。
- **Why not**: 型の弱体化は明示的に禁止されており、影響する mock リテラルへの 1 行追加の方がコストが低い。

### Alternative 8: D6 — `nodeId` 取得専用の GraphQL query を別途実行する

- **Pros**: `getIssue()` の返り値を変更しない。port の既存インターフェースを保存できる。
- **Cons**: REST `GET /issues/{n}` が既に `node_id` を返しているにもかかわらず、それを落として GraphQL で取り直すという無駄な往復が追加される。レイテンシとレート制限の消費が増える。
- **Why not**: 既存 REST レスポンスを透過させるだけで済む問題に追加 API 往復は不要。

## Consequences

### Positive

- inbox / `--from-issue` / positional + `--issue` の 3 経路が issue-target に統一され、future の resume / archive がここに閉じる起点ができた。
- `core/issue-target/` は cli 非依存の構造検査で保護されており、将来の追加が境界を崩しにくい。
- Development linked branch が登録されることで、後続 request が `issue.linkedBranches` を使って issue → branch → job を発見できる基盤が整った。branch 命名規則の逆引きに頼らなくてよくなる。
- `buildFeatureBranchName` の単一定義化により、branch 名の 3 箇所 inline が収束した。逆引き禁止を命名と ADR で明示し、後続 request の契約を守る土台とした。
- inbox の既存テストが無改変で green のまま（挙動保存の証拠）。

### Negative / Known Debt

- inbox 既定 effect に `await import("../../cli/run.js")` の動的 edge が残る。issue-target 自体は cli-free だが inbox→cli の edge は `resumeJob` effect と同型で引き続き存在する（スコープ外）。
- managed runtime での issue-linked start は Development リンクを登録しない（base OID 契約が local worktree 前提）。managed issue-linked start を実際に運用する時点で別途設計が必要。
- bootstrap commit 失敗で cleanup された場合、空の linked branch（baseOid 上に branch を作るだけで tree 変更なし）が GitHub 側に残り得る。`deleteLinkedBranch` による掃除はスコープ外。
- no-worktree path の HEAD が origin 未 push の場合、createLinkedBranch は失敗して警告のみ（start は継続）。

## References

- Request: `specrunner/changes/issue-target-start-face/request.md`
- Design: `specrunner/changes/issue-target-start-face/design.md`
- Predecessor: `specrunner/adr/2026-08-20-job-start-from-issue.md`
