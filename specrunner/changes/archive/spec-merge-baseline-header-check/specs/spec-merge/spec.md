## ADDED Requirements

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
