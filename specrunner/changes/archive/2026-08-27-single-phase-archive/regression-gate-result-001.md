# Regression Gate Result — single-phase-archive / Iteration 1

**Date**: 2026-08-27  
**Branch**: change/single-phase-archive-36cad676  
**Ledger items verified**: 9  
**Regressions found**: 0

---

## Verification Summary

| # | Ref | Severity | Title | Status |
|---|-----|----------|-------|--------|
| 1 | `f1be7a88` | LOW | --from-issue の Scenario が spec.md に存在しない | ✅ FIXED |
| 2 | `1015e7f9` | LOW | Path B の noWorktree===true ケースのテストが欠落 | ✅ FIXED |
| 3 | `1b6658ca` | LOW | カテゴリラベル "merge・archive 待ち" が旧操作順を示唆したまま | ✅ FIXED |
| 4 | `3415759b` | LOW | 先行 ADR の amend が tasks.md で明示されていない | ✅ FIXED |
| 5 | `d513b5a2` | HIGH | workflow YAML archive コメントブロックに旧 2 相契約の記述が残っている | ✅ FIXED |
| 6 | `23c638e0` | LOW | orchestrator JSDoc が旧記述のまま | ✅ FIXED |
| 7 | `da78f075` | HIGH | TC-022〜026: ls-remote idempotent push guard の 5 テストが未実装 | ✅ FIXED |
| 8 | `e00b3a55` | MEDIUM | TC-022: headSha acquisition not asserted after push-skip path | ✅ FIXED |
| 9 | `6ec10a0b` | LOW | Path B omits explicit finishable gate; comment should document why | ✅ FIXED |

---

## Detail

### [1] f1be7a88 — --from-issue Scenario added to spec.md ✅
`spec.md` lines 32–38 now contain `#### Scenario: --from-issue invocation completes in one run`,
explicitly stating that `--from-issue` resolves the slug, calls `runPlainArchive` once, and completes
the full archive flow. The single-run guarantee is stated in both the Requirements prose and the
Scenario text.

### [2] 1015e7f9 — TC-042 implemented ✅
`src/core/archive/__tests__/plain-archive.test.ts` (line 626) contains
`describe("plain archive — Path B: noWorktree + local branch missing (TC-042)")` which drives
`noWorktree=true`, mocks `git rev-parse --verify` to return exitCode 1, and asserts: orchestrator
not called, `markJobArchived` called, cleanup called with `deleteRemoteBranch: false`, exitCode 0.

### [3] 1b6658ca — CATEGORY_META label updated ✅
`src/core/job-list/operations-view.ts` line 77: label is `"archive・merge 待ち"` (archive first,
then merge), correcting the old `"merge・archive 待ち"`.

### [4] 3415759b — ADR amend explicit in tasks.md and ADR updated ✅
`tasks.md` T-09-pre (lines 161–174) explicitly instructs: add `Amends:` header to new ADR,
update `2026-08-21-archive-state-after-merge.md` status to `superseded`, reference the
撤回対象 in the new ADR. The ADR file itself now reads
`superseded by [ADR-20260826-single-phase-archive]`.

### [5] d513b5a2 — Workflow YAML cleaned of 2-phase wording ✅
`grep -n "2 相|2相|再実行|completeAfterMerge|1 回目|2 回目" .github/workflows/specrunner-dispatch.yml`
returns empty. Lines 30–35 now read: "1 回の実行で完結する", "PR merge は GitHub UI に委譲される独立した操作",
"workflow は merge を待たない・検出しない".

### [6] 23c638e0 — orchestrator.ts JSDoc updated ✅
`src/core/archive/orchestrator.ts` module JSDoc (lines 1–17) no longer references
"after the PR is merged via completeAfterMerge". It now reads: "Post-merge cleanup … is handled
separately by runArchiveCleanup, which is called by plain-archive and --with-merge after
transitioning to archived."

### [7] da78f075 — TC-022~026 all implemented ✅
`tests/unit/core/archive/orchestrator.test.ts` lines 894–1142 contain five distinct `describe`
blocks:
- **TC-022** (line 894): mv/commit 双方 skip + ls-remote 空 → push skip, exit 0
- **TC-023** (line 965): mv/commit 双方 skip + ls-remote に branch あり → push 試行
- **TC-024** (line 1012): mv/commit 双方 skip + push 失敗 → warning のみ exit 0
- **TC-025** (line 1059): 新規記帳あり + push 失敗 → escalation exit 1
- **TC-026** (line 1101): ls-remote 非 0 → fail-open push

### [8] e00b3a55 — TC-022 asserts headSha and rev-parse ✅
TC-022 test (lines 952–961) asserts:
- `expect(revParseCall).toBeDefined()` — verifies `git rev-parse HEAD` was spawned
- `expect(result.headSha).toBe(EXPECTED_SHA)` — verifies `headSha` is the value returned
  by rev-parse, even on the push-skip path.

### [9] 6ec10a0b — Path B finishable-gate omission documented ✅
`src/core/archive/plain-archive.ts` lines 128–140 contain a block comment:
```
// assertJobFinishable is intentionally omitted here.
// Design D5 Path B semantics: the archive record already exists on the remote
// branch; the only remaining work is to transition the job state and clean up.
// This path is best-effort by design — if markJobArchived throws …
// Calling assertJobFinishable before markJobArchived would introduce an
// unnecessary hard failure for a path whose contract is "warn on error,
// always run cleanup".
```

---

## Evidence

- **checked**: 9 (all ledger items read and verified in source)
- **skipped**: 0
- **unverified**: 0
