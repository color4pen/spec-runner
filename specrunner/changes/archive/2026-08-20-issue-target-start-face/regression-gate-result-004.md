# Regression Gate Result — iteration 004

## Verification method

`git diff main...HEAD --name-only` + targeted file reads for each finding location.

---

## Findings from ledger — verification status

### [LOW] no-worktree 経路の Development リンク登録 Scenario が spec.md に存在しない
**Status: FIXED**
`spec.md` lines 114–121 に `Scenario: no-worktree route fires link registration after branch creation` が追加されている。

### [LOW] GraphQL endpoint 導出ロジックに対応する spec Scenario がない
**Status: FIXED**
`spec.md` lines 170–175 に `Scenario: GraphQL endpoint is derived correctly for github.com and GHES` が追加されている。

### [MEDIUM] T-01 AC の期待値が型定義と矛盾: feat/ ではなく fix/
**Status: FIXED**
`tasks.md` T-01 AC は `fix/my-slug-abcdef01（bug-fix の branchPrefix は "fix/" であり "feat/" ではない）` と正しく記載されている。

### [LOW] T-05 AC が test-cases.md に存在しない TC-018 を参照している
**Status: FIXED**
`tasks.md` T-05 AC に TC-018 への参照はない。`test-cases.md` の TC-018 は現在 "GraphQL endpoint is derived correctly for github.com and GHES" に割り当てられており整合している。

### [LOW] design.md の "TC-018" 参照が test-cases.md の TC-018 と名前衝突
**Status: FIXED**
`design.md` に "TC-018" の文字列はない（grep で 0 件確認）。`run-inbox-inbox-origin.test.ts` への参照はファイルパスで記述されている。

### [HIGH] TC-005 未テスト: positional + --issue → issue-target routing が pin されていない
**Status: FIXED**
`src/cli/__tests__/from-issue.test.ts` lines 502–563 に `describe("TC-005: positional + --issue → startWithIssueLink に route される")` が追加された。`startWithIssueLink` が呼ばれること、`runRunCore` に `onFeatureBranchCreated` が渡されることを assert している。

### [HIGH] TC-012 未テスト: no-worktree 経路の onFeatureBranchCreated 呼び出しが pin されていない
**Status: FIXED**
`tests/unit/no-worktree-mode.test.ts` に TC-012 describe が追加され、以下を assert:
- checkout 後に callback が `(TC012_OID, branchName)` で呼ばれる (line 800–801)
- rejection 時に警告が stderr に書かれ setupWorkspace が resolve する (lines 804–832)
- rev-parse HEAD 失敗時に callback がスキップされ警告が出る (lines 834–875)
- ordering: callback < git-commit (lines 877–923、`requestFilePath` を渡し git-commit に到達)

### [LOW] getIssue mock に nodeId フィールドが未追加
**Status: FIXED**
`tests/unit/core/runtime/local.test.ts:52` — `nodeId: "NODE_001"` が追加されている。
`tests/unit/no-worktree-mode.test.ts:139` — 同様に `nodeId: "NODE_001"` が追加されている。

### [HIGH] 「3 経路すべてで Development リンク登録が発火する」が per-route でテスト pin されていない
**Status: FIXED**
各経路で `onFeatureBranchCreated` が `runRunCore` の options に含まれることを assert:
- `--from-issue` 経路: `from-issue.test.ts` TC-011 (line 385–396) `typeof opts["onFeatureBranchCreated"] === "function"` ✓
- positional + `--issue` 経路: `from-issue.test.ts` TC-005 (line 542–562) 同様に assert ✓
- inbox 経路: `tests/unit/inbox/run-inbox-inbox-origin.test.ts` TC-018 (line 110) `typeof options["onFeatureBranchCreated"] === "function"` ✓

### [LOW] TC-013: buildFeatureBranchName の3呼び出し箇所が grep-pin されていない
**Status: FIXED**
`tests/unit/core/runtime/workspace-materializer-link.test.ts` TC-013 (lines 224–234) に `pipeline-run.ts` / `design.ts` / `commit-orchestrator.ts` の 3 ファイルを `fs.readFileSync` で読み `buildFeatureBranchName` を含むことを assert するグレップ pin テストが追加されている。

### [LOW] no-worktree path で git rev-parse HEAD 失敗時の callback スキップが無警告
**Status: FIXED**
`src/core/runtime/local.ts:372` — `stderrWrite("Warning: could not resolve HEAD OID for linked branch registration (no-worktree): ...")` が実装されている。`no-worktree-mode.test.ts:874` でこのメッセージを assert するテストも存在する。

### [MEDIUM] TC-006: 警告 assertion 未 pin — buildLinkedBranchRegistrar 失敗時の stderrWrite 呼び出しが assert されていない
**Status: FIXED**
`src/core/job/__tests__/start-from-issue.test.ts` TC-006 (line 175): `expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(expect.stringContaining("Warning"))` が追加されている。

### [MEDIUM] TC-012: no-worktree rejection 警告 assertion 未 pin — onFeatureBranchCreated 失敗時の stderr 出力が assert されていない
**Status: FIXED**
`tests/unit/no-worktree-mode.test.ts` lines 828–831 — rejection ケースで `stderrCalls.some((m) => m.includes("Warning"))` を assert している。

### [MEDIUM] TC-011 ordering test は vacuously true — requestFilePath なしでは git-add/git-commit が到達しない
**Status: FIXED**
`tests/unit/core/runtime/workspace-materializer-link.test.ts` TC-011 (lines 171–211) — `requestFilePath: tmpRequestFile` を渡すよう修正されており、`git-commit` が実際に到達し `order.indexOf("callback") < order.indexOf("git-commit")` が vacuously true でなく実行される。

### [LOW] no-worktree 経路: git rev-parse HEAD 失敗時に警告なしで callback が黙って skip される
**Status: FIXED**
finding 11 と同一の実装修正で解消（`local.ts:372` の `stderrWrite`）。`no-worktree-mode.test.ts:874` でピン済み。

### [LOW] no-worktree 経路の callback-before-materialisation 順序が pin されていない
**Status: FIXED**
`tests/unit/no-worktree-mode.test.ts` TC-012 ordering テスト (lines 877–923) — `requestFilePath: requestFile` を渡し git-commit に到達させた上で `callback` < `git-commit` の順序を assert している。

---

## Summary

全 16 件の finding について修正が確認された。回帰なし。
