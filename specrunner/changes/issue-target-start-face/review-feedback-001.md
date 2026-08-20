# Code Review Feedback — issue-target-start-face — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` で変更ファイル一覧を確認
- `src/core/issue-target/start.ts` — 層本体の実装・依存方向・best-effort semantics
- `src/core/runtime/workspace-materializer.ts` — new-run arm の callback 配線・順序・fallback
- `src/core/runtime/local.ts:341–383` — `setupWorkspaceNoWorktree` の no-worktree callback 実装
- `src/core/runtime/local.ts:471–568` — `setupWorkspace` の base OID 解決（D4）
- `src/adapter/github/github-client.ts:670–724` — `getIssue` nodeId 射影・`createLinkedBranch` GraphQL 実装
- `src/kernel/github-client.ts` — port 型拡張（`nodeId: string`, `createLinkedBranch`）
- `src/config/type-config.ts:90–102` — `buildFeatureBranchName` 実装・doc-comment
- `src/core/command/pipeline-run.ts`, `src/core/step/design.ts`, `src/core/step/commit-orchestrator.ts` — builder への収束確認
- `src/cli/from-issue.ts` — `runRunCore` を `startPrimitive` に注入する実装
- `src/core/inbox/run-inbox.ts:373–399` — inbox の `startJob` default effect 経由の issue-target 呼び出し
- `src/cli/command-registry.ts:626–667` — positional + `--issue` ハンドラの `startWithIssueLink` ルーティング
- `tests/unit/core/runtime/workspace-materializer-link.test.ts` — TC-008 / TC-009 / TC-010 / TC-011 / TC-013 / TC-014 / TC-019 確認
- `tests/unit/adapter/github/github-client-graphql.test.ts` — TC-016 / TC-017 / TC-018 確認
- `tests/unit/adapter/github/github-client-get-issue.test.ts` — TC-015 確認
- `src/core/job/__tests__/start-from-issue.test.ts` — TC-003 / TC-004 / TC-006 確認
- `src/cli/__tests__/from-issue.test.ts` — --from-issue 経路の assert 保存確認、mock 対象 path 更新確認
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts` — TC-007（inbox の inboxOrigin: true）確認
- `tests/unit/architecture/module-boundary.test.ts` — TC-001（`core/issue-target` の cli/ 非依存 grep）確認
- `tests/unit/core/runtime/local.test.ts` diff — TC-LR-008 の base OID assert 更新確認
- `tests/unit/no-worktree-mode.test.ts` diff — TC-NW-004〜TC-NW-017 確認
- `specrunner/changes/issue-target-start-face/verification-result.md` — typecheck / test / lint / build 全 green 確認

## 検証できなかった項目

None（全 TC を追跡した。実際のテスト実行は verification-result.md に依拠）

## Findings 詳細

### Finding 1 — HIGH: TC-005 未テスト — positional + --issue → issue-target routing が pin されていない

`src/cli/command-registry.ts:626–667` は `issue !== undefined` のとき
`startWithIssueLink` を動的 import して呼ぶ実装になっており、コードは正しい。
しかしこの routing を assert するテストがどのファイルにも存在しない。

spec.md の Scenario "positional + --issue routes through issue-target" および受け入れ基準
「positional request + `--issue <n>` の start も issue-target 経由で route されることが
**テストで pin される**」はどちらも明示的に「テストで pin」を要求している。

`from-issue.test.ts` 内の TC-005 ラベルは旧 numbering（`--from-issue` + positional 併用
エラー）であり、test-cases.md の TC-005（positional + --issue routing）とは別物である。

**修正方針**: `src/cli/__tests__/from-issue.test.ts` または新規テストファイルで
`vi.mock("../../core/issue-target/start.js", ...)` により `startWithIssueLink` を spy し、
`job start` ハンドラを `{ positional: "some/request.md", flags: { issue: 42 } }` で呼んだ
とき `startWithIssueLink` が invoke されることを assert するテストを追加する。

---

### Finding 2 — HIGH: TC-012 未テスト — no-worktree 経路の link registration が pin されていない

`src/core/runtime/local.ts:364–383` の `setupWorkspaceNoWorktree` は
`onFeatureBranchCreated` を checkout 成功後・request copy 前に best-effort 呼び出しする
実装になっており、コードは正しい。しかしこの振る舞いを assert するテストが存在しない。

未 pin の振る舞い（TC-012, must priority）:

1. `git checkout -b <branch>` 成功後に `onFeatureBranchCreated` が呼ばれること
2. `onFeatureBranchCreated` が reject しても no-worktree 起動が継続すること（警告のみ）

`tests/unit/no-worktree-mode.test.ts` の diff (+1) は `createLinkedBranch` の mock 追加
のみで、callback assert は含まない。

**修正方針**: `tests/unit/no-worktree-mode.test.ts` に以下を追加する:

```typescript
describe("TC-012: no-worktree run — onFeatureBranchCreated fires after checkout", () => {
  it("calls onFeatureBranchCreated after checkout succeeds", async () => { ... });
  it("continues when onFeatureBranchCreated rejects (warning only)", async () => { ... });
});
```

---

### Finding 3 — LOW: `local.test.ts` / `no-worktree-mode.test.ts` の `getIssue` mock に `nodeId` 未追加

**所在**:
- `tests/unit/core/runtime/local.test.ts:52` — `getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" })`
- `tests/unit/no-worktree-mode.test.ts:138` — 同様

`vi.fn().mockResolvedValue()` は `any` を返すため typecheck は通過しており、
これらのテストでは `nodeId` が実際に使われないため機能的影響はない。
ただし受け入れ基準は「port 型拡張に伴う mock リテラルへの `nodeId` フィールド追加のみ許可」
と明記しており、`pipeline-mock-client.ts` は正しく更新済みなのに対して
これら 2 ファイルは未対応のまま。

**修正方針**: 両ファイルの mock に `nodeId: "NODE_001"` を追加する。

---

## 非ブロッキング観察

- `buildFeatureBranchName` の 3 呼び出し点（pipeline-run / design / commit-orchestrator）は
  すべて正しく収束しており、インライン `${getBranchPrefix(...)}...slice(0, 8)` 構成は残存しない。
- `buildLinkedBranchRegistrar` の内部 catch と materializer の防御 `.catch()` による
  二重 best-effort 構成は spec の要求（best-effort, warning only）に合致。
- `setupWorkspace` new-run arm が `git rev-parse origin/<base>` を 1 回だけ発行し、
  その OID を `manager.create` と `onFeatureBranchCreated` 双方に渡す実装は TC-008 を
  正しく満たしており、`workspace-materializer-link.test.ts` で pin 済み。
- architecture boundary test（TC-001）は `module-boundary.test.ts` に追加されており、
  `grep -rn "cli/" src/core/issue-target` が 0 件であることを確認。
- bun run typecheck / bun run test / lint すべて green（verification-result.md 参照）。
