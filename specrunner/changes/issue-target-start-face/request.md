# issue-target 層の新設: start 面の移設・core→cli 解消・Development リンク登録

## Meta

- **type**: new-feature
- **slug**: issue-target-start-face
- **base-branch**: main
- **adr**: true

## 背景

issue を起点に job lifecycle を操作する経路が増えつつある: `job start --from-issue`（先行 request: job-start-from-issue）に続き、issue 起点の resume、将来的には issue 起点の archive が要る。これらを各コマンドに独立実装すると、start / resume / archive がそれぞれ「issue からどう復元するか」を個別に知り始め、同型ロジックが分散する。

これを **issue-target 層**（`core/issue-target/`）として一箇所に閉じる。層の原則:

> **issue は request source（start 時）または job locator（既存 job 操作時）である。実行開始後の job identity / state の正本は remote checkpoint にある。**

3 段の整理: inbox = issue を「発見する」／ issue-target = 発見済み issue を「job lifecycle へ変換する」／ job = 実際に「仕事をする」。

本 request は層を新設し **start 面** を確立する: 先行 request の issue → request source 変換を層へ移設し、その際に core→cli の実行時依存を解消する。また、既存 job 操作（後続 request の resume locator）が issue から job を発見できるよう、issue-linked start 時に GitHub の **Development リンク**（Issue ↔ Branch 紐付け）を登録する。GitHub 自身が issue → branch の index を持つため、branch 命名規則を逆引きに使う必要がなくなる。

## 現状コードの前提

- 先行 request `job-start-from-issue` は、issue 本文 → draft 実体化 → start の連鎖を単一関数 `materializeDraftAndStart` に実装している（配置は挙動非依存の open point とされ、`src/core/job/` または `src/core/inbox/` 近傍にある）。inbox の startJob effect と `job start --from-issue` の両方がこれを呼ぶ。
- 同実装は `runRunCore`（cli/run）への参照を inbox 既存パターン踏襲の**動的 import**（`await import("../../cli/run.js")`）としており、静的依存はないが core→cli の実行時依存が残っている。
- `src/core/pr-create/body-template.ts:75` — issue-linked job の PR body には `Fixes #<issueNumber>` が既に入る。**PR → issue の Development リンクは現行実装で既に成立している**。branch 側の Development リンクは存在しない: pipeline は branch をローカル `git checkout -b` + push で作るため、GitHub 側の linked branch は生まれない。
- GitHub API の制約（2026-08-20 に GraphQL introspection で確認）: linked branch の作成は mutation `createLinkedBranch`（`issueId` / `oid`（基点 SHA）/ `name`）で、**新規 branch を issue に紐付けて作る**形。既存 branch を後からリンクする公開 mutation は無い。`deleteLinkedBranch` も存在する。参照は `issue.linkedBranches`。
- `src/adapter/github/github-client.ts` — 現行 client は REST（fetch ベース）のみで GraphQL 呼び出しは未実装。GraphQL は同じ fetch で `/graphql` へ POST する形で追加可能。issueId（GraphQL node ID）は REST の issue 取得結果（`node_id`）から得られる。
- `src/core/command/pipeline-run.ts:174-175` — branch 名は `getBranchPrefix(request.type)` + slug + jobId 先頭 8 文字のインライン template で構成される（prefix は request.type に依存）。共有 builder 関数は存在しない。
- 新規 start の実行順序は「worktree + local branch 作成（`origin/<base-branch>` 基点、`src/core/runtime/local.ts:478-479`）→ request/state materialize → bootstrap commit → push」（`src/core/runtime/workspace-materializer.ts`）。pipeline は `issueNumber` を state へ載せるだけで、GitHub API を issue 目的で叩くことはない。

## 要求

### 1. `core/issue-target/` 層の新設と start 面の移設

issue → job lifecycle 変換を単一所有するディレクトリ `core/issue-target/` を設け、先行 request の issue → request source 変換（`materializeDraftAndStart` と issue 本文 parse）を移設する。移設は挙動保存であり、inbox・`job start --from-issue` の既存テスト期待を書き換えない。

層の依存方向は issue-target → core primitives の一方向のみ。job start 本体・pipeline・step 群は issue-target 層に依存しない。

### 2. core→cli 依存の解消

移設に際し、`cli/run.js` への動的 import を**持ち込まない**。start の application primitive（runRunCore 相当の起動入口）を core 側の正式な primitive として位置付け直すか、start primitive を issue-target へ注入する形にする。層の一方向依存を静的にも動的にも成立させる。inbox の startJob effect も同じ解消後の経路に乗る。

### 3. issue-linked start の route 所有と Development リンク登録

**issue-linked な start はすべて issue-target を経由する**: `--from-issue`、inbox 起点、そして positional request + `--issue <n>` の CLI 経路も issue-target.start(...) へ route してから generic start primitive に入る。pipeline / start 本体が `issueNumber` を見て Development API を叩く形にはしない（pipeline は `issueNumber` を state へ載せるだけ、という現行の性質を保存する）。

issue-linked start は、feature branch を issue の Development linked branch として GitHub 側に登録する。API 制約（前提参照）により「既存 branch の後付けリンク」はできないため、`createLinkedBranch`（基点 oid + branch 名）を使う。順序と基点は以下を契約とする:

1. **base OID を一度だけ固定する**（`origin/<base-branch>` の解決を 1 回にする）
2. local worktree + feature branch を固定した base OID から作成する（**成功後に**次へ進む）
3. `createLinkedBranch(issueId, branch 名, 同一の base OID)` で Development リンクを登録する
4. request materialize → bootstrap commit → push（push は同一基点からの fast-forward として成立する）

worktree 作成に失敗した場合、GitHub 側に空の linked branch が残らない（手順 2 の成功が手順 3 の前提）。登録失敗（権限・API 障害等）は **警告つき best-effort** とし、start を止めない（リンク不在時の issue 起点 resume は後続 request が fail-closed + `job attach --branch` 誘導で受け止める）。

### 4. branch 名 builder の単一定義化（作る側のみ）

`getBranchPrefix(request.type)` + slug + jobId8 のインライン構成を共有 builder 関数に抽出し、branch を作る側（pipeline-run とリンク登録）がそれを呼ぶ。この builder を **branch 発見の逆関数として使うことは禁止**する（issue からの job 発見は Development リンク + checkpoint identity で行う。後続 request の契約）。

## 受け入れ基準

- [ ] 移設後、inbox・`job start --from-issue` の**既存テストが無改変で green**（移設が挙動保存であることの証拠）
- [ ] issue-target 層から cli/ への import（静的・動的とも）が存在しない（構造検査またはテストで pin する）
- [ ] positional request + `--issue <n>` の start も issue-target 経由で route されることがテストで pin される（Development リンク登録が 3 経路すべてで発火する）
- [ ] issue-linked start が Development linked branch を登録することがテストで pin される（GitHub API は mock、issueId / oid / name の契約を assert）
- [ ] **linked branch と local feature branch が同一の immutable base OID から作られる**ことがテストで pin される（base 解決が 1 回であること）
- [ ] worktree 作成失敗時に `createLinkedBranch` が呼ばれない（GitHub 側に残骸を残さない）ことがテストで pin される
- [ ] リンク登録失敗が警告つきで start を止めないことがテストで pin される
- [ ] branch 名構成が単一の共有 builder に収束し、作る側の全呼び出し点が同一関数を参照する
- [ ] `tests/unit/architecture/` が green（新 allowlist エントリを追加しない）
- [ ] `bun run typecheck` / `bun run test` green

## スコープ外

- `job resume --from-issue`・issue → job の locator 解決（後続 request: issue-target-resume-from-issue）
- checkpoint 検証の分離（別 request: checkpoint-verification-policy-split）
- cancel / archive 時の Development リンク掃除（`deleteLinkedBranch`）
- `job archive --from-issue`
- inbox の発見ロジック（label 検索・/resume gating・冪等性）の変更
- issue notifier / issue fidelity gate / `JobState.issueNumber` の変更
- `.github/workflows/` の変更
