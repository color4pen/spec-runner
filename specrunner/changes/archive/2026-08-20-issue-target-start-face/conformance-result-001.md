# Conformance Result — issue-target-start-face (iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### request.md 受け入れ基準（11 項目）

1. **inbox の既存テストが挙動 assert 無改変で green** — `run-inbox-inbox-origin.test.ts` の変更は `getIssue` mock への `nodeId: "NODE_001"` 追加と `createLinkedBranch: vi.fn()` 追加のみ。`inboxOrigin: true` / `onFeatureBranchCreated` の assert は無改変。✅

2. **from-issue.test.ts / start-from-issue.test.ts の assert 内容保存** — mock 対象が `core/job/start-from-issue.js` → `core/issue-target/start.js` へ更新のみ。呼び出し引数・書き込み順序・エラー伝播の assert はすべて保存。✅

3. **issue-target 層から cli/ への import が存在しない** — `src/core/issue-target/start.ts` を確認: `cli/` 文字列は 0 件。`module-boundary.test.ts` の TC-001 が grep 0 件を機械 pin。✅

4. **positional + --issue の start が issue-target 経由** — `command-registry.ts` は `issue !== undefined` のとき `startWithIssueLink` を動的 import して呼ぶ。`from-issue.test.ts` TC-005 が pin。✅

5. **issue-linked start が Development linked branch を登録する** — `buildLinkedBranchRegistrar` が `onFeatureBranchCreated` を構築し、3 経路すべてで `startPrimitive` options に載せる。`start-from-issue.test.ts` TC-006 / `github-client-graphql.test.ts` TC-016 / `from-issue.test.ts` TC-011 が pin。✅

6. **同一の immutable base OID** — `local.ts` が new-run arm で `git rev-parse remoteBaseRef` を 1 回だけ実行、`plan.baseOid` に保存。`workspace-materializer.ts` が同一 `baseOid` を `manager.create` と `onFeatureBranchCreated` の双方へ渡す。TC-008a/b/c が pin。✅

7. **worktree 作成失敗時に createLinkedBranch が呼ばれない** — `workspace-materializer.ts` の `new-run` arm では `manager.create` 成功後にのみ callback を呼ぶ。TC-009 が pin。✅

8. **リンク登録失敗が警告つきで start を止めない** — "start を止めない" は TC-010 / no-worktree TC-012 が pin。"警告 assertion" は欠如（→ F-001）。⚠️ PARTIAL

9. **branch 名 builder に収束** — `buildFeatureBranchName` が `type-config.ts` に定義。`pipeline-run.ts`・`design.ts`・`commit-orchestrator.ts` の全 3 箇所が呼ぶ。インライン構成は 0 件。TC-013 grep / TC-019 が pin。✅

10. **tests/unit/architecture/ green、新 allowlist エントリなし** — `arch-allowlist.ts` に変更なし（確認済）。TC-021 gate。✅

11. **bun run typecheck / bun run test green** — `verification-result.md` が green を記録。✅

### spec.md Requirements / Scenarios（7 Requirements / 15 Scenarios）

| Requirement | Scenario | 状態 |
|---|---|---|
| cli 非依存 | no cli import exists | ✅ TC-001 |
| cli 非依存 | start primitive is injected | ✅ TC-003 構造 |
| 挙動保存 | writeDraft precedes start | ✅ TC-003 |
| 挙動保存 | occupancy error propagates | ✅ TC-004 |
| 3 経路 route | positional + --issue routes | ✅ TC-005 |
| 3 経路 route | each route fires link registration | ✅ TC-006/TC-011/TC-018 |
| 3 経路 route | inbox-origin passes inboxOrigin | ✅ TC-018 (inbox) |
| 同一 base OID | base OID resolved once and shared | ✅ TC-008 |
| 順序 / best-effort | worktree failure skips link | ✅ TC-009 |
| 順序 / best-effort | registration failure does not stop start | ⚠️ PARTIAL (F-001: warning not pinned) |
| 順序 / best-effort | registration precedes bootstrap commit | ✅ TC-011 |
| 順序 / best-effort | no-worktree route fires link registration | ⚠️ PARTIAL (F-001: warning not pinned) |
| builder 単一 | construction sites converge | ✅ TC-013 |
| builder 単一 | linked branch name equals local branch name | ✅ TC-014 |
| port 拡張 | getIssue returns nodeId | ✅ TC-015 |
| port 拡張 | createLinkedBranch posts GraphQL mutation | ✅ TC-016 |
| port 拡張 | createLinkedBranch fails closed | ✅ TC-017 |
| port 拡張 | GraphQL endpoint derived correctly | ✅ TC-018 (graphql) |

## 検証できなかった項目

None — 全項目を実装コードとテストの両面から確認した。

## Findings 詳細

### F-001: 警告 assertion がリンク登録失敗テストに欠如

**対象 Scenario**: "registration failure does not stop start" および "no-worktree route fires link registration after branch creation"（spec.md > Requirement: link registration is ordered after worktree creation and is best-effort）

**対象 Acceptance Criterion**: "リンク登録失敗が警告つきで start を止めないことがテストで pin される"

**状況**: 実装は正しい。`buildLinkedBranchRegistrar` の catch ブロック（`start.ts:66-70`）と `workspace-materializer.ts:197-199` の defensive backstop、`local.ts:383-387` の no-worktree catch がいずれも `stderrWrite(...)` で警告を出力する。しかしテストは "start を止めない" のみを検証し、"警告が出力される" を assert していない。

- `start-from-issue.test.ts` TC-006: `stderrWrite` は `vi.mock("../../logger/stdout.js")` でモック済だが、`expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(...)` が無い。
- `workspace-materializer-link.test.ts` TC-010: `stderrWrite` がモックされておらず、警告 assert が構造的に不可能。
- `no-worktree-mode.test.ts` TC-012 "rejection is warning-only": 警告 assert が無い。

**修正**: TC-006 で `expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(expect.stringContaining("Warning"))` を追加する（callback レベル警告）。no-worktree TC-012 "rejection is warning-only" にも同様の assert を追加する。TC-010 は callback 自体が警告を握りつぶす設計のため TC-006 側の assert で十分。
