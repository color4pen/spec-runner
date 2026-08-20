# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル・コード

**新規実装**
- `src/core/issue-target/start.ts` — 移設後の main module: `StartPrimitive` 型, `buildLinkedBranchRegistrar`, `materializeDraftAndStart`, `startWithIssueLink`
- `src/core/runtime/workspace-materializer.ts` — `new-run` arm の `onFeatureBranchCreated` 発火ロジック (L195–L199)
- `src/core/runtime/local.ts` (L346–L570) — `setupWorkspaceNoWorktree` の TC-012 callback 実装、`setupWorkspace` の baseOid 解決 (L563–L567)

**変更された既存ファイル**
- `src/adapter/github/github-client.ts` — `getIssue` が `nodeId` を返すよう拡張 (L680)、`createLinkedBranch` GraphQL mutation 追加 (L703–L724)、`graphqlEndpoint()` ヘルパー (L689–L694)
- `src/kernel/github-client.ts` — `getIssue` の返り値型に `nodeId: string` 追加 (L270)、`createLinkedBranch` port 定義追加 (L289)
- `src/cli/run.ts` — `runRunCore` が `onFeatureBranchCreated` を受け取り `PipelineRunCommand` に渡す (L43–L107)
- `src/cli/from-issue.ts` — `materializeDraftAndStart` を `core/issue-target/start.js` から import し `runRunCore` を startPrimitive として注入 (L16–L124)
- `src/cli/command-registry.ts` — `job start <file> --issue <n>` ルートが `startWithIssueLink` へ dynamic import ルーティング (L626–L666)
- `src/core/inbox/run-inbox.ts` — `buildEffects()` の `startJob` が `materializeDraftAndStart` を呼ぶよう変更 (L396–L398)
- `src/core/command/pipeline-run.ts` — `PipelineRunOptions.onFeatureBranchCreated` フィールド追加、`workspaceOpts` に pass-through (L52, L199)
- `src/config/type-config.ts` — `buildFeatureBranchName` 関数追加 (L100–L102)
- `src/core/step/design.ts`, `src/core/step/commit-orchestrator.ts`, `src/core/command/pipeline-run.ts` — branch 名構成を `buildFeatureBranchName` に統一

**テストファイル**
- `src/core/job/__tests__/start-from-issue.test.ts` — 移設後テスト: `core/issue-target/start.js` から import, TC-003/TC-004/TC-006 をカバー
- `src/cli/__tests__/from-issue.test.ts` — TC-005/TC-011 を含む拡張版; `startWithIssueLink` mock の追加
- `tests/unit/core/runtime/workspace-materializer-link.test.ts` — TC-008〜TC-011/TC-013/TC-014/TC-019 をカバー
- `tests/unit/adapter/github/github-client-graphql.test.ts` — TC-016/TC-017/TC-018 をカバー
- `tests/unit/adapter/github/github-client-get-issue.test.ts` — TC-015 をカバー
- `tests/unit/no-worktree-mode.test.ts` — TC-012 追加分をカバー
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts` — TC-007 相当 (TC-018 label) をカバー
- `tests/unit/architecture/module-boundary.test.ts` — TC-001 追加: `core/issue-target` の cli/ import ゼロを grep で pin

### 辿った依存関係

- `runFromIssue` → `materializeDraftAndStart({startPrimitive: runRunCore})` → `buildLinkedBranchRegistrar` → onFeatureBranchCreated → `setupWorkspace` → `materializer.materialize(plan.baseOid)` → manager.create → callback(baseOid, branchName) → getIssue → createLinkedBranch ✅
- `job start <file> --issue <n>` → `startWithIssueLink({startPrimitive: runRunCore})` → 同上 ✅
- inbox `startJob` → `materializeDraftAndStart({startPrimitive: runRunCore})` → 同上 ✅

### AC 照合結果

| AC | 判定 |
|----|------|
| inbox 既存テスト挙動 assert 無改変 | ✅ `nodeId` + `createLinkedBranch` stub 追加のみ、挙動行無改変 |
| from-issue / start-from-issue テスト assert 保存 | ✅ mock path 変更のみ、呼び出し引数・エラー伝播 assert 保存 |
| issue-target → cli/ import ゼロ | ✅ `start.ts` に cli/ import なし。TC-001 で grep pin |
| positional + `--issue` が issue-target 経由 | ✅ command-registry.ts L656。TC-005 で pin |
| Development リンク登録 pin（API mock・契約 assert） | △ **F-001 参照** |
| 同一 immutable base OID | ✅ TC-008 で `manager.create` と callback の両方が `plan.baseOid` を受け取ることを assert |
| worktree 失敗時 callback 未呼び出し | ✅ TC-009 |
| 登録失敗が警告のみ | ✅ TC-010 + try/catch in `buildLinkedBranchRegistrar` + materializer defensive `.catch()` |
| branch 名 builder 単一定義 | ✅ `buildFeatureBranchName` in `type-config.ts`。3 箇所すべて確認 |
| architecture test green（allowlist 追加なし） | ✅ TC-001 追加のみ。`arch-allowlist.ts` 変更なし |
| typecheck / test green | ✅ verification-result.md 確認 |

## 検証できなかった項目

None（全 AC を静的解析とコード読み取りで確認済み）

## Findings 詳細

### F-001: 「3 経路すべてで Development リンク登録が発火する」が per-route でテスト pin されていない

**対象 AC**: 「Development リンク登録が 3 経路すべてで発火する」「GitHub API は mock、issueId / oid / name の契約を assert」

**根拠**:

spec.md の scenario "each route fires the link registration" は：

> **Given** a successful worktree creation for an issue-linked start on **any of the three routes**  
> **Then** `createLinkedBranch(issueId, branchName, baseOid)` is invoked (GitHub API mocked)

現状の各経路テスト:

| 経路 | テストが mock するレイヤー | createLinkedBranch が assert されるか |
|------|--------------------------|--------------------------------------|
| `--from-issue` | `materializeDraftAndStart` をまるごと mock | ❌ |
| positional + `--issue` | `startWithIssueLink` をまるごと mock | ❌ |
| inbox | `runRunCore`（startPrimitive）を mock | ❌（callback は渡されるが呼ばれない） |

`buildLinkedBranchRegistrar` の単体テスト（TC-006）は `createLinkedBranch` の契約（nodeId, branchName, oid）を assert しているが、どの経路テストとも「経路 → callback 発火 → createLinkedBranch 呼び出し」を繋いでいない。

実装は正しく（全経路で `buildLinkedBranchRegistrar` が作られ callback が渡される）、今後 `materializeDraftAndStart` や `startWithIssueLink` から callback 構築が削除された場合に既存テストが検出できないリスクがある。

**最小修正案**:  
`from-issue.test.ts` TC-011 に、`materializeDraftAndStart` の呼び出し引数内に `onFeatureBranchCreated` が含まれることを assert を追加する。同様に TC-005 で `startWithIssueLink` の引数の `onFeatureBranchCreated` を assert する。inbox テストは `runRunCore` の第2引数に `onFeatureBranchCreated` が渡されることを assert する（現行 TC-018 は `inboxOrigin` のみ assert）。これで「3 経路で callback が渡されること」が pin され、TC-006 の callback 単体テストと合わせて構成的にカバーが成立する。
