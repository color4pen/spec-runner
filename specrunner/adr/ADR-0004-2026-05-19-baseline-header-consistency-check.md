# ADR-0004: Baseline Header Consistency Check as Defense-in-Depth Layer in spec-merge

- **Date**: 2026-05-19
- **Status**: Accepted
- **Issue**: #313

## Context

`spec-merge` (finish Phase 1) applies delta specs to baseline specs via `applyMerge`. The existing `applyMerge` function performs exact-string matching between delta header names and baseline header names. Two failure modes were observed in PR #306 and PR #308:

1. **Late detection**: `applyMerge` errors surface mid-merge, mixed with merge-application errors. No early bail-out before file I/O is attempted.
2. **No normalization**: agent-written delta headers sometimes include markdown decorations (`**Foo**`, `` `Foo` ``) that differ from the plain-text baseline headers (`Foo`). Exact matching treats these as "not found" and escalates, even though the intent is a match.

## Decision

Add a normalization-aware pre-check (`checkBaselineHeaderConsistency`) that runs before `applyMerge` in the per-capability loop of `mergeSpecsForChange`.

The check:
- Normalizes both delta and baseline header names (strips bold, italic, inline-code markdown decoration; trims whitespace; preserves case)
- Verifies MODIFIED/REMOVED headers exist in the baseline (or reports violation if baseline is absent)
- Verifies ADDED headers do not already exist in the baseline (duplicate detection)
- Collects all violations into `allErrors` and continues to the next capability (no early exit)

If any violation is found, `applyMerge` is never called for that capability.

## Alternatives Considered

### A: Modify `applyMerge` to perform normalization internally

Rejected. `applyMerge` has a well-defined contract (exact-string matching, pure function). Adding normalization inside it would:
- Mix concerns (normalization policy with merge application logic)
- Break existing exact-match defense-in-depth (tests TC-SM-044 through TC-SM-046 rely on exact matching)
- Make the function harder to test in isolation

### B: Normalize header names at parse time (`parseDeltaSpec`)

Rejected. Normalizing at parse time loses the original header text, which is needed for accurate error messages and for writing the merged content back to the baseline.

### C: Pre-check only (remove `applyMerge` exact-match checks)

Rejected. `applyMerge` exact-match checks are retained as defense-in-depth. The pre-check catches normalized mismatches earlier; `applyMerge` catches any remaining exact-match issues that slipped through (e.g., if normalization logic diverges in edge cases).

## Consequences

- Delta specs with markdown-decorated headers (common in agent output) will be matched correctly against plain-text baseline headers.
- Violations are detected and reported before any file is written (consistent with the existing two-pass atomic approach).
- The `normalizeRequirementHeader` function is isolated in `src/core/finish/baseline-headers.ts` for independent unit testing.
- `applyMerge` is unchanged; its exact-match behavior is preserved as a second layer of defense.

## Files Changed

| File | Change |
|------|--------|
| `src/core/finish/baseline-headers.ts` | NEW: `normalizeRequirementHeader` |
| `src/core/finish/spec-merge.ts` | ADD `checkBaselineHeaderConsistency`; refactor `mergeSpecsForChange` per-capability loop to hoist baseline read and call pre-check |
| `tests/unit/core/finish/spec-merge-baseline-check.test.ts` | NEW: TC-SMB-01 through TC-SMB-09, TC-NRM-01 through TC-NRM-06 |
| `specrunner/changes/spec-merge-baseline-header-check/specs/spec-merge/spec.md` | NEW delta spec (ADDED requirement) |
