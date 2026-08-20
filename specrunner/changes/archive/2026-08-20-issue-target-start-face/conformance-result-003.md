# Conformance Result — Iteration 3

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### request.md 受け入れ基準

| 基準 | 確認方法 | 結果 |
|------|----------|------|
| inbox 既存テスト 挙動 assert 無改変で green | `run-inbox-inbox-origin.test.ts` 全文確認 | ✓ |
| `from-issue.test.ts` / `start-from-issue.test.ts` assert 内容保存・mock/import path 更新のみ | 両ファイル全文確認 | ✓ |
| issue-target 層から cli/ への import なし | `start.ts` 全インポート確認 + `module-boundary.test.ts` TC-001 | ✓ |
| positional + `--issue` が issue-target 経由でテスト pin | `from-issue.test.ts` TC-005、`command-registry.ts:626-666` | ✓ |
| Development linked branch 登録がテスト pin（issueId / oid / name の契約） | `start-from-issue.test.ts` TC-006、`github-client-graphql.test.ts` TC-016 | ✓ |
| linked branch と local branch が同一 immutable base OID | `workspace-materializer-link.test.ts` TC-008 | ✓ |
| worktree 失敗時 createLinkedBranch 呼ばれない | TC-009 | ✓ |
| リンク登録失敗が警告つきで start を止めない | TC-010、TC-006（swallow テスト） | ✓ |
| branch 名構成が単一 builder に収束 | `type-config.ts`、TC-013 grep | ✓ |
| `tests/unit/architecture/` green（allowlist 無変更） | `arch-allowlist.ts` 全文確認・新 entry なし | ✓ |
| `bun run typecheck` / `bun run test` green | `verification-result.md`（passed） | ✓ |

### spec.md 全 Requirement

**R-1: issue-target layer must not depend on cli layer**
- `src/core/issue-target/start.ts` の import: `inbox/draft-writer.js`、`logger/stdout.js`、`kernel/github-client.js` — cli/ なし ✓
- `module-boundary.test.ts` TC-001: `grep -rn "cli/" src/core/issue-target` が 0 件をテストで pin ✓
- start primitive は `StartPrimitive` 型として注入されており、cli を import しない設計 ✓

**R-2: relocation preserves the issue-body start contract**
- `start.ts:80-85`: `writeDraft` → `startPrimitive(draftPath, { inboxOrigin: true, issue: issueNumber, onFeatureBranchCreated })` ✓
- `startPrimitive` を try/catch で囲んでいないため SlugOccupiedError がそのまま伝播する ✓
- `start-from-issue.test.ts` TC-003（writeDraft→start 順序、inboxOrigin、issueNumber）✓
- `start-from-issue.test.ts` TC-004（SlugOccupiedError 伝播）✓

**R-3: all issue-linked start routes through issue-target and register Development linked branch**
- `--from-issue`（`from-issue.ts`）: `materializeDraftAndStart` を `core/issue-target/start.js` から呼び、`runRunCore` を注入 ✓
- inbox（`run-inbox.ts:396-398`）: `const { runRunCore } = await import("../../cli/run.js")` → `materializeDraftAndStart` へ注入 ✓
- positional + `--issue`（`command-registry.ts:626-666`）: `startWithIssueLink` を issue-target から呼び、`runRunCore` を注入 ✓
- `onFeatureBranchCreated` が 3 経路すべてで注入: TC-011（--from-issue）、TC-018（inbox）、TC-005（positional）が pin ✓
- pipeline / start 本体が `issueNumber` で Development API を叩かない: callback を不透明 effect として注入 ✓

**R-4: linked branch and local feature branch use the same immutable base OID**
- `local.ts:567-571`: `git rev-parse remoteBaseRef` を 1 回実行し `baseOid` に格納、plan に載せる ✓
- `workspace-materializer.ts:165`: `const baseRef = plan.baseOid ?? plan.remoteBaseRef` として `manager.create` に渡す ✓
- `workspace-materializer.ts:196`: 同 `plan.baseOid` を `onFeatureBranchCreated` の第 1 引数に渡す ✓
- TC-008: `manager.create` の第 4 引数と callback の第 1 引数が同一 OID であることを assert ✓

**R-5: link registration ordered after worktree creation and is best-effort**
- `workspace-materializer.ts` new-run arm の順序: `manager.create` → `onFeatureBranchCreated` → request copy/commit ✓
- TC-009（worktree 失敗 → callback なし）✓
- TC-010（callback reject → materialize 継続）✓
- TC-011（callback が git-commit より前に発火）✓
- no-worktree（`setupWorkspaceNoWorktree`）: `git rev-parse HEAD`（checkout 前）→ `git checkout -b` → `onFeatureBranchCreated`（best-effort）→ request copy/commit ✓
- no-worktree TC-012: callback 呼ばれること・rejection が警告のみ・コミットより前に発火することを pin ✓

**R-6: branch name constructed by single shared builder**
- `type-config.ts:100-102`: `buildFeatureBranchName(type, slug, jobId)` を `getBranchPrefix` の隣に定義 ✓
- doc-comment に "Do NOT use it as an inverse function for branch discovery" 明記 ✓
- `pipeline-run.ts`、`design.ts`、`commit-orchestrator.ts` の 3 箇所が `buildFeatureBranchName` を参照 ✓
- TC-013: 3 ファイルが `buildFeatureBranchName` を含むことを grep で pin ✓
- TC-014: `onFeatureBranchCreated` が受け取る名前 = `manager.create` に渡す名前がバイト同一であることを assert ✓

**R-7: getIssue exposes nodeId, createLinkedBranch available**
- `adapter/github/github-client.ts:681`: REST `node_id` → `nodeId` にマッピング ✓
- `createLinkedBranch(issueId, name, oid)` 実装済み ✓
- GraphQL エンドポイント導出: `/api/v3` → `/api/graphql`、それ以外は `+ "/graphql"` ✓
- 非 2xx / GraphQL errors で throw（fail-closed）✓
- TC-015（nodeId 射影）、TC-016（GraphQL mutation の POST）、TC-017（fail-closed）、TC-018（エンドポイント導出）pin 済み ✓

## 前回 iteration 2 finding F-1 の再判定

前回 conformance-result-002.md の F-1 は `run-inbox-inbox-origin.test.ts` に追加された `expect(typeof options["onFeatureBranchCreated"]).toBe("function")` を「許可外の新規 assert」として escalation した。

**本 iteration の判定**: 許可の範囲内。

request.md 受け入れ基準は許可される追加を 2 種に限定しているが、(b) を「リンク登録が 3 経路すべてで発火する」要求を **inbox 経路で pin するための追加 assert（`onFeatureBranchCreated` の注入確認）**と明示している。当該 assert は文字通り inbox 経路での `onFeatureBranchCreated` 注入確認であり、(b) に合致する。既存の挙動 assert（`mockRunRunCore.toHaveBeenCalled()`、`options.inboxOrigin === true`）は変更なく green のまま。

この assert を追加しなければ「Development リンク登録が 3 経路すべてで発火する」という受け入れ基準を inbox 経路で pin する手段が他にない点からも、実装の判断は合理的であり request の intent と一致する。

## 検証できなかった項目

`bun run typecheck` / `bun run test` の直接実行: サンドボックス制約により実行不可。直前 step の `verification-result.md` に passed 記録（build ✓、typecheck ✓、test ✓、lint ✓）があることを参照した。

## Findings 詳細

None
