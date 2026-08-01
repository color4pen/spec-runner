# Test Cases: guarded staging build-artifact containment

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

- **Total**: 22 cases
- **Automated** (unit/integration): 21
- **Manual**: 1
- **Priority**: must: 19, should: 3, could: 0

---

## Group A: Exclusion filtering (guarded staging)

### TC-001: Untracked artifact trees excluded when `stagingExcludePatterns` configured

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Guarded staging SHALL exclude paths matching `pipeline.stagingExcludePatterns` > Scenario: untracked artifact trees are excluded when configured

### TC-002: No exclusion configured — all changed paths staged (legacy behavior)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Guarded staging SHALL exclude paths matching `pipeline.stagingExcludePatterns` > Scenario: no exclude patterns configured stages everything (legacy)

---

## Group B: Write-scope enforcement precedes exclusion

### TC-003: Exclude pattern on canon path does not suppress write-scope violation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Write-scope enforcement SHALL precede exclusion > Scenario: exclude pattern covering a canon path does not open a fail-open

---

## Group C: Volume guard

### TC-004: Over-threshold stage set halts with actionable message before commit

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: A volume guard SHALL halt guarded staging before commit when the stage count exceeds `pipeline.maxStagedFiles` > Scenario: over-threshold stage set halts with an actionable message

### TC-005: At-or-below threshold commits and pushes as before

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: A volume guard SHALL halt guarded staging before commit when the stage count exceeds `pipeline.maxStagedFiles` > Scenario: at-or-below threshold commits as before

### TC-006: Exclusion brings over-limit set under threshold — no halt

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: A volume guard SHALL halt guarded staging before commit when the stage count exceeds `pipeline.maxStagedFiles` > Scenario: exclusion brings an otherwise-over-limit set under the threshold

---

## Group D: Config validation

### TC-007: Invalid `stagingExcludePatterns` and `maxStagedFiles` values rejected with CONFIG_INVALID

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `pipeline.stagingExcludePatterns` and `pipeline.maxStagedFiles` SHALL be validated > Scenario: invalid staging config is rejected

### TC-008: Valid staging config accepted; omitted fields validate without defaults injected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `pipeline.stagingExcludePatterns` and `pipeline.maxStagedFiles` SHALL be validated > Scenario: valid staging config is accepted

---

## Group E: Shared `matchesGlob` implementation

### TC-009: Both bite-evidence and staging-containment import `matchesGlob` from shared `glob-match.js`

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `matchesGlob` SHALL be a single shared implementation > Scenario: both consumers import the single implementation

---

## Group F: Containment module — pure function unit tests

### TC-010: `applyStagingExclusions` with empty patterns returns all paths unchanged

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `applyStagingExclusions` is called with a non-empty `paths` array and an empty `excludePatterns` array `[]`
**WHEN** the function returns
**THEN** the returned array equals the input `paths` array with no elements removed

### TC-011: `resolveMaxStagedFiles` returns default 2000 when config absent or has no pipeline block

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `resolveMaxStagedFiles` is called with `undefined` or with `{}` (no `pipeline` key)
**WHEN** the function returns
**THEN** the return value is `2000`

### TC-012: `resolveMaxStagedFiles` returns configured value when `pipeline.maxStagedFiles` is set

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `resolveMaxStagedFiles` is called with `{ pipeline: { maxStagedFiles: 5000 } }`
**WHEN** the function returns
**THEN** the return value is `5000`

### TC-013: `resolveStagingExcludePatterns` returns `[]` when field is absent

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `resolveStagingExcludePatterns` is called with `undefined` or a config with no `pipeline.stagingExcludePatterns` field
**WHEN** the function returns
**THEN** the return value is an empty array `[]`

### TC-014: `resolveStagingExcludePatterns` returns a copy of the configured array when present

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `resolveStagingExcludePatterns` is called with `{ pipeline: { stagingExcludePatterns: ["vendor/**", ".cargo-tmp/**"] } }`
**WHEN** the function returns
**THEN** the return value contains exactly `["vendor/**", ".cargo-tmp/**"]` (order preserved) and is a distinct array reference from the config value

### TC-015: `summarizeTopDirectories` groups by first path segment, sorts by count descending

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 / T-03 Acceptance Criteria

**GIVEN** `summarizeTopDirectories` is called with a mixed paths array: 3 files under `vendor/`, 2 under `.cargo-tmp/`, 1 under `src/`, and 1 path with no `/` (groups under `"."`)
**WHEN** the function returns
**THEN** the result array is ordered `vendor (3)`, `.cargo-tmp (2)`, `src (1)`, `. (1)` (ties broken by dir name ascending), and each entry has `{ dir, count }` shape

### TC-016: `summarizeTopDirectories` truncates to `topN` entries

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / T-03 Acceptance Criteria

**GIVEN** `summarizeTopDirectories` is called with paths spanning more than `topN` distinct first segments, and `topN = 2`
**WHEN** the function returns
**THEN** the result array has exactly 2 entries (the 2 highest-count directories)

### TC-017: `stagingLimitExceededError` message includes total count, top-directory breakdown, and both remedy hints

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `stagingLimitExceededError("implementer", "branch", 48000, 2000, [{ dir: ".cargo-tmp", count: 24000 }, { dir: "vendor", count: 20000 }])` is called
**WHEN** the error is constructed
**THEN** `error.code === "STAGING_LIMIT_EXCEEDED"`, the message string contains `48000`, `2000`, `.cargo-tmp`, `24000`, the text for declaring `stagingExcludePatterns` or `.gitignore`, and the text for raising `maxStagedFiles`

---

## Group G: Integration wiring tests

### TC-018: Guarded git status call includes `--untracked-files=all`

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 / T-06 Acceptance Criteria; design.md > D5

**GIVEN** a guarded step (e.g. `implementer`) is driven through `commitAndPush` with a fake spawn function that records git invocations
**WHEN** `commitAndPush` executes the guarded branch
**THEN** the recorded `git status` call arguments include `--untracked-files=all`

### TC-019: `matchesGlob` correctly handles `**/` prefix, `*` non-path-crossing, and `vendor/**` dir-prefix

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** the shared `matchesGlob` function imported from `src/util/glob-match.ts`
**WHEN** called with representative patterns:
- `matchesGlob("foo/bar/baz.test.ts", "**/*.test.ts")` → should match
- `matchesGlob("foo/bar.ts", "*.ts")` → should NOT match (cross path separator)
- `matchesGlob("vendor/lodash/index.js", "vendor/**")` → should match
- `matchesGlob(".cargo-tmp/registry/cache.json", "**/.cargo-tmp/**")` → should match
**THEN** each assertion holds as described

### TC-020: Scoped staging path is unaffected by new `pipeline.stagingExcludePatterns` / `maxStagedFiles` config

**Category**: integration
**Priority**: should
**Source**: design.md > Non-Goals; tasks.md > T-05 constraints

**GIVEN** a scoped step (not in `GUARDED_WRITE_STEPS`) is driven through `commitAndPush` with a config containing `pipeline.stagingExcludePatterns` and `pipeline.maxStagedFiles`
**WHEN** `commitAndPush` executes the scoped branch
**THEN** the scoped git call sequence is unchanged (no `--untracked-files=all` in git status, no exclusion filtering, no volume guard halt), and commit + push proceed as before

---

## Group H: Dependency and structural guards

### TC-021: No new runtime dependency added to `package.json`

**Category**: manual
**Priority**: must
**Source**: request.md > 受け入れ基準; tasks.md > T-11 Acceptance Criteria

**GIVEN** the implementation is complete
**WHEN** `package.json` and the lockfile are inspected (e.g. via `git diff main -- package.json`)
**THEN** no new entry appears under `dependencies` (runtime dependencies are unchanged); `devDependencies` changes are acceptable if any, but `dependencies` must be unmodified

### TC-022: `matchesGlob` re-export through `test-file-selection.ts` keeps existing tests passing

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/core/step/bite-evidence/test-file-selection.ts` no longer defines a local `matchesGlob` body but re-exports it from `../../util/glob-match.js`
**WHEN** the existing `src/core/step/bite-evidence/__tests__/test-file-selection.test.ts` is run unmodified
**THEN** all test cases that import or use `matchesGlob` from `./test-file-selection.js` pass green without any change to the test file

---

## Result

```yaml
result: completed
total: 22
automated: 21
manual: 1
must: 19
should: 3
could: 0
blocked_reasons: []
```
