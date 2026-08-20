# Regression Gate Result — Iteration 1

## Verification Summary

13 findings checked against current code. 9 are fixed; 4 remain present.

---

## Fixed Findings (no longer present)

| # | Severity | Finding |
|---|----------|---------|
| 1 | LOW | no-worktree 経路の Development リンク登録 Scenario が spec.md に存在しない → `Scenario: no-worktree route fires link registration after branch creation` が spec.md に追加済 |
| 2 | LOW | GraphQL endpoint 導出ロジックに対応する spec Scenario がない → `Scenario: GraphQL endpoint is derived correctly for github.com and GHES` が spec.md に追加済 |
| 3 | MEDIUM | T-01 AC の期待値が型定義と矛盾: feat/ ではなく fix/ → tasks.md T-01 AC が `fix/my-slug-abcdef01`（bug-fix の branchPrefix は "fix/"）と明示されており矛盾は解消 |
| 4 | LOW | T-05 AC が test-cases.md に存在しない TC-018 を参照している → tasks.md T-05 AC の `（TC-018）` 参照が削除され、ファイルパス参照のみになっている |
| 5 | LOW | design.md の "TC-018" 参照が test-cases.md の TC-018 と名前衝突 → design.md に "TC-018" 文字列は存在しない（grep 0件確認済） |
| 6 | HIGH | TC-005 未テスト: positional + --issue → issue-target routing が pin されていない → `from-issue.test.ts` に `describe("TC-005: positional + --issue → startWithIssueLink に route される")` が追加され、`startWithIssueLink` 呼び出し・引数・`onFeatureBranchCreated` 注入を assert |
| 7 | HIGH | TC-012 未テスト: no-worktree 経路の onFeatureBranchCreated 呼び出しが pin されていない → `no-worktree-mode.test.ts` に `describe("TC-012: setupWorkspace no-worktree — onFeatureBranchCreated callback")` が追加され、callback 呼び出しと best-effort（reject しても継続）を assert |
| 8 | LOW | getIssue mock に nodeId フィールドが未追加 → `local.test.ts:52` と `no-worktree-mode.test.ts:139` のいずれも `nodeId: "NODE_001"` が追加済 |
| 9 | HIGH | 「3 経路すべてで Development リンク登録が発火する」が per-route でテスト pin されていない → 3 経路すべてで `onFeatureBranchCreated` が `runRunCore` に渡ることを assert: TC-011（--from-issue, from-issue.test.ts:385–396）、TC-005（positional+--issue, from-issue.test.ts:542–562）、TC-018（inbox, run-inbox-inbox-origin.test.ts:109–110） |

---

## Still Present Findings

### [LOW] TC-013: buildFeatureBranchName の3呼び出し箇所が grep-pin されていない
- **File**: `tests/unit/core/runtime/workspace-materializer-link.test.ts`
- **Evidence**: TC-013 describe block は `buildFeatureBranchName("new-feature", ...)` の戻り値フォーマットのみを検証する。`pipeline-run.ts` / `design.ts` / `commit-orchestrator.ts` の 3 箇所が実際に `buildFeatureBranchName` を呼んでいることを grep または import-assertion でピンするテストが存在しない。テストヘッダーに "grep assertion" と記載されているが、実際の grep コールは実装されていない。

### [MEDIUM] TC-011 ordering test は vacuously true
- **File**: `tests/unit/core/runtime/workspace-materializer-link.test.ts:183`
- **Evidence**: TC-011 テストは `materializer.materialize(...)` に `requestFilePath` を渡していないため、`if (opts?.requestFilePath)` ブロック内の git-add / git-commit に到達しない。`addIdx` と `commitIdx` は常に -1 となり、`if (addIdx !== -1)` / `if (commitIdx !== -1)` ガードにより ordering assertion が一度も実行されない。callback が bootstrap commit の後に移動しても本テストはパスし続ける。実装は正しい（workspace-materializer.ts:195–199 の callback が :203 の `if (opts?.requestFilePath)` ブロックより前）が、spec の「registration precedes bootstrap commit」不変条件が pinned されていない。

### [LOW] no-worktree path で git rev-parse HEAD 失敗時の callback スキップが無警告 (Finding 11)
- **File**: `src/core/runtime/local.ts`
- **Evidence**: `setupWorkspaceNoWorktree` の run path（local.ts:367–369）で `git rev-parse HEAD` が exitCode !== 0 を返すと `headOidForCallback` が undefined のまま残り、後続の `if (headOidForCallback && opts?.onFeatureBranchCreated)` が false となって callback が呼ばれない。この場合 `stderrWrite` による警告も出ない。`createLinkedBranch` 失敗時の警告（local.ts:380–382）は実装済だが、OID 解決失敗によるサイレントスキップは未対処。

### [LOW] no-worktree 経路: git rev-parse HEAD 失敗時に警告なしで callback が黙って skip される (Finding 13)
- **File**: `src/core/runtime/local.ts:367`
- **Evidence**: Finding 11 と同一の実装ギャップ（重複エントリ）。`no-worktree-mode.test.ts` にも rev-parse 失敗ケースの pin がない。`buildSpawnFnForCallback` は rev-parse 成功のみをスタブしており、失敗時の警告出力を assert するテストが存在しない。

---

## Evidence

- **checked**: 13
- **skipped**: 0
- **unverified**: 0
