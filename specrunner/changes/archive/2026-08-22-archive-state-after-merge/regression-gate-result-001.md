# Regression Gate Result — archive-state-after-merge (Iteration 1)

**Date**: 2026-08-21
**Branch**: change/archive-state-after-merge-0215f3b4
**Verdict**: Derived by CLI from typed findings (see report_result call)

---

## Evidence

### Checked items: 4 / Skipped: 0 / Unverified: 0

---

## Finding [1] `5e906b3e` — terminal status シナリオが `canceled` 状態を明示しない

**Status**: FIXED — No regression

**Verification**:
- File: `specrunner/changes/archive-state-after-merge/spec.md`, lines 170–177
- The Requirement "terminal status の job に対する plain archive は no-op である" (line 157) now includes **two** Scenario blocks:
  - `Scenario: 既に archived の job` (lines 161–168)
  - `Scenario: 既に canceled の job` (lines 170–177) — **newly added**
- The `canceled` scenario explicitly states: 記帳・PR 問い合わせ・cleanup なし / exit code 0
- Additionally, TC-040 was added to `test-cases.md` (line 400) and implemented in `plain-archive.test.ts` (line 526–545) as `it("TC-040: already canceled → no-op / exit 0 ...")`.

---

## Finding [2] `d19b0729` — PR 無し job での markJobArchived 失敗ケースのテストケースが不在

**Status**: FIXED — No regression

**Verification**:
- File: `specrunner/changes/archive-state-after-merge/test-cases.md`, lines 406–418 — **TC-041 added**
  - `### TC-041: PR を持たない job で markJobArchived が失敗した場合は escalation を返す`
  - Category: unit / Priority: should / Source: design.md > D3 step 5
  - GIVEN/WHEN/THEN steps explicitly cover the `markJobArchived` throws → escalation path
- File: `src/core/archive/__tests__/plain-archive.test.ts`, lines 663–693 — **TC-041 implemented**
  - `it("TC-041: PR-less + markJobArchived throws → orchestrator called / exit 1 escalation / cleanup NOT called", ...)`
  - `vi.mocked(markJobArchived).mockRejectedValue(new Error("disk full"))` exercised
  - Asserts: `result.exitCode === 1`, `"escalation" in result`, `runPostMergeCleanup` NOT called

---

## Finding [3] `15eb93c8` — TC-009 と orchestrator.test.ts 内の既存ラベル TC-009 の命名重複

**Status**: FIXED — No regression

**Verification**:
- File: `specrunner/changes/archive-state-after-merge/tasks.md`, line 65 (T-03 Acceptance Criteria)
- The clarifying parenthetical now reads verbatim:
  > 「ここで TC-009 は `orchestrator.test.ts` 内のテストラベル「deferArchivedTransition: true → markJobArchived NOT called」を指す。`test-cases.md` の TC-009「merge-then-archive.ts が markJobArchived / runPostMergeCleanup を直接呼ばない」とは別物）」
- Implementers can now unambiguously distinguish the two TC-009 references.

---

## Finding [4] `5a1f8bcd` — TC-019 に専用の `it()` ブロックが存在しない（トレーサビリティ欠落）

**Status**: FIXED — No regression

**Verification**:
- File: `src/core/archive/__tests__/plain-archive.test.ts`, lines 634–656
- Dedicated `it()` block exists in describe `"plain archive — idempotent re-run (TC-017, TC-019)"`:
  ```
  it("TC-019: archiveRecorded + OPEN re-run → markJobArchived / runPostMergeCleanup / getCheckStatus NOT called", ...)
  ```
- Scenario: `archiveRecorded = true` (ARCHIVE_SOURCE_CHANGE_DIR), PR state = `OPEN`
- Assertions:
  - `expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled()` ✓
  - `expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled()` ✓
  - `expect(vi.mocked(githubClient.getCheckStatus)).not.toHaveBeenCalled()` ✓
  - `expect(result.exitCode).toBe(0)` ✓
- JSDoc comment in block explicitly explains CI-agnosticism rationale.

---

## Summary

All 4 ledger findings were verified and found to be fixed in the current branch. No regressions detected.
