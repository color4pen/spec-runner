# Regression Gate Result — remove-bite-evidence (Iteration 1)

## Summary

All 5 ledger findings were verified as **fixed** in the current branch. No regressions detected.

---

## Finding Verification

### [1] `d4c98320` — T-12 削除リストに authorized-canon-writer-steps.test.ts が漏れている

**Status: FIXED**

- `tasks.md` lines 287–288 now explicitly list `src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` in T-12's deletion set (with the rationale: "imports `authorizedCanonWriterSteps` from `canon-provenance.ts` which T-03 removes").
- The file itself does not exist in the branch (`ls` returned "No such file or directory").
- No compile failure risk.

---

### [2] `ddb6e487` — test-cases.md Summary の automated/manual 合計が total と不整合

**Status: FIXED**

- `test-cases.md` line 462 now reads `automated: 38` (was `37`).
- 38 + 7 = 45 = `total: 45`. The arithmetic is consistent.

---

### [3] `f6b908fe` — StepRun.commitOid JSDoc に削除済み bite-evidence gate への false current-state claim が残存している

**Status: FIXED**

- `src/state/schema/types.ts` lines 212–231: The `commitOid` JSDoc no longer contains any reference to the bite-evidence gate (R4). The current comment correctly describes only the `conformanceApprovedForVerifiedRevision` usage.
- Verified: no bite-evidence gate wording in the `commitOid` JSDoc block.

---

### [4] `c2b8d917` — pipeline.episode-reset.test.ts に bite-evidence step 定義・dead handler branch・stale コメントが残存している

**Status: FIXED**

- `grep bite-evidence` in `tests/unit/core/pipeline/pipeline.episode-reset.test.ts` returns **no matches**.
- The `steps` Map (lines 227–247) contains only: implementer, verification, code-review, code-fixer, conformance, adr-gen, pr-create — no `bite-evidence` entry.
- The `executeSpy` function handles the same set of steps with no `bite-evidence` branch.
- The driver-sequence comments (lines 188–193) describe the flow without any bite-evidence stage.

---

### [5] `c6a5d73d` — changelog 来歴コメント群に bite-evidence-forward (R4) の記述が残存している

**Status: FIXED**

All three locations were checked:

- `src/store/event-journal.ts` line 70 area: The `commitOid` field comment now reads only "Set only for sequential steps that own their own git commit." — no bite-evidence-forward (R4) mention.
- `src/state/helpers.ts` line 110 area: Similarly, the `commitOid` comment has no bite-evidence reference.
- `src/core/runtime/local.ts` line 996 area: The section is now "Git commit introspection helpers" — no bite-evidence-forward (R4) mention.
- Grep for `bite-evidence-forward` / `R4.*bite` in all three files: **no matches**.

---

## Evidence

| # | Ledger Ref | File / Location | Verified |
|---|-----------|-----------------|---------|
| 1 | `d4c98320` | tasks.md:287 + file deletion | ✅ Fixed |
| 2 | `ddb6e487` | test-cases.md:462 (automated: 38) | ✅ Fixed |
| 3 | `f6b908fe` | src/state/schema/types.ts:228 (JSDoc) | ✅ Fixed |
| 4 | `c2b8d917` | tests/unit/core/pipeline/pipeline.episode-reset.test.ts | ✅ Fixed |
| 5 | `c6a5d73d` | src/store/event-journal.ts:70, src/state/helpers.ts:110, src/core/runtime/local.ts:996 | ✅ Fixed |

**Checked**: 5 / **Skipped**: 0 / **Unverified**: 0
