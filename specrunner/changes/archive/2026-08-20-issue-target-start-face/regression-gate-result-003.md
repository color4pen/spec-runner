# Regression Gate Result — Iteration 3

## Summary

16 findings checked. 15 fixed. 1 regression still present (F-16, LOW).

## Findings Status

### F-01 [LOW] no-worktree 経路の Development リンク登録 Scenario が spec.md に存在しない
**Status: FIXED**
`spec.md` の Requirement "link registration is ordered after worktree creation and is best-effort" に Scenario `no-worktree route fires link registration after branch creation`（lines 114–120）が追加されている。

### F-02 [LOW] GraphQL endpoint 導出ロジックに対応する spec Scenario がない
**Status: FIXED**
Requirement "getIssue exposes the GraphQL node id and createLinkedBranch is available" に Scenario `GraphQL endpoint is derived correctly for github.com and GHES`（lines 170–175）が追加されている。

### F-03 [MEDIUM] T-01 AC の期待値が型定義と矛盾: feat/ ではなく fix/
**Status: FIXED**
`tasks.md` T-01 AC line 15 は `fix/my-slug-abcdef01`（bug-fix の branchPrefix は `"fix/"` であり `"feat/"` ではない）と正しく記述されている。

### F-04 [LOW] T-05 AC が test-cases.md に存在しない TC-018 を参照している
**Status: FIXED**
`tasks.md` T-05 AC（lines 73–78）に `（TC-018）` の括弧書きは存在しない。ファイルパス参照（`tests/unit/inbox/run-inbox-inbox-origin.test.ts`）のみになっている。T-05 本文 line 67 に残る `TC-018 を無改変 green にするため` はタスク説明（AC でない）であり finding の対象外。

### F-05 [LOW] design.md の "TC-018" 参照が test-cases.md の TC-018 と名前衝突
**Status: FIXED**
`grep "TC-018" design.md` → 0 件。D2 と Context セクションは `run-inbox-inbox-origin.test.ts` をファイルパスのみで参照している。

### F-06 [HIGH] TC-005 未テスト: positional + --issue → issue-target routing が pin されていない
**Status: FIXED**
`from-issue.test.ts`（lines 526–562）に 2 本の TC-005 テストが存在する:
- `startWithIssueLink is called with correct issueNumber and requestMdPath`（line 526）
- `runRunCore (startPrimitive) receives onFeatureBranchCreated via positional+--issue route`（line 542）

`startWithIssueLink` の mock → real 切り替えで `runRunCore` が `onFeatureBranchCreated` を含む options で呼ばれることを assert している。

### F-07 [HIGH] TC-012 未テスト: no-worktree 経路の onFeatureBranchCreated 呼び出しが pin されていない
**Status: FIXED**
`no-worktree-mode.test.ts` lines 764–876 に `describe("TC-012: ...")` ブロックが追加されている。3 本のテストが:
1. checkout 成功後に正しい OID と branchName で callback が呼ばれること（line 782）
2. callback の reject が警告のみで setupWorkspace が継続すること（line 804）
3. rev-parse HEAD 失敗時に callback がスキップされ警告が出ること（line 834）

をそれぞれ assert している。

### F-08 [LOW] getIssue mock に nodeId フィールドが未追加
**Status: FIXED**
- `tests/unit/core/runtime/local.test.ts`（line 52）: `getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "", nodeId: "NODE_001" })`
- `tests/unit/no-worktree-mode.test.ts`（line 139）: 同様に `nodeId: "NODE_001"` が追加されている。

### F-09 [HIGH] 「3 経路すべてで Development リンク登録が発火する」が per-route でテスト pin されていない
**Status: FIXED**
3 経路それぞれで `onFeatureBranchCreated` が `runRunCore` に渡ることが pin されている:
- `--from-issue`：`from-issue.test.ts` TC-011（line 385）`typeof opts["onFeatureBranchCreated"] === "function"` を assert
- positional + `--issue`：`from-issue.test.ts` TC-005（line 542）同上
- inbox：`run-inbox-inbox-origin.test.ts`（line 109–110）`typeof options["onFeatureBranchCreated"] === "function"` を assert

### F-10 [LOW] TC-013: buildFeatureBranchName の3呼び出し箇所が grep-pin されていない
**Status: FIXED**
`workspace-materializer-link.test.ts`（lines 224–234）に `TC-013: pipeline-run.ts / design.ts / commit-orchestrator.ts all call buildFeatureBranchName` テストが追加されている。3 ファイルの実テキストを `fs.readFileSync` で読んで `buildFeatureBranchName` を含むことを assert している。

### F-11 [LOW] no-worktree path で git rev-parse HEAD 失敗時の callback スキップが無警告
**Status: FIXED**
`local.ts`（line 372）: `exitCode !== 0` のとき `stderrWrite("Warning: could not resolve HEAD OID for linked branch registration ...")` を出力する実装が追加されている。`no-worktree-mode.test.ts`（line 834–875）のテストが `stderrCalls.some((m) => m.includes("could not resolve HEAD OID"))` を assert している。

### F-12 [MEDIUM] TC-006: 警告 assertion 未 pin — buildLinkedBranchRegistrar 失敗時の stderrWrite 呼び出しが assert されていない
**Status: FIXED**
`start-from-issue.test.ts`（line 175）: `expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(expect.stringContaining("Warning"))` が追加されており、`createLinkedBranch` throw 時に警告が出力されることが pin されている。

### F-13 [MEDIUM] TC-012: no-worktree rejection 警告 assertion 未 pin
**Status: FIXED**
`no-worktree-mode.test.ts`（lines 829–831）: `stderrCalls.some((m) => m.includes("Warning"))` を assert。`onFeatureBranchCreated` が reject したとき stderr に Warning が書かれることが pin されている。

### F-14 [MEDIUM] TC-011 ordering test は vacuously true — requestFilePath なしでは git-add/git-commit が到達しない
**Status: FIXED**
`workspace-materializer-link.test.ts`（lines 171–211）: `requestFilePath: tmpRequestFile` を渡している（line 202）。実際の一時ファイルを書いて渡しているため git-add / git-commit のスパイが発火し、`order.indexOf("callback") < order.indexOf("git-commit")` の assert が vacuously true でなくなっている。テスト内で `expect(order).toContain("callback")` と `expect(order).toContain("git-commit")` の両方を確認しており（lines 206–207）、両者が実際に firing していることも確認している。

### F-15 [LOW] no-worktree 経路: git rev-parse HEAD 失敗時に警告なしで callback が黙って skip される
**Status: FIXED**（F-11 と同一事象）
F-11 と同じ修正で解消。

### F-16 [LOW] no-worktree 経路の callback-before-materialisation 順序が pin されていない
**Status: STILL PRESENT (REGRESSION)**

`tests/unit/no-worktree-mode.test.ts` の TC-012 ブロック（lines 764–876）は 3 本のテストを追加したが、いずれも `requestFilePath` を渡していない（`setupWorkspace` 呼び出し lines 793–798, 816–822, 859–865 を確認）。

`requestFilePath` が渡されない場合、`local.ts` の `setupWorkspaceNoWorktree` は git-add / git-commit に到達しない（line 409: `if (isRunPath && opts?.requestFilePath)`）。そのため「`onFeatureBranchCreated` は checkout 後・request materialisation より前に呼ばれる」という順序不変条件のテストは vacuously true のまま。

実装は正しい順序（callback at lines 383–387、git-commit at line 438+）で書かれているが、将来のリファクタリングでコールバックが materialisation 後に移動しても本テストでは検出できない。

spec.md の Scenario `no-worktree route fires link registration after branch creation` は「before request materialisation」を要求しており、worktree path の TC-011（`workspace-materializer-link.test.ts` lines 171–211）が同等の pin を提供しているが、no-worktree path に対応テストがない。

## Evidence

- Checked: 16 findings
- Fixed: 15
- Still present: 1 (F-16, LOW)
