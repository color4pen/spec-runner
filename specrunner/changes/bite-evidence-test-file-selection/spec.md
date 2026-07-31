# Spec: bite-evidence test-file selection

## Requirements

### Requirement: A single test-file selection predicate governs materialized-test enumeration

The system SHALL derive "materialized test files" from a base commit's changed files via a single
predicate that requires BOTH conditions: the path is NOT a pipeline artifact
(`specrunner/changes/` or `.specrunner/`), AND the path matches at least one configured test-file
glob pattern. A path failing either condition MUST NOT be treated as a materialized test file. The
bite-evidence gate and the archive floor derivation SHALL both obtain their materialized-test set
from this one predicate implementation.

#### Scenario: non-test files are excluded from the materialized set

**Given** a base commit whose changed files include `fixtures/data.json`, `package.json`,
`src/lib.rs`, and `src/feature/index.ts`
**When** the materialized test files are selected with default patterns
**Then** none of those four paths is in the selected set

#### Scenario: test-named files are included

**Given** a base commit whose changed files include `src/foo.test.ts`, `pkg/bar.spec.ts`, and
`mod/baz_test.ts`
**When** the materialized test files are selected with default patterns
**Then** all three paths are in the selected set

#### Scenario: pipeline artifacts remain excluded even when they match a pattern

**Given** a base commit whose changed files include `specrunner/changes/x/a.test.md` and
`src/real.test.ts`
**When** the materialized test files are selected
**Then** only `src/real.test.ts` is selected

### Requirement: scopedTestPatterns is an opt-in glob config with a safe default

`VerificationConfig` SHALL accept an optional `scopedTestPatterns` array of glob strings. When
absent, the selection predicate MUST use the default patterns
`["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`. When present and non-empty, the configured
patterns MUST fully replace the default (not merge with it). Glob matching MUST be implemented
without adding a new runtime dependency.

#### Scenario: default applies when unset

**Given** a config whose `verification` does not declare `scopedTestPatterns`
**When** files `src/a.test.ts` (test-named) and `src/a.rs` (non-test) are selected
**Then** `src/a.test.ts` is selected and `src/a.rs` is not

#### Scenario: configured patterns replace the default

**Given** a config with `verification.scopedTestPatterns: ["**/*.spec.rb"]`
**When** files `spec/model_spec.rb` and `src/a.test.ts` are selected
**Then** `spec/model_spec.rb` is selected and `src/a.test.ts` is not

### Requirement: scopedTestPatterns is validated as a non-empty array of non-empty strings

Configuration validation SHALL reject `verification.scopedTestPatterns` when it is an empty array
or contains any non-string / empty-string element, raising a `CONFIG_INVALID` error. A valid,
non-empty array of non-empty strings MUST be preserved on the resolved config.

#### Scenario: empty array is rejected

**Given** a config with `verification.scopedTestPatterns: []`
**When** the config is validated
**Then** validation throws an error with code `CONFIG_INVALID`

#### Scenario: non-string element is rejected

**Given** a config with `verification.scopedTestPatterns: ["**/*.test.ts", 42]`
**When** the config is validated
**Then** validation throws an error with code `CONFIG_INVALID`

#### Scenario: valid patterns are preserved

**Given** a config with `verification.scopedTestPatterns: ["**/*.test.ts"]`
**When** the config is validated
**Then** validation succeeds and `verification.scopedTestPatterns` equals `["**/*.test.ts"]`

### Requirement: an empty materialized selection defers the gate

When the bite-evidence gate's materialized-test selection is empty (no changed file survives the
predicate), the gate SHALL return the `strategy-deferred` verdict with empty records, NOT `failed`.
The `failed` verdict MUST be reserved for a base/candidate measurement that does not bite (hollow
or unfixed) or for a tamper mismatch.

#### Scenario: only non-test files in the base commit → deferred

**Given** a forward-type job whose base commit changed only `package.json` and `src/lib.rs`
**When** the bite-evidence gate runs
**Then** the verdict is `strategy-deferred` and records are empty

#### Scenario: real tooth still passes

**Given** a forward-type job with a materialized `*.test.ts` file that is base-red and
candidate-green
**When** the bite-evidence gate runs
**Then** the verdict is `passed` with a verified record

#### Scenario: unfixed tooth still fails

**Given** a forward-type job with a materialized `*.test.ts` file that is base-red and
candidate-red
**When** the bite-evidence gate runs
**Then** the verdict is `failed`

### Requirement: the floor's tamper check is scoped to test files only

The archive floor derivation SHALL enumerate materialized test files with the same selection
predicate and perform its blob-freeze / tamper check only over that test-file set. A non-test file
that is present in the base commit and edited before the final archive HEAD MUST NOT cause a tamper
determination. An edit to a materialized test file between the base commit and the final HEAD MUST
still cause a tamper determination (leaving the constrained dimensions absent).

#### Scenario: implementation edit of a non-test file is not tamper

**Given** a base commit containing `src/feature.test.ts` and `src/feature/index.ts`
**And** `src/feature/index.ts` is edited between the base commit and the final HEAD while
`src/feature.test.ts` is byte-identical, base-red, and HEAD-green
**When** the floor derivation runs with `biteEvidence` constrained
**Then** no tamper is reported and `biteEvidence` is achieved

#### Scenario: edit of a materialized test file is still tamper

**Given** a base commit containing `src/feature.test.ts`
**And** `src/feature.test.ts` differs between the base commit and the final HEAD
**When** the floor derivation runs with `biteEvidence` constrained
**Then** tamper is reported and `biteEvidence` is absent
