# Regression Gate Result — Iteration 2

## Verification Summary

All 13 ledger findings were verified against the current HEAD of branch
`feat/issue-target-start-face-bf87f3b1`. No regressions found.

---

## Per-Finding Status

### F-01 [LOW] no-worktree 経路の Development リンク登録 Scenario が spec.md に存在しない
**Status: FIXED**
`spec.md` lines 114–121 now contain `#### Scenario: no-worktree route fires link registration after branch creation`, covering the no-worktree path including the best-effort / warning-on-failure contract.

### F-02 [LOW] GraphQL endpoint 導出ロジックに対応する spec Scenario がない
**Status: FIXED**
`spec.md` lines 170–175 now contain `#### Scenario: GraphQL endpoint is derived correctly for github.com and GHES` under Requirement `getIssue exposes the GraphQL node id and createLinkedBranch is available`.

### F-03 [MEDIUM] T-01 AC の期待値が型定義と矛盾: feat/ ではなく fix/
**Status: FIXED**
`tasks.md` T-01 AC (line 15) now reads `fix/my-slug-abcdef01` and explicitly annotates `"fix/"` (not `"feat/"`). `grep "feat/my-slug-abcdef01" tasks.md` returns zero matches. The corresponding test in `workspace-materializer-link.test.ts` TC-019 (line 263) asserts `fix/my-slug-abcdef01`.

### F-04 [LOW] T-05 AC が test-cases.md に存在しない TC-018 を参照している
**Status: FIXED**
T-05 AC no longer contains a `(TC-018)` label; it refers to the file by path only: `tests/unit/inbox/run-inbox-inbox-origin.test.ts`. Additionally, TC-018 now exists in `test-cases.md` (as the GraphQL endpoint test), so even the "non-existent in test-cases.md" premise of the finding is resolved.

### F-05 [LOW] design.md の "TC-018" 参照が test-cases.md の TC-018（GraphQL endpoint テスト）と名前衝突
**Status: FIXED**
`grep "TC-018" design.md` returns zero matches. The D2 and Context sections now refer to `run-inbox-inbox-origin.test.ts` only by file path.

**Observation**: The test file itself (`run-inbox-inbox-origin.test.ts`) still uses TC-018 as its internal `describe` label, which overlaps with the test-cases.md TC-018 (GraphQL). Disambiguation is maintained by file path context and the test-cases.md Source field.

### F-06 [HIGH] TC-005 未テスト: positional + --issue → issue-target routing が pin されていない
**Status: FIXED**
`src/cli/__tests__/from-issue.test.ts` lines 505–563 contain a dedicated `describe("TC-005: positional + --issue → startWithIssueLink に route される", ...)` block that:
- Asserts `startWithIssueLink` is called (not `materializeDraftAndStart`).
- Asserts correct `issueNumber` and `requestMdPath`.
- Uses `vi.importActual` to run the real `startWithIssueLink` and asserts `runRunCore` receives `onFeatureBranchCreated` as a function.

### F-07 [HIGH] TC-012 未テスト: no-worktree 経路の onFeatureBranchCreated 呼び出しが pin されていない
**Status: FIXED**
`tests/unit/no-worktree-mode.test.ts` lines 764–871 contain a `describe("TC-012: setupWorkspace no-worktree — onFeatureBranchCreated callback", ...)` block with three tests:
1. Callback called with correct `baseOid` and `branchName` after checkout.
2. Callback rejection is warning-only; `setupWorkspace` still resolves (best-effort).
3. `rev-parse HEAD` failure → callback skipped + warning written to stderr.

### F-08 [LOW] getIssue mock に nodeId フィールドが未追加
**Status: FIXED**
- `tests/unit/core/runtime/local.test.ts` line 52: `getIssue` mock returns `{ number: 1, title: "Test Issue", body: "", nodeId: "NODE_001" }`.
- `tests/unit/no-worktree-mode.test.ts` line 139: same.

### F-09 [HIGH] 「3 経路すべてで Development リンク登録が発火する」が per-route でテスト pin されていない
**Status: FIXED**
All three routes now assert `onFeatureBranchCreated` presence:
- `--from-issue` route: `from-issue.test.ts` TC-011 (line 385) uses real `materializeDraftAndStart` and asserts `runRunCore` receives `onFeatureBranchCreated`.
- `positional + --issue` route: `from-issue.test.ts` TC-005 (line 542) uses real `startWithIssueLink` and asserts `runRunCore` receives `onFeatureBranchCreated`.
- `inbox` route: `run-inbox-inbox-origin.test.ts` (line 109) asserts `typeof options["onFeatureBranchCreated"] === "function"`.

### F-10 [LOW] TC-013: buildFeatureBranchName の3呼び出し箇所が grep-pin されていない
**Status: FIXED**
`workspace-materializer-link.test.ts` TC-013 (lines 224–235) now uses `fs.readFileSync` to verify that `pipeline-run.ts`, `design.ts`, and `commit-orchestrator.ts` each contain the string `buildFeatureBranchName`. The assertion is no longer vacuous.

### F-11 [LOW] no-worktree path で git rev-parse HEAD 失敗時の callback スキップが無警告
**Status: FIXED**
`src/core/runtime/local.ts` lines 367–374: when `rev-parse HEAD` returns non-zero, `stderrWrite` is called with `"Warning: could not resolve HEAD OID for linked branch registration (no-worktree): ..."`, and the callback is skipped. The corresponding test (TC-012 third case, `no-worktree-mode.test.ts` line 829) asserts both the skip and the stderr warning.

### F-12 [MEDIUM] TC-011 ordering test は vacuously true
**Status: FIXED**
`workspace-materializer-link.test.ts` TC-011 (lines 171–211) now:
- Creates real temp dirs via `fsp.mkdtemp`.
- Writes a real `tmpRequestFile` and passes `requestFilePath: tmpRequestFile` to `materializer.materialize`.
- Spy captures `git-add` / `git-commit` events, and the `order.indexOf("callback") < order.indexOf("git-commit")` assertion is no longer guarded by vacuous `-1` checks.

### F-13 [LOW] no-worktree 経路: git rev-parse HEAD 失敗時に警告なしで callback が黙って skip される
**Status: FIXED**
Same as F-11 (duplicate concern, same root cause). Warning added in `local.ts`; test pins it in TC-012 third case.

---

## Evidence

- **Checked**: 13 findings
- **Skipped**: 0
- **Unverified**: 0
