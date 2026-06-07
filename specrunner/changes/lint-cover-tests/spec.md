# Spec: eslint covers tests/

## Requirements

### Requirement: lint target includes the tests directory

The lint configuration SHALL include test sources (`tests/**`, `**/*.test.ts`, `**/__tests__/**`) in the lint scope so that test code is analyzed under the same rule set as `src`. The eslint `ignores` MUST NOT list those test globs, and the `lint` script MUST target both `./src` and `./tests`.

#### Scenario: lint walks test files

**Given** the eslint `ignores` no longer contains `tests/**`, `**/*.test.ts`, or `**/__tests__/**`, and the `lint` script targets `./src ./tests`
**When** `bun run lint` runs
**Then** files under `tests/` are analyzed rather than skipped

### Requirement: combined lint gate is green

After remediation, `bun run lint` with `--max-warnings 0` MUST exit 0 for the combined `src` + `tests` scope, with zero errors and zero warnings.

#### Scenario: lint passes across src and tests

**Given** the surfaced test-code violations have been remediated and any required tests-scoped override is in place
**When** `bun run lint` runs with `--max-warnings 0`
**Then** it exits 0 and reports no errors and no warnings

### Requirement: rule relaxations are tests-scoped and documented

Any relaxation of a lint rule for tests SHALL be confined to a tests-scoped override block (its `files` limited to the test globs) and MUST record the relaxed range and the reason in the config. Rules MUST NOT be disabled globally, and the strictness applied to `src` MUST remain unchanged.

#### Scenario: a relaxed rule is auditable in config

**Given** a rule is relaxed because a legitimate test idiom is otherwise unfairly flagged
**When** the eslint config is inspected
**Then** the relaxation appears only inside a tests-scoped `files` block accompanied by an inline reason, and the rules applied to `src` are unchanged

#### Scenario: no relaxation when fixes suffice

**Given** every surfaced violation can be resolved by editing test code
**When** the change is implemented
**Then** no rule is relaxed and no tests-scoped override loosening is added

### Requirement: no test regression

The change MUST NOT alter the behavior or count of tests. `bun run typecheck && bun run test` SHALL remain green after the change.

#### Scenario: typecheck and tests remain green

**Given** the lint remediation edits only touch style and unused-symbol issues in test code
**When** `bun run typecheck && bun run test` runs
**Then** both succeed and the number of executed tests is unchanged (no tests skipped, removed, or added as a side effect)
