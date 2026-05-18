## Purpose

TBD
## Requirements

### Requirement: delta apply skip/fail is determined by request type

`mergeSpecsForChange` SHALL consult `request.md` at the start of execution to determine the request type. The type MUST be read and parsed via `parseRequestMdContent` before any filesystem checks on `specs/`. If `request.md` is absent, unparseable, or missing the `type` field, execution MUST fail with an escalation message. If the type value is not present in `TYPE_CONFIG` (the canonical set of known types), execution MUST fail.

Skip/fail rules for the effective absence of `specs/` (directory absent or directory present with 0 capability subdirectories):

- Type `spec-change` or `new-feature`: MUST fail with an escalation message indicating that a delta spec is required for this type.
- Type `bug-fix`, `refactoring`, or `chore`: MUST return `{ ok: true, skipped: true }` (normal skip, no error).
- Any other type not in `TYPE_CONFIG`: MUST fail as an unknown type.

#### Scenario: spec-change with no specs/ directory fails

- **GIVEN** `request.md` has type `spec-change`
- **WHEN** `mergeSpecsForChange` is called and `specs/` directory does not exist in the change folder
- **THEN** `{ ok: false }` is returned with an escalation message referencing the missing delta spec

#### Scenario: bug-fix with no specs/ directory skips normally

- **GIVEN** `request.md` has type `bug-fix`
- **WHEN** `mergeSpecsForChange` is called and `specs/` directory does not exist in the change folder
- **THEN** `{ ok: true, skipped: true }` is returned with no error

### Requirement: empty delta (0 entries) is a fatal error

After parsing a capability's delta spec file, `mergeSpecsForChange` MUST check that the total count of `added + modified + removed` requirements is greater than zero. A delta spec file that parses successfully but contains no requirement entries SHALL be treated as a semantic error and MUST cause the capability's merge to fail with an error message indicating that the delta is empty.

This check MUST be performed before `validateDeltaSpec` (format validation) and before any baseline read or merge operations.

#### Scenario: empty delta fails with capability name in escalation

- **GIVEN** `specs/<cap>/spec.md` exists but contains no `## ADDED`, `## MODIFIED`, or `## REMOVED` sections with requirement blocks
- **WHEN** `mergeSpecsForChange` processes the capability
- **THEN** `{ ok: false }` is returned and the escalation message references the capability name and the empty delta condition

### Requirement: cross-capability delta apply is atomic

`mergeSpecsForChange` MUST use a two-pass approach:

- Pass 1: parse, validate, and compute merged content for all capabilities without writing any files.
- Pass 2: write all merged files to disk and call `git add`, but only if Pass 1 succeeded for every capability.

If any capability fails during Pass 1 (parse error, empty delta, validation error, or merge conflict), MUST NOT write any files to disk. All capability errors MUST be collected and reported together in a single escalation message (no early exit on first error).

#### Scenario: one failing capability blocks all writes

- **GIVEN** two capabilities `cap-a` (valid delta) and `cap-b` (empty delta)
- **WHEN** `mergeSpecsForChange` processes both
- **THEN** `{ ok: false }` is returned and `fs.writeFile` is called 0 times (cap-a write is also suppressed)

### Requirement: TYPE_CONFIG is the authoritative source for known request types

The set of known request types and their apply policies SHALL be derived from `src/config/type-config.ts` `TYPE_CONFIG`. Hardcoded type strings in `spec-merge.ts` MUST be validated against `TYPE_CONFIG` at runtime: if a type is present in `TYPE_CONFIG` but not in the `SPEC_REQUIRED_TYPES` or `SPEC_OPTIONAL_TYPES` sets, execution MUST fail rather than silently skip or apply.

#### Scenario: unknown type fails with type name in escalation

- **GIVEN** `request.md` has type `"unknown-type"` which is not in `TYPE_CONFIG`
- **WHEN** `mergeSpecsForChange` is called
- **THEN** `{ ok: false }` is returned and the escalation message contains `"unknown-type"`

### Requirement: baseline header consistency check before merge application

`mergeSpecsForChange` MUST perform a baseline header consistency check for each capability before calling `applyMerge`. The check SHALL compare delta requirement header names against baseline requirement header names using normalized matching (markdown decoration stripped, whitespace trimmed, case preserved).

Violation rules:
- MODIFIED or REMOVED header whose normalized name does not exist in the baseline's normalized requirement names SHALL produce a violation.
- MODIFIED or REMOVED header when no baseline file exists SHALL produce a violation.
- ADDED header whose normalized name already exists in the baseline's normalized requirement names SHALL produce a violation (duplicate detection).

If one or more violations are detected, the capability's merge MUST be skipped (no call to `applyMerge`) and the violations MUST be collected into the cross-capability error list for escalation. The existing `applyMerge` exact-match checks are retained as defense-in-depth.

#### Scenario: MODIFIED header not in baseline triggers early escalation

- **GIVEN** a delta spec with `## MODIFIED Requirements` containing `### Requirement: Foo` and the baseline does not contain a requirement named `Foo`
- **WHEN** `mergeSpecsForChange` processes the capability
- **THEN** a violation is reported and `applyMerge` is not called for that capability

#### Scenario: ADDED duplicate detected before merge

- **GIVEN** a delta spec with `## ADDED Requirements` containing `### Requirement: Bar` and the baseline already contains `### Requirement: Bar`
- **WHEN** `mergeSpecsForChange` processes the capability
- **THEN** a violation is reported with "duplicate" indication

#### Scenario: normalized matching tolerates markdown decoration

- **GIVEN** a delta header `### Requirement: **Foo**` and a baseline header `### Requirement: Foo`
- **WHEN** the consistency check compares them
- **THEN** they are treated as matching (no violation)
