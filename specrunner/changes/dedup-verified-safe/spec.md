# Spec: dedup-verified-safe

## Requirements

### Requirement: run and job-start commands produce identical runtime behavior

The `specrunner run` and `specrunner job start` commands SHALL produce identical runtime behavior for all inputs, and their `--help` output SHALL retain the respective positional labels `request.md|slug` and `slug|file`.

#### Scenario: same slug input produces same behavior

**Given** a valid request slug
**When** invoked via `specrunner run <slug>` and separately via `specrunner job start <slug>`
**Then** both commands execute the same pipeline with the same arguments and exit with the same code

#### Scenario: help output preserves positional labels

**Given** either command
**When** `--help` is passed
**Then** `run --help` shows `request.md|slug` and `job start --help` shows `slug|file`

---

### Requirement: verification skip strings are preserved byte-for-byte

The verification result markdown written by `runVerificationCommands` SHALL contain the string `_(skipped — previous command failed)_` for skipped phases, and the result written by `runVerificationPhases` SHALL contain `_(skipped — previous phase failed)_`. Neither string SHALL change.

#### Scenario: command path skip string

**Given** `verification.commands` is configured and the first command fails
**When** the second command is evaluated
**Then** the phase result's `stdout` field is exactly `_(skipped — previous command failed)_`

#### Scenario: phase path skip string

**Given** `verification.commands` is not configured and the build phase fails
**When** the typecheck phase is evaluated
**Then** the phase result's `stdout` field is exactly `_(skipped — previous phase failed)_`

---

### Requirement: deleted symbols are absent from the codebase

The symbols `computeCodeReviewIteration`, `computeSpecReviewIteration`, `computeRequestReviewIteration`, `computeConformanceIteration`, and `PROBE_SLUG` SHALL NOT appear as code references (imports, calls, declarations) in `src/` or `tests/` after this change. Exempt: description-string mentions inside pre-existing unmodified test files, and string literals inside the deletion-guard test that asserts their absence.

#### Scenario: grep check

**Given** the change is merged
**When** `grep -r computeCodeReviewIteration src/ tests/` is run (and for each other symbol)
**Then** no matches are found
