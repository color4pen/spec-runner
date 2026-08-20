# Conformance Result — Iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### request.md 受け入れ基準

| 基準 | 確認方法 | 結果 |
|------|----------|------|
| inbox 既存テスト 挙動 assert 無改変で green | `run-inbox-inbox-origin.test.ts` diff 確認 | ⚠️ 後述 |
| `from-issue.test.ts` / `start-from-issue.test.ts` assert 内容保存・mock/import path 更新のみ | ファイル全読み + diff 確認 | ✓ |
| issue-target 層から cli/ への import なし（構造検査で pin） | `module-boundary.test.ts` TC-001、`start.ts` ソース確認 | ✓ |
| positional + `--issue` が issue-target 経由でテスト pin | `from-issue.test.ts` TC-005 確認 | ✓ |
| Development linked branch 登録がテスト pin（issueId / oid / name の契約） | `start-from-issue.test.ts` TC-006、`github-client-graphql.test.ts` TC-016 確認 | ✓ |
| linked branch と local branch が同一 immutable base OID | `workspace-materializer-link.test.ts` TC-008 確認 | ✓ |
| worktree 失敗時 createLinkedBranch 呼ばれない | TC-009 確認 | ✓ |
| リンク登録失敗が警告つきで start を止めない | TC-010、TC-006（swallow テスト）確認 | ✓ |
| branch 名構成が単一 builder に収束 | `type-config.ts`、3 箇所の diff、TC-013 確認 | ✓ |
| `tests/unit/architecture/` green（allowlist 無変更） | `arch-allowlist.ts` 全文確認・新 entry なし | ✓ |
| `bun run typecheck` / `bun run test` green | `verification-result.md` 参照（前 step で確認済） | ✓ |

### spec.md 全 Requirement

**R-1: issue-target layer must not depend on cli layer**
- `src/core/issue-target/start.ts` のインポートを全読み: `inbox/draft-writer.js`、`logger/stdout.js`、`kernel/github-client.js` — cli/ インポートなし ✓
- `module-boundary.test.ts` TC-001 が `grep -rn "cli/" src/core/issue-target` をテストで pin ✓
- Scenario "start primitive is injected, not imported" — `start.ts` の `StartPrimitive` type と `startPrimitive` 注入パラメータで充足 ✓

**R-2: relocation preserves the issue-body start contract**
- `start-from-issue.test.ts` TC-003: writeDraft→startPrimitive 順序、`inboxOrigin: true`、issue 番号を assert ✓
- TC-004: SlugOccupiedError 伝播を assert ✓
- `materializeDraftAndStart` の実装確認: `await writeDraft(...)` → `startPrimitive(draftPath, { inboxOrigin: true, issue: issueNumber, onFeatureBranchCreated })` ✓

**R-3: all issue-linked start routes through issue-target and register Development linked branch**
- `--from-issue` 経路: `from-issue.ts` が `materializeDraftAndStart` を `core/issue-target/start.js` から呼び、`runRunCore` を注入。TC-011 が pin ✓
- inbox 経路: `run-inbox.ts` が `runRunCore` を動的 import し `materializeDraftAndStart` へ注入。TC-018 が pin ✓
- positional + `--issue` 経路: `command-registry.ts` が `startWithIssueLink` を呼ぶ。TC-005 が pin ✓
- `onFeatureBranchCreated` が全 3 経路で注入されることを TC-011（`--from-issue`）・TC-018（inbox）・TC-005（positional）でそれぞれ assert ✓
- pipeline / start 本体が `issueNumber` で Development API を叩かない: callback を不透明 effect として注入する設計で保存 ✓

**R-4: linked branch and local feature branch use the same immutable base OID**
- `local.ts setupWorkspace` new-run arm: `git rev-parse origin/<baseBranch>` を 1 回実行し `plan.baseOid` に格納 ✓
- `workspace-materializer.ts` new-run arm: `const baseRef = plan.baseOid ?? plan.remoteBaseRef` を `manager.create` に渡し、同じ `plan.baseOid` を callback に渡す ✓
- TC-008: manager.create と callback が同一 OID を受け取ることを assert ✓

**R-5: link registration ordered after worktree creation, best-effort**
- `workspace-materializer.ts` new-run arm のコード順序: `manager.create` → `onFeatureBranchCreated` → request copy/commit ✓
- TC-009: worktree 失敗時に callback 呼ばれない ✓
- TC-010: callback reject 時に materialize が継続 ✓
- TC-011: callback が git-commit より前に発火 ✓
- no-worktree 経路 (`setupWorkspaceNoWorktree`): checkout 成功後に callback 発火、TC-012 で pin ✓

**R-6: branch name constructed by single shared builder**
- `buildFeatureBranchName` を `src/config/type-config.ts` の `getBranchPrefix` 隣に追加 ✓
- doc-comment に「逆引き禁止」明記 ✓
- `pipeline-run.ts`、`design.ts`、`commit-orchestrator.ts` の 3 箇所すべてが `buildFeatureBranchName` を呼ぶ（diff 確認）✓
- TC-013 が 3 ファイルのソースを grep で検査 ✓
- TC-019 がプレフィックス正確性（bug-fix → fix/）を assert ✓

**R-7: getIssue exposes nodeId, createLinkedBranch available**
- `github-client.ts`（port）: `getIssue()` の返り値型に `nodeId: string` 追加 ✓、`createLinkedBranch` を追加 ✓
- `adapter/github/github-client.ts`: REST `node_id` を `nodeId` にマッピング ✓、GraphQL POST 実装 ✓
- GraphQL エンドポイント導出: `/api/v3` → `/api/graphql`、それ以外は `+ "/graphql"` ✓
- TC-015: nodeId 射影を assert ✓
- TC-016: createLinkedBranch が正しい mutation を POST ✓
- TC-017: non-2xx / GraphQL errors で throw（fail-closed）✓
- TC-018 (graphql): github.com / GHES のエンドポイント導出 ✓

## 検証できなかった項目

**`bun run typecheck` / `bun run test` の直接実行**: 実行環境のサンドボックス制約により実行不可。直前 step（regression-gate）の `verification-result.md` および前回 conformance-result-001.md に green 記録あり。

## Findings 詳細

### F-1（Medium）: `run-inbox-inbox-origin.test.ts` に許可範囲外の新規 assert が追加されている

**対象ファイル**: `tests/unit/inbox/run-inbox-inbox-origin.test.ts`

**内容**: request.md の受け入れ基準は「inbox の既存テストは挙動 assert 無改変で green、port 型拡張に伴う mock リテラルへの `nodeId` フィールド追加のみ許可する」と規定している。

実際の diff には許可された変更に加えて:

1. `createLinkedBranch: vi.fn().mockResolvedValue(undefined)` の mock 追加 — port 型拡張（`GitHubClient` に `createLinkedBranch` が追加）によって型上必須になるため、`nodeId` 追加と同様の型強制変更として許容範囲と判断できる
2. `expect(typeof options["onFeatureBranchCreated"]).toBe("function")` の assert 追加 — **これは許可外の新規 assert**

**背景**: 別の受け入れ基準「Development リンク登録が 3 経路すべてで発火する」を inbox 経路で pin するには、この inbox テストに assert を追加する以外に natural な place がない。implementation は 3-route coverage という機能的要件を優先してこの追加を行っている。

**original 挙動 assert**（`expect(mockRunRunCore).toHaveBeenCalled()` および `expect(options).toHaveProperty("inboxOrigin", true)`）は変更なく green であり、挙動保存の証拠としての目的は果たされている。

**判断の余地**: 2 つの受け入れ基準の競合の中でどちらを優先するかは設計判断。実装は 3-route coverage を選んでいる。
