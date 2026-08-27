# Regression Gate Result — split-reopen-from-resume (Iteration 1)

## Summary

All 13 ledger findings have been verified and are **fixed** in the current code. No regressions detected.

---

## Findings Verification

### [1] ee327271 — TC-002-c アサート (`awaiting-resume`)
**Status: FIXED**

`src/state/__tests__/lifecycle-reopen.test.ts` line 100:
```ts
expect(targets!.has("awaiting-resume")).toBe(true);
```
The assertion now correctly checks `awaiting-resume` (not `running`). The describe label was also updated to `"awaiting-archive → awaiting-resume edge"`.

---

### [2] 89a67ed2 — tasks.md T-06 TC 番号マッピングテーブル
**Status: FIXED**

`tasks.md` T-06 now contains an explicit mapping table that cross-references old test-file TC labels to test-cases.md TC numbers (TC-003→TC-015, TC-006→TC-003, TC-007→TC-004, TC-013→TC-030, TC-014→TC-006, TC-015→TC-007, TC-018→TC-029, TC-020→TC-009, TC-021→TC-010+TC-011). The rewritten `reopen-command.test.ts` uses test-cases.md TC numbers throughout.

---

### [3] 6d0cbdd6 — TC-019 (Actions integration test) 実装指示の欠如
**Status: FIXED**

`tasks.md` T-04 now includes:
```
- [x] Add an automated unit test (TC-019 per test-cases.md) verifying that the
  `action=reopen` branch of the Actions YAML dispatches two sequential CLI
  commands (implemented in `tests/unit/workflow/specrunner-dispatch.test.ts`).
```
The test has been implemented in `tests/unit/workflow/specrunner-dispatch.test.ts`.

---

### [4] 9a8e1cda — TC-017-d `canTransition(awaiting-archive, awaiting-resume) = false` 実装指示欠如
**Status: FIXED**

`tasks.md` T-01 now explicitly instructs:
```
add a new TC-017-d sub-test to directly assert that canTransition("awaiting-archive", "awaiting-resume") returns false.
```
`src/state/__tests__/lifecycle-reopen.test.ts` lines 160-164 implement TC-017-d:
```ts
it("TC-017-d: canTransition('awaiting-archive', 'awaiting-resume') returns false", () => {
  expect(canTransition("awaiting-archive", "awaiting-resume")).toBe(false);
});
```

---

### [5] dc48ee6d — core-invariants.test.ts B-17 prose コメントが不正確
**Status: FIXED**

`tests/unit/architecture/core-invariants.test.ts` lines 1192-1193 now read:
```
* awaiting-archive → awaiting-resume transition must only be passed from
```
The old "awaiting-archive → running transition" text has been corrected.

---

### [6] e2f55eb4 — `--reason` 入力長・内容制約が仕様未定義
**Status: FIXED**

`specrunner/changes/split-reopen-from-resume/spec.md` now contains a "Note: `--reason` input constraints" section (lines 222-243) that explicitly documents:
- No minimum or maximum length enforced
- No truncation allowed
- XSS/injection risk assessment (CLI context, no risk)
- Future constraint amendment process

---

### [7] 1be43829 — TC-024 (`from: 'spec-review'`) が ARG_ERROR を踏む
**Status: FIXED**

`src/cli/__tests__/command-registry-reopen.test.ts` TC-024-registry (lines 220-252) now uses only `reason: "post-review fix"` in flags — no `from` field. The test correctly verifies that the handler does not exit with ARG_ERROR when only `--reason` is provided.

---

### [8] 9403240d — test-cases.md TC-027 が旧 TC-003 ラベルを参照
**Status: FIXED**

`specrunner/changes/split-reopen-from-resume/test-cases.md` TC-027 (line 383) now references `TC-015 (ResumeCommand rejects awaiting-archive)`, not the old `TC-003`.

---

### [9] 299c59eb — TransitionOpts JSDoc が `ReopenCommand.prepare()` を参照
**Status: FIXED**

`src/state/lifecycle.ts` line 89 now reads:
```
 * Must only be passed by ReopenCommand.execute() — never by resume or other callers.
```
The stale reference to `ReopenCommand.prepare()` has been corrected to `ReopenCommand.execute()`.

---

### [10] 173b3476 — workflow ヘッダーコメントが旧シングルコマンド reopen 記述
**Status: FIXED**

`.github/workflows/specrunner-dispatch.yml` lines 22-25 now accurately describe the two-step flow:
```
# - reopen: ... job reopen <slug> --reason <text>（lifecycle 巻き戻しのみ）→
#           job resume <slug> --from <step> [--prompt <text>]（実行再開）の 2 段呼び出し。
#           --reason は job reopen へ、--from / --prompt は job resume へ渡る。
```
The old `--from <step> --reason <text>` single-command description and `Prompt は透過しない` are gone. The actual script at lines 244-247 implements the two-step sequence with `$PROMPT` forwarding to `job resume`.

---

### [11] aba72862 — state 解決 I/O エラー時に exit code 2 を返す誤り
**Status: FIXED**

`src/core/command/reopen.ts` outer catch block (lines 112-115) now returns `return 1;` for I/O errors from state resolution. Only the worktree guard block (lines 62-71) returns `return 2;`.

---

### [12] 97e371b1 — `vi.mock('../../resume/resolve-job.js')` 重複宣言
**Status: FIXED**

`src/core/command/__tests__/reopen-command.test.ts` now has only one `vi.mock("../../resume/resolve-job.js"` declaration (lines 31-33). The duplicate at the old line 82-84 has been removed.

---

### [13] 0d8f6ff2 — 消費済み `/resume` コメントが reopen 後に pipeline を再起動し得る
**Status: FIXED**

`src/core/inbox/planner.ts` lines 200-215 now implement a guard:
```ts
const effectiveCutoff =
  job.updatedAt && job.updatedAt > cutoff ? job.updatedAt : cutoff;
```
`job.updatedAt` is set to the reopen transition timestamp, which is later than the stale `/resume` comment. This prevents re-consumption. A regression test has been added in `src/core/inbox/__tests__/planner.test.ts` at the "planResumes — stale /resume comment re-consumption after job reopen" describe block.

---

## Evidence

- **Checked**: 13 ledger items
- **Regressions**: 0
- **Skipped**: 0
- **Unverified**: 0
