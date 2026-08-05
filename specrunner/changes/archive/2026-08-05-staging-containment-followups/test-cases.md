# Test Cases: staging containment follow-ups — staged byte-size guard + artifact hygiene discipline

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 13
- **Manual**: 0
- **Priority**: must: 12, should: 1, could: 0

---

### TC-030: Over-byte staged set halts before commit — file count under its own limit

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: A byte-size guard SHALL halt guarded staging before commit when the staged byte total exceeds `pipeline.maxStagedBytes` > Scenario: over-byte stage set halts before commit (file count under its own limit)

---

### TC-031: At-or-below byte threshold proceeds to commit and push normally

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: A byte-size guard SHALL halt guarded staging before commit when the staged byte total exceeds `pipeline.maxStagedBytes` > Scenario: at-or-below byte threshold commits and pushes as before

---

### TC-032: Delete-pending path contributes zero bytes and does not misfire the guard

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Staged-byte measurement SHALL lstat each staged path, treat not-in-worktree paths as zero, and SHALL NOT fail open on other measurement errors > Scenario: delete-pending path does not misfire the guard

---

### TC-033: Non-ENOENT measurement failure halts fail-closed before commit

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Staged-byte measurement SHALL lstat each staged path, treat not-in-worktree paths as zero, and SHALL NOT fail open on other measurement errors > Scenario: measurement failure fails closed

---

### TC-034: `stagedBytesLimitExceededError` carries correct code and actionable message (unit)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The byte-size halt error SHALL carry the total, the threshold, a size breakdown, and remedies, on the file-count guard's escalation path > Scenario: byte-limit error message is actionable

---

### TC-035: `DEFAULT_MAX_STAGED_BYTES` constant value and `resolveMaxStagedBytes` resolver defaults

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 (Acceptance Criteria)

**GIVEN** `DEFAULT_MAX_STAGED_BYTES` exported from `staging-containment.ts`, and `resolveMaxStagedBytes` called with `undefined`, `{}`, `{ pipeline: {} }`, and `{ pipeline: { maxStagedBytes: 104857600 } }`
**WHEN** the constant is read and the resolver is called with each input
**THEN** `DEFAULT_MAX_STAGED_BYTES === 52428800`; calls with `undefined`, `{}`, and `{ pipeline: {} }` all return `52428800`; call with `{ pipeline: { maxStagedBytes: 104857600 } }` returns `104857600`

---

### TC-036: `measureStagedBytes` sums sizes, treats ENOENT as zero, and fails closed on other errors (unit)

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 (Acceptance Criteria)

**GIVEN** a set of staged paths with (a) a probe that returns fixed sizes for all paths, (b) a probe that rejects with `{ code: "ENOENT" }` for one delete-pending path while returning sizes for others, and (c) a probe that rejects with a non-ENOENT error for one path
**WHEN** `measureStagedBytes` is called with each probe scenario
**THEN** (a) total equals the sum of the reported sizes; (b) the ENOENT path contributes `0` and the call resolves without error; (c) the non-ENOENT failure causes `measureStagedBytes` to reject (fail-closed — the error propagates)

---

### TC-037: `summarizeTopDirectoriesBySize` groups by first segment, sums bytes, sorts bytes-desc, and truncates to `topN`

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01 (Acceptance Criteria)

**GIVEN** entries `[{path:"vendor/a",bytes:30},{path:"vendor/b",bytes:10},{path:"src/x",bytes:5}]` passed to `summarizeTopDirectoriesBySize` with default `topN`, with `topN=1`, and with entries whose first segments have equal byte totals
**WHEN** `summarizeTopDirectoriesBySize` is called in each case
**THEN** (a) default: returns `[{dir:"vendor",bytes:40},{dir:"src",bytes:5}]` — first-segment grouping correct, per-group bytes summed, ordered bytes-descending; (b) `topN=1`: returns only `[{dir:"vendor",bytes:40}]`; (c) equal-byte tie: groups with the same byte total are ordered by directory name ascending

---

### TC-038: Invalid `pipeline.maxStagedBytes` values are rejected with `CONFIG_INVALID`

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `pipeline.maxStagedBytes` SHALL be a validated positive integer > Scenario: invalid maxStagedBytes is rejected

---

### TC-039: Valid and omitted `pipeline.maxStagedBytes` values validate successfully without injecting defaults

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `pipeline.maxStagedBytes` SHALL be a validated positive integer > Scenario: valid or omitted maxStagedBytes is accepted

---

### TC-040: Artifact-hygiene discipline wording is present in `COMMIT_DISCIPLINE` and all composed producer prompts

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The shared commit-discipline fragment SHALL instruct producer agents on generated-artifact hygiene > Scenario: artifact-hygiene discipline is present in producer prompts

---

### TC-041: Byte guard fires independently when file count is under its limit but byte total exceeds its limit

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The file-count guard and the byte-size guard SHALL be evaluated independently > Scenario: file count under limit but bytes over limit still halts

---

### TC-042: Over-byte halt error message contains total bytes, threshold, and per-directory size breakdown (integration)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The byte-size halt error SHALL carry the total, the threshold, a size breakdown, and remedies, on the file-count guard's escalation path > Scenario: byte-limit error message is actionable

---

## Result

```yaml
result: completed
total: 13
automated: 13
manual: 0
must: 12
should: 1
could: 0
blocked_reasons: []
```
