# Test Cases: bite-evidence test-file selection

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

- **Total**: 27 cases
- **Automated** (unit/integration): 24
- **Manual**: 3
- **Priority**: must: 16, should: 9, could: 2

---

## Selection Predicate

### TC-001: Non-test files are excluded from the materialized set

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A single test-file selection predicate governs materialized-test enumeration > Scenario: non-test files are excluded from the materialized set

### TC-002: Test-named files are included in the materialized set

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A single test-file selection predicate governs materialized-test enumeration > Scenario: test-named files are included

### TC-003: Pipeline artifacts remain excluded even when they match a pattern

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A single test-file selection predicate governs materialized-test enumeration > Scenario: pipeline artifacts remain excluded even when they match a pattern

---

## scopedTestPatterns Config

### TC-004: Default patterns apply when scopedTestPatterns is unset

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scopedTestPatterns is an opt-in glob config with a safe default > Scenario: default applies when unset

### TC-005: Configured patterns fully replace the default

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scopedTestPatterns is an opt-in glob config with a safe default > Scenario: configured patterns replace the default

---

## Config Validation

### TC-006: Empty array is rejected with CONFIG_INVALID

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scopedTestPatterns is validated as a non-empty array of non-empty strings > Scenario: empty array is rejected

### TC-007: Non-string element is rejected with CONFIG_INVALID

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scopedTestPatterns is validated as a non-empty array of non-empty strings > Scenario: non-string element is rejected

### TC-008: Valid patterns are preserved on the resolved config

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scopedTestPatterns is validated as a non-empty array of non-empty strings > Scenario: valid patterns are preserved

---

## Gate Verdict

### TC-009: Only non-test files in base commit yields strategy-deferred

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: an empty materialized selection defers the gate > Scenario: only non-test files in the base commit → deferred

### TC-010: Real biting test passes the gate

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: an empty materialized selection defers the gate > Scenario: real tooth still passes

### TC-011: Unfixed tooth fails the gate

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: an empty materialized selection defers the gate > Scenario: unfixed tooth still fails

### TC-014: Tamper mismatch still yields failed

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Wire the gate to the shared predicate and defer the empty set (Acceptance Criteria — tamper mismatch → failed unchanged)

**GIVEN** a forward-type job where the gate detects a tamper mismatch (a materialized test file's blob at the candidate commit differs from the base commit outside of the implementation phase)
**WHEN** the bite-evidence gate runs
**THEN** the verdict is `failed` (tamper mismatch behavior is unchanged by this change)

---

## Floor Tamper Check

### TC-012: Implementation edit of a non-test file is not tamper

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the floor's tamper check is scoped to test files only > Scenario: implementation edit of a non-test file is not tamper

### TC-013: Edit of a materialized test file is still tamper

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the floor's tamper check is scoped to test files only > Scenario: edit of a materialized test file is still tamper

---

## Structural: Shared Import Invariant

### TC-021: Both consumers import selectMaterializedTestFiles from test-file-selection.js

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: Guard the single-implementation-shared-via-imports invariant

**GIVEN** the source files `src/core/step/bite-evidence/gate.ts` and `src/core/archive/achieved-assurance.ts`
**WHEN** their import declarations are inspected
**THEN** both files contain an import of `selectMaterializedTestFiles` from a module specifier ending in `test-file-selection.js`

### TC-022: No local isExcludedPath body in consumers; gate.ts only re-exports it

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: Guard the single-implementation-shared-via-imports invariant

**GIVEN** the source files `src/core/archive/achieved-assurance.ts` and `src/core/step/bite-evidence/gate.ts`
**WHEN** their source text is scanned for a local `function isExcludedPath` definition
**THEN** `achieved-assurance.ts` contains no such local definition, and `gate.ts` only re-exports `isExcludedPath` rather than defining its own body (confirming the selection logic is not duplicated)

---

## matchesGlob Internals

### TC-015: `**/` prefix matches both root-level and nested paths

**Category**: unit
**Priority**: should
**Source**: design.md > D3: Bounded glob translation to RegExp, no dependency; tasks.md > T-02 Acceptance Criteria

**GIVEN** the glob pattern `**/*.test.*`
**WHEN** `matchesGlob` is called with `"foo.test.ts"` (no directory) and with `"a/b/foo.test.ts"` (nested)
**THEN** both calls return `true`; a call with `"src/lib.rs"` returns `false`

### TC-016: `*` does not cross a directory separator

**Category**: unit
**Priority**: should
**Source**: design.md > D3: Bounded glob translation to RegExp, no dependency; tasks.md > T-02 Acceptance Criteria

**GIVEN** the glob pattern `*.test.ts` (no `**/` prefix)
**WHEN** `matchesGlob` is called with `"foo.test.ts"` and with `"src/foo.test.ts"`
**THEN** `"foo.test.ts"` matches and `"src/foo.test.ts"` does not (single `*` stays within one path segment)

### TC-017: Literal `.` in a pattern is escaped and does not act as a regex wildcard

**Category**: unit
**Priority**: should
**Source**: design.md > D3: Bounded glob translation to RegExp, no dependency; tasks.md > T-02 Acceptance Criteria

**GIVEN** the glob pattern `**/*.test.*`
**WHEN** `matchesGlob` is called with `"foo_testXts"` (dot replaced with an arbitrary character)
**THEN** the call returns `false` (the literal `.` in `.test.` is not treated as a regex `.`)

### TC-018: `**` not followed by `/` matches across directory boundaries

**Category**: unit
**Priority**: should
**Source**: design.md > D3: Bounded glob translation to RegExp, no dependency (translation rule: `**` → `.*`)

**GIVEN** a glob pattern containing `**` not followed by `/` (e.g. `src/**test.ts`)
**WHEN** `matchesGlob` is called with a path that crosses directories to reach the suffix (e.g. `src/a/b/foo_test.ts`)
**THEN** the call returns `true` (globstar without trailing slash crosses segment boundaries)

---

## resolveScopedTestPatterns Edge Cases

### TC-019: Returns default when config is undefined

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: Create the shared test-file selection module (Acceptance Criteria — resolveScopedTestPatterns)

**GIVEN** `resolveScopedTestPatterns` is called with `undefined` as the config argument
**WHEN** the function executes
**THEN** it returns a copy of `DEFAULT_SCOPED_TEST_PATTERNS` (`["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`)

### TC-020: Returns default when config.verification is undefined

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: Create the shared test-file selection module (Acceptance Criteria — resolveScopedTestPatterns)

**GIVEN** a config object whose `verification` property is absent (or undefined)
**WHEN** `resolveScopedTestPatterns` is called with that config
**THEN** it returns a copy of `DEFAULT_SCOPED_TEST_PATTERNS`

---

## Config Validation — Additional Cases

### TC-023: Field absent validates unchanged (no default injected at config layer)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03/T-04: Add and validate the scopedTestPatterns config field (Acceptance Criteria)

**GIVEN** a config whose `verification` block does not include `scopedTestPatterns`
**WHEN** the config is validated
**THEN** validation succeeds and the resolved config has `scopedTestPatterns` absent (no default value is injected by the schema layer)

### TC-024: Empty-string element in the array is rejected with CONFIG_INVALID

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Add and validate the scopedTestPatterns config field (Acceptance Criteria — nonEmptyString validation)

**GIVEN** a config with `verification.scopedTestPatterns: [""]` (array containing one empty string)
**WHEN** the config is validated
**THEN** validation throws an error with `code: "CONFIG_INVALID"`

---

## Documentation

### TC-025: docs/configuration.md documents scopedTestPatterns with required content

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-08: Document scopedTestPatterns

**GIVEN** the file `docs/configuration.md` after the change is applied
**WHEN** the Verification section is reviewed
**THEN** a subsection for `verification.scopedTestPatterns` is present that states: the default patterns (`["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`); that patterns select which materialized files are run per-file during bite evidence; that it pairs with `scopedTestCommand`; that configured patterns fully replace the default; and a note that polyglot / non-standard-naming repos should override the default

---

## Dependency and Diff Guard

### TC-026: No new runtime dependency added to package.json

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-09: Full verification and dependency guard; request.md > 受け入れ基準

**GIVEN** the git diff of `package.json` and the lockfile after implementing the change
**WHEN** the diff is inspected
**THEN** no new runtime dependency appears (no glob library such as picomatch or minimatch was added)

### TC-027: Protected files are unchanged in the diff

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-09: Full verification and dependency guard

**GIVEN** the git diff after implementing the change
**WHEN** the diff is inspected for `.specrunner/config.json`, `src/core/port/runtime-strategy.ts`, and `src/core/runtime/local.ts`
**THEN** none of those three files appears in the diff (they are unmodified)

---

## Result

```yaml
result: completed
total: 27
automated: 24
manual: 3
must: 16
should: 9
could: 2
blocked_reasons: []
```
