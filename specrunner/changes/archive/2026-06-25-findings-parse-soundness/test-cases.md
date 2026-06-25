# Test Cases: findings-parse-soundness

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 16
- **Manual**: 5
- **Priority**: must: 12, should: 9, could: 0

---

### TC-001: Single finding with `line: null` is retained

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `parseFindings` SHALL treat `line: null` as equivalent to `line` absent > Scenario: single finding with `line: null` is retained

---

### TC-002: Mixed findings array with one null-line entry

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `parseFindings` SHALL treat `line: null` as equivalent to `line` absent > Scenario: mixed findings array with one null-line entry

---

### TC-003: Non-null non-number `line` is still rejected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `parseFindings` SHALL treat `line: null` as equivalent to `line` absent > Scenario: non-null non-number `line` is still rejected

---

### TC-004: `parseFindings` and `parseObservations` accept the same set of `line` values

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `parseFindings` and `parseObservations` SHALL be symmetric on `line` acceptance > Scenario: `parseFindings` and `parseObservations` accept the same set of `line` values

---

### TC-005: Codex `tryExtractToolResult` with `line: null` in findings

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex runtime SHALL parse findings with `line: null` without null-stripping preprocessing > Scenario: codex `tryExtractToolResult` with `line: null` in findings

---

### TC-006: `verifyFindingRefs` — plain JSON array file is not classified as nonExistent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: managed `verifyFindingRefs` SHALL NOT classify regular JSON array files as directories > Scenario: file content is a plain JSON array

---

### TC-007: `verifyFindingRefs` — real GitHub directory listing is classified as nonExistent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: managed `verifyFindingRefs` SHALL NOT classify regular JSON array files as directories > Scenario: path is a real directory (GitHub listing format)

---

### TC-008: `verifyFindingRefs` — nonexistent file (API returns null) stays in nonExistent

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: managed `verifyFindingRefs` SHALL NOT classify regular JSON array files as directories > Scenario: file does not exist (API returns null)

---

### TC-009: Existing judge / review step tests pass after scores-path deletion

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: review-scores path SHALL be deleted; verdict derivation is unaffected > Scenario: existing judge / review step tests pass after deletion

---

### TC-010: `parseFindings` with valid numeric `line` preserves the value

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a findings array with one finding that has `line: 5` and all other required fields valid
**WHEN** `parseFindings` is called
**THEN** the result is `{ ok: true, value: [{ ..., line: 5 }] }` with `line` set to `5`

---

### TC-011: `parseFindings` with absent `line` field returns no `line` property on the finding

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a findings array with one finding that has no `line` key
**WHEN** `parseFindings` is called
**THEN** the result is `{ ok: true }` and the returned finding object has no `line` property

---

### TC-012: `parseObservations` with `line: null` retains the observation

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** an observations array where one observation has `line: null` and all other required fields valid
**WHEN** `parseObservations` is called
**THEN** the result is `{ ok: true }` and the observation is retained with no `line` field set

---

### TC-013: `parseObservations` with non-null non-number `line` is rejected

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** an observations array where one observation has `line: "bad"` (a string)
**WHEN** `parseObservations` is called
**THEN** the result is `{ ok: false }`

---

### TC-014: `stripNullDeep` is fully removed from the codex adapter

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** the edits to `src/adapter/codex/strict-schema.ts` and `src/adapter/codex/agent-runner.ts` are applied
**WHEN** a search for `stripNullDeep` is run across `src/`
**THEN** no occurrences are found in either file or anywhere else in `src/`

---

### TC-015: `isGitHubDirectoryListing` returns `false` for an empty JSON array

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** the input `[]` (empty array)
**WHEN** `isGitHubDirectoryListing` is called
**THEN** the return value is `false`

---

### TC-016: `isGitHubDirectoryListing` returns `false` for `null`

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** the input `null`
**WHEN** `isGitHubDirectoryListing` is called
**THEN** the return value is `false`

---

### TC-017: `isGitHubDirectoryListing` returns `false` for a non-array value

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** the input `{ name: "x" }` (an object, not an array)
**WHEN** `isGitHubDirectoryListing` is called
**THEN** the return value is `false`

---

### TC-018: Four dead review-scores files are deleted from the repository

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** the T-05 deletions are applied
**WHEN** the filesystem is inspected
**THEN** none of the following files exist:
- `src/core/parser/review-scores.ts`
- `src/kernel/review-scores.ts`
- `src/core/parser/review-findings.ts`
- `src/kernel/review-findings.ts`

---

### TC-019: No remaining imports of deleted types in `src/`

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** the T-05 deletions and edits to `src/core/port/step-types.ts` are applied
**WHEN** `src/` is searched for `ReviewScores`, `FindingSeverityCounts`, and `parseReviewScores`
**THEN** zero occurrences are found

---

### TC-020: `bun run typecheck` exits 0 after all changes

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** all changes from T-01 through T-07 are applied
**WHEN** `bun run typecheck` is executed
**THEN** the command exits with code 0 and no type errors are reported

---

### TC-021: `bun run test` exits 0 after all changes

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** all changes from T-01 through T-07 are applied
**WHEN** `bun run test` is executed
**THEN** the command exits with code 0 and all tests pass

---

## Result

```yaml
result: completed
total: 21
automated: 16
manual: 5
must: 12
should: 9
could: 0
blocked_reasons: []
```
