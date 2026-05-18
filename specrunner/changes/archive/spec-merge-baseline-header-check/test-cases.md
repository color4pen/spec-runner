# Test Cases: spec-merge baseline header consistency check

Source artifacts: request.md §要件, design.md §Solution, tasks.md §Task 4

---

## TC-SMB-01: MODIFIED header exists in baseline → pass

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: tasks.md TC-SMB-01

**GIVEN** a delta spec with `## MODIFIED Requirements` containing `### Requirement: Foo`
**AND** the baseline has a requirement named `Foo`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** the returned violation array is empty

---

## TC-SMB-02: MODIFIED header not in baseline → violation

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: tasks.md TC-SMB-02

**GIVEN** a delta spec with `## MODIFIED Requirements` containing `### Requirement: NonExistent`
**AND** the baseline contains requirements `Foo` and `Bar` but not `NonExistent`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** exactly 1 violation is returned
**AND** the violation string contains `"MODIFIED"` and `"NonExistent"`

---

## TC-SMB-03: baseline absent + MODIFIED present → violation per header

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: tasks.md TC-SMB-03

**GIVEN** a delta spec with `## MODIFIED Requirements` containing headers `A` and `B`
**AND** the baseline is `null` (file does not exist)
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** 2 violations are returned (one per header)
**AND** each violation contains `"non-existent baseline"`

---

## TC-SMB-04: REMOVED header not in baseline → violation

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: tasks.md TC-SMB-04

**GIVEN** a delta spec with `## REMOVED Requirements` containing `### Requirement: Ghost`
**AND** the baseline contains `Foo` but not `Ghost`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** exactly 1 violation is returned
**AND** the violation string contains `"REMOVED"` and `"Ghost"`

---

## TC-SMB-04b: baseline absent + REMOVED present → violation

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: design.md §Logic table (REMOVED / null)

**GIVEN** a delta spec with `## REMOVED Requirements` containing `### Requirement: X`
**AND** the baseline is `null`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** 1 violation is returned
**AND** the violation contains `"non-existent baseline"`

---

## TC-SMB-05: ADDED header already in baseline → violation (duplicate)

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: tasks.md TC-SMB-05

**GIVEN** a delta spec with `## ADDED Requirements` containing `### Requirement: Foo`
**AND** the baseline already contains a requirement named `Foo`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** exactly 1 violation is returned
**AND** the violation string contains `"ADDED"` and `"duplicate"`

---

## TC-SMB-05b: ADDED header not in baseline → pass

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: design.md §Logic table (ADDED / yes / name not in baseline)

**GIVEN** a delta spec with `## ADDED Requirements` containing `### Requirement: New`
**AND** the baseline does not contain `New`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** the returned violation array is empty

---

## TC-SMB-05c: baseline absent + ADDED only → pass

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: request.md §設計判断 3, design.md §Logic table (ADDED / null)

**GIVEN** a delta spec with `## ADDED Requirements` only (no MODIFIED, no REMOVED)
**AND** the baseline is `null`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** the returned violation array is empty

---

## TC-SMB-06: mixed violations across all sections → each reported individually

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: tasks.md TC-SMB-06

**GIVEN** a delta spec with:
  - `## ADDED Requirements`: `Foo` (already in baseline)
  - `## MODIFIED Requirements`: `Missing` (not in baseline)
  - `## REMOVED Requirements`: `Also-Missing` (not in baseline)
**AND** the baseline contains only `Foo`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** exactly 3 violations are returned
**AND** one violation contains `"ADDED"` and `"duplicate"`
**AND** one violation contains `"MODIFIED"` and `"Missing"`
**AND** one violation contains `"REMOVED"` and `"Also-Missing"`

---

## TC-SMB-07: normalization strips markdown bold

- **Category**: Unit (`checkBaselineHeaderConsistency` + `normalizeRequirementHeader`)
- **Priority**: must
- **Source**: tasks.md TC-SMB-07

**GIVEN** a delta spec with `## MODIFIED Requirements` containing header name `**Foo**`
**AND** the baseline contains a requirement named `Foo` (plain text, no decoration)
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** the returned violation array is empty (bold stripped; `**Foo**` matches `Foo`)

---

## TC-NRM-01: normalizeRequirementHeader strips leading/trailing whitespace

- **Category**: Unit (`normalizeRequirementHeader`)
- **Priority**: must
- **Source**: tasks.md §Additional normalization unit tests, design.md §normalizeRequirementHeader

**GIVEN** input `"  **Foo**  "`
**WHEN** `normalizeRequirementHeader` is called
**THEN** the result is `"Foo"`

---

## TC-NRM-02: normalizeRequirementHeader strips inline code backticks

- **Category**: Unit (`normalizeRequirementHeader`)
- **Priority**: must
- **Source**: tasks.md §Additional normalization unit tests

**GIVEN** input `` "`Bar`" ``
**WHEN** `normalizeRequirementHeader` is called
**THEN** the result is `"Bar"`

---

## TC-NRM-03: normalizeRequirementHeader passes plain text unchanged

- **Category**: Unit (`normalizeRequirementHeader`)
- **Priority**: must
- **Source**: tasks.md §Additional normalization unit tests

**GIVEN** input `"Plain"`
**WHEN** `normalizeRequirementHeader` is called
**THEN** the result is `"Plain"`

---

## TC-NRM-04: normalizeRequirementHeader strips markdown italic

- **Category**: Unit (`normalizeRequirementHeader`)
- **Priority**: should
- **Source**: design.md §normalizeRequirementHeader (italic strip regex)

**GIVEN** input `"*Italic*"`
**WHEN** `normalizeRequirementHeader` is called
**THEN** the result is `"Italic"`

---

## TC-NRM-05: normalizeRequirementHeader is case-preserving

- **Category**: Unit (`normalizeRequirementHeader`)
- **Priority**: must
- **Source**: design.md §normalizeRequirementHeader ("case-preserving")

**GIVEN** input `"FooBAR"`
**WHEN** `normalizeRequirementHeader` is called
**THEN** the result is `"FooBAR"` (no case folding)

---

## TC-NRM-06: normalization on both delta and baseline before comparison

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: should
- **Source**: design.md §checkBaselineHeaderConsistency ("Normalization is applied to both delta and baseline names")

**GIVEN** a delta spec with `## MODIFIED Requirements` containing header `` `Baz` ``
**AND** the baseline contains `Baz` (plain)
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** the returned violation array is empty (inline-code stripped on delta side; plain matches)

---

## TC-SMB-08: REMOVED header exists in baseline → pass

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: must
- **Source**: design.md §Logic table (REMOVED / yes / name in baseline)

**GIVEN** a delta spec with `## REMOVED Requirements` containing `### Requirement: Foo`
**AND** the baseline contains `Foo`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** the returned violation array is empty

---

## TC-SMB-09: multiple MODIFIED headers, one missing → one violation only

- **Category**: Unit (`checkBaselineHeaderConsistency`)
- **Priority**: should
- **Source**: design.md §checkBaselineHeaderConsistency (per-block iteration)

**GIVEN** a delta spec with `## MODIFIED Requirements` containing headers `Exists` and `Missing`
**AND** the baseline contains `Exists` but not `Missing`
**WHEN** `checkBaselineHeaderConsistency` is called
**THEN** exactly 1 violation is returned for `Missing`

---

## TC-INT-01: `mergeSpecsForChange` calls check before `applyMerge`

- **Category**: Integration (`mergeSpecsForChange`)
- **Priority**: must
- **Source**: request.md §要件 1, design.md §Integration into mergeSpecsForChange

**GIVEN** a change with a delta spec containing a MODIFIED header not in the baseline
**WHEN** `mergeSpecsForChange` is called
**THEN** the function returns / escalates before `applyMerge` is called for that capability

---

## TC-INT-02: baseline read once per capability

- **Category**: Integration (`mergeSpecsForChange`)
- **Priority**: should
- **Source**: design.md §Integration ("baseline is read once per capability")

**GIVEN** a capability with an existing baseline
**WHEN** `mergeSpecsForChange` processes the capability
**THEN** the baseline file is read exactly once (hoisted before the check, reused in `applyMerge`)

---

## TC-INT-03: violation causes capability skip; no write occurs

- **Category**: Integration (`mergeSpecsForChange`)
- **Priority**: must
- **Source**: request.md §受け入れ基準 ("baseline 不在 + MODIFIED/REMOVED 存在で escalation"), design.md §Integration ("`allErrors + continue`")

**GIVEN** a delta spec with a MODIFIED header not in the baseline
**WHEN** `mergeSpecsForChange` processes the capability
**THEN** the violation is collected into the cross-capability error list
**AND** the baseline spec file is not written
**AND** the function ultimately throws `SpecMergeError`

---

## TC-INT-04: valid change (no violations) proceeds to `applyMerge`

- **Category**: Integration (`mergeSpecsForChange`)
- **Priority**: must
- **Source**: design.md §Existing behavior preservation

**GIVEN** a delta spec with all headers correctly matching the baseline
**WHEN** `mergeSpecsForChange` processes the capability
**THEN** no violation is produced
**AND** `applyMerge` is called and the baseline is updated normally

---

## TC-INT-05: multiple capabilities with mixed pass/fail → all violations reported together

- **Category**: Integration (`mergeSpecsForChange`)
- **Priority**: should
- **Source**: design.md §Error message format ("Collected into `allErrors`"), request.md §設計判断 4

**GIVEN** a change spanning two capabilities:
  - capability-A delta is valid (headers match)
  - capability-B delta contains a MODIFIED header not in baseline
**WHEN** `mergeSpecsForChange` is called
**THEN** capability-A proceeds to merge
**AND** capability-B violation is collected
**AND** the final `SpecMergeError` message includes the `[capability-B]` prefix

---

## TC-INT-06: error message format matches existing convention

- **Category**: Integration (`mergeSpecsForChange`)
- **Priority**: should
- **Source**: design.md §Error message format, request.md §設計判断 4

**GIVEN** a MODIFIED header `Foo` not found in capability `spec-merge` baseline
**WHEN** the violation is collected
**THEN** the violation string is `[spec-merge] MODIFIED: Requirement "Foo" not found in baseline`

---

## TC-INT-07: existing `applyMerge` exact-match defense-in-depth preserved

- **Category**: Integration (`mergeSpecsForChange`)
- **Priority**: should
- **Source**: design.md §Existing behavior preservation

**GIVEN** a delta spec that passes the new consistency check (normalized names match)
**BUT** the exact name (post-normalization) differs from the baseline name in a way only `applyMerge` detects
**WHEN** `mergeSpecsForChange` processes the capability
**THEN** the new pre-check passes
**AND** `applyMerge` still produces an error (defense-in-depth remains active)

---

## TC-REG-01: existing spec-merge tests pass without regression

- **Category**: Regression
- **Priority**: must
- **Source**: request.md §受け入れ基準 ("既存 spec-merge.test.ts の regression なし")

**GIVEN** the refactored `mergeSpecsForChange` with the hoisted baseline read and the new pre-check
**WHEN** `bun run test` is executed against `tests/finish-spec-merge.test.ts`
**THEN** all pre-existing test cases pass

---

## TC-REG-02: `bun run typecheck` succeeds after implementation

- **Category**: Regression
- **Priority**: must
- **Source**: request.md §受け入れ基準 ("`bun run typecheck && bun run test` が green")

**GIVEN** new files `src/core/finish/baseline-headers.ts` and modified `src/core/finish/spec-merge.ts`
**WHEN** `bun run typecheck` is executed
**THEN** no type errors are reported
