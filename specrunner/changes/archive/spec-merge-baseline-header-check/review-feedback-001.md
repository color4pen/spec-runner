# Code Review: spec-merge-baseline-header-check

- **verdict**: needs-fix
- **reviewer**: code-review agent
- **date**: 2026-05-19
- **branch**: feat/spec-merge-baseline-header-check-3edec30a

---

## Summary

The core implementation is correct and well-structured. `normalizeRequirementHeader`, `checkBaselineHeaderConsistency`, and the refactored `mergeSpecsForChange` loop all match the design. All 7 required test cases (TC-SMB-01 through TC-SMB-07) are present and correctly written. However, there is one major defect: the delta spec was written but never applied — `specrunner/specs/spec-merge/spec.md` at HEAD is identical to main. The new requirement is absent from the baseline.

---

## Findings

### Major

**M-01: Delta spec not applied — baseline spec unchanged at HEAD**

`specrunner/specs/spec-merge/spec.md` at HEAD is byte-for-byte identical to main. The implementer commit (`4ddaf68`) does not include a modification to the baseline spec. The design commit (`6596fd2`) created the correct delta spec at `specrunner/changes/spec-merge-baseline-header-check/specs/spec-merge/spec.md`, but `specrunner finish` (which calls `mergeSpecsForChange`) was never run during implementation — only during verification, which apparently did not trigger finish.

Concretely, the requirement "baseline header consistency check before merge application" is absent from `specrunner/specs/spec-merge/spec.md`. This violates request.md §受け入れ基準 item 10 ("delta spec が baseline 確認の上で適切な section で作成されている") and task 5 acceptance criteria.

Fix: run `specrunner finish spec-merge-baseline-header-check` on this branch (or manually apply the ADDED requirement from the delta spec into the baseline). The delta spec itself (`ADDED` section with correct name) is correct — it just was not merged.

---

## Minor

None identified.

---

## Nits

**N-01: Test file describes TC-SMB-04b through TC-SMB-09 as "extended cases" in the top comment**

The comment on line 6 lists the extended cases informally. TC-SMB-04b and TC-SMB-05b/c were not in the original TC-SMB-01..07 numbering from request.md but are present in test-cases.md. No action required — the extra coverage is strictly positive. This is documentation only.

**N-02: `request.md` acceptance criteria checkboxes are unchecked**

Lines 151-160 in request.md use `- [ ]` (unchecked) format. Tasks.md shows all 7 tasks completed `[x]`. Minor inconsistency in meta-artifacts; no functional impact.

---

## Test Coverage Assessment

All 7 required test cases from request.md §要件 3 and tasks.md §Task 4 are present and correctly implemented:

| TC | Present | Assertion correct |
|----|---------|-------------------|
| TC-SMB-01 | yes | `violations.toHaveLength(0)` when MODIFIED matches baseline |
| TC-SMB-02 | yes | 1 violation containing "MODIFIED" and "NonExistent" |
| TC-SMB-03 | yes | 2 violations each containing "non-existent baseline" |
| TC-SMB-04 | yes | 1 violation containing "REMOVED" and "Ghost" |
| TC-SMB-05 | yes | 1 violation containing "ADDED" and "duplicate" |
| TC-SMB-06 | yes | 3 violations with correct section labels |
| TC-SMB-07 | yes | `**Foo**` normalized to match `Foo` in baseline → empty violations |

Additional coverage beyond the required 7 (TC-SMB-04b, 05b, 05c, 08, 09, TC-NRM-01 through 06, TC-NRM-06) is present and correct. The normalization edge cases (italic, inline-code on both sides) are well covered.

The test helpers (`makeBlock`, `makeDelta`) are clean and match the pattern from the existing spec-merge test suite. Imports use `.js` extensions correctly for ESM.

---

## Implementation Correctness Assessment

### `normalizeRequirementHeader` (`src/core/finish/baseline-headers.ts`)

Correct. Strips bold, italic, and inline-code in the right order (bold before italic avoids `**x**` being half-matched by the italic regex). Final `.trim()` is redundant but harmless. Case-preserving as specified.

### `checkBaselineHeaderConsistency` (`src/core/finish/spec-merge.ts` lines 240-292)

Correct. The normalized baseline Set is built once. MODIFIED and REMOVED correctly check for null baseline first, then normalized membership. ADDED correctly skips the check when baseline is null (pass for new capabilities) and checks for duplicates when baseline exists. Error message format matches design.md §Error message format exactly.

### `mergeSpecsForChange` loop refactor (lines 552-604)

Correct. The baseline read is hoisted above `checkBaselineHeaderConsistency` and `baselineContent` is reused in `parseBaselineSpec(baselineContent!)` for the `applyMerge` branch — no double-read. The `checkBaselineHeaderConsistency` call at line 569 is correctly placed after `validateDeltaSpec` and before the `!baselineExists` / `applyMerge` branches. The defense-in-depth `!baselineExists` branch is preserved as specified.

### Delta spec (`specrunner/changes/.../specs/spec-merge/spec.md`)

The delta spec itself is correctly written as `## ADDED Requirements` (the requirement "baseline header consistency check before merge application" does not exist in main's baseline). Content matches tasks.md §Task 5 verbatim. The defect is that this delta spec was not applied via `finish`.

---

## Required Fix

Apply the delta spec to the baseline by running `specrunner finish spec-merge-baseline-header-check` on this branch, or manually append the ADDED requirement to `specrunner/specs/spec-merge/spec.md`. After the fix, `specrunner/specs/spec-merge/spec.md` should contain 5 requirements (4 existing + 1 new).
