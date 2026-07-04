# Spec: package.json scripts integrity — 新規 script 追加を tampering としない

## Requirements

### Requirement: Scripts integrity is evaluated per baseline key

The verification phase-fallback scripts integrity gate SHALL classify a change to the
worktree's `package.json` scripts as tampering only when a script key that exists in the
baseline (`origin/<baseBranch>:package.json`) is **modified** (its value differs from the
baseline value) or **removed** (absent from the current worktree scripts). Script keys that
exist only in the current worktree (newly added keys) MUST NOT be classified as tampering.
This SHALL hold whether the baseline scripts section is empty (missing or `{}`) or non-empty.
When no baseline key is modified or removed, the gate MUST allow verification to proceed to
the phase-execution loop.

#### Scenario: adding a new script key to an empty baseline is allowed

**Given** the baseline `package.json` has no scripts (or an empty scripts object)
**And** the current worktree adds one or more new script keys (e.g. `build`, `test`)
**When** the phase-fallback verification integrity gate runs with the base branch
**Then** the change is not classified as tampering
**And** verification proceeds to the phase-execution loop instead of failing with `PACKAGE_JSON_SCRIPTS_TAMPERED`

#### Scenario: adding a new script key to a non-empty baseline is allowed

**Given** the baseline `package.json` already has one or more scripts, all unchanged in the current worktree
**And** the current worktree adds a new script key not present in the baseline
**When** the phase-fallback verification integrity gate runs with the base branch
**Then** the change is not classified as tampering
**And** verification proceeds to the phase-execution loop

#### Scenario: changing an existing script value is tampering

**Given** a script key that exists in the baseline `package.json`
**When** the current worktree changes that key's value (e.g. `"test": "vitest"` → `"test": "exit 0"`)
**Then** the change is classified as tampering
**And** verification fails immediately with `PACKAGE_JSON_SCRIPTS_TAMPERED` without running any phase

#### Scenario: deleting an existing script key is tampering

**Given** a script key that exists in the baseline `package.json`
**When** the current worktree removes that key from the scripts section
**Then** the change is classified as tampering
**And** verification fails immediately with `PACKAGE_JSON_SCRIPTS_TAMPERED` without running any phase

### Requirement: Existing integrity gate skip and scope behavior is preserved

The scripts integrity gate SHALL preserve its existing skip and scope semantics. When the
baseline `package.json` cannot be retrieved from the base branch, the gate MUST skip the
check and allow verification to proceed. The gate MUST continue to run only on the
phase-fallback verification path and MUST NOT run on the `verification.commands` path.
Differences in script key ordering between the baseline and the current worktree MUST NOT be
classified as tampering.

#### Scenario: baseline package.json absent on base branch skips the gate

**Given** the base branch has no `package.json` (retrieving the baseline fails)
**When** the phase-fallback verification integrity gate runs with the base branch
**Then** the gate is skipped and verification proceeds to the phase-execution loop

#### Scenario: reordered script keys with identical values are not tampering

**Given** the baseline and current `package.json` contain the same script keys with the same values in a different key order
**When** the phase-fallback verification integrity gate runs with the base branch
**Then** the change is not classified as tampering
**And** verification proceeds to the phase-execution loop

### Requirement: Tampering diff surfaces only the offending keys

When tampering is detected, the failure diff written to the verification result SHALL
identify only the baseline script keys that were changed or removed. It MUST NOT list
newly added keys as tampering. For each offending key, the diff MUST make the baseline value
and the current value distinguishable so a reader can see why the change was flagged.

#### Scenario: a mixed change surfaces only the changed key, not the added key

**Given** the current worktree both adds a new script key and changes the value of an existing baseline key
**When** the integrity gate detects tampering
**Then** verification fails with `PACKAGE_JSON_SCRIPTS_TAMPERED`
**And** the failure diff identifies the changed baseline key
**And** the failure diff does not present the newly added key as tampering
