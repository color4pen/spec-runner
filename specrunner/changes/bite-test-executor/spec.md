# Spec: isolated scoped test execution for bite evidence

## Requirements

### Requirement: Isolated execution resolves dependencies from the job worktree

`runTestsAtCommit` SHALL make the job worktree's dependencies available inside the isolated
detached worktree before running any test, by creating a `node_modules` symlink in the isolated
worktree that points at the job worktree's (`cwd`) `node_modules`. When the job worktree has no
`node_modules`, the scoped execution MUST return `unavailable` and MUST NOT run any test
(fail-closed). The symlinked (source) `node_modules` MUST NOT be deleted by the run's cleanup.

#### Scenario: dependency-requiring test passes when node_modules is linked

**Given** a real git repo whose test file imports a dependency present only in `<cwd>/node_modules`
**And** a config with custom `verification.commands` and a `scopedTestCommand`
**When** `runTestsAtCommit` runs that test file at its commit OID
**Then** the result is `{ kind: "ran" }` with the file's `passed` reflecting the real exit code
**And** the job worktree's `node_modules` still exists after the run

#### Scenario: missing node_modules fails closed

**Given** a job worktree (`cwd`) that has no `node_modules`
**And** a config with a `scopedTestCommand`
**When** `runTestsAtCommit` is asked to run a materialized test file
**Then** the result is `{ kind: "unavailable" }` and no test is executed

### Requirement: scopedTestCommand is an opt-in, provider-neutral config field

`VerificationConfig` SHALL accept an optional `scopedTestCommand` string, validated as a non-empty
string when present and ignored when absent. Its meaning SHALL be: a command to which one or more
test-file paths are appended as trailing arguments and which runs only those files.

#### Scenario: config with scopedTestCommand validates

**Given** a project config whose `verification` declares `commands` and a non-empty
`scopedTestCommand`
**When** the config is validated
**Then** validation succeeds and `verification.scopedTestCommand` is preserved on the resolved
config

#### Scenario: config without scopedTestCommand validates unchanged

**Given** a project config whose `verification` declares only `commands`
**When** the config is validated
**Then** validation succeeds and `verification.scopedTestCommand` is absent

### Requirement: Custom commands run per file only when scopedTestCommand is set

When `config.verification.scopedTestCommand` is set, `runTestsAtCommit` SHALL NOT bail on the
presence of custom `verification.commands`; it MUST run each provided test file individually as
`<scopedTestCommand> <file>` inside the isolated worktree, resolving the runner from the isolated
worktree's `node_modules/.bin` on `PATH`, and MUST report one `{ file, passed }` per file where
`passed` is true iff the invocation exits 0. When `scopedTestCommand` is unset and custom
`verification.commands` are present, `runTestsAtCommit` MUST return `unavailable` (backward
compatibility, fail-closed).

#### Scenario: opt-in enables scoped execution under custom commands

**Given** a real git repo with materialized test files
**And** a config with custom `verification.commands` and a `scopedTestCommand`
**When** `runTestsAtCommit` runs those test files at a commit OID
**Then** the result is `{ kind: "ran" }` with a per-file `passed` for every file

#### Scenario: custom commands without opt-in stay unavailable

**Given** a config with custom `verification.commands` and no `scopedTestCommand`
**When** `runTestsAtCommit` is called
**Then** the result is `{ kind: "unavailable" }`

#### Scenario: partial pass is identified per file

**Given** materialized test files where some pass and some fail at a commit OID under the
`scopedTestCommand`
**When** `runTestsAtCommit` runs them
**Then** each file's `passed` independently reflects that file's own exit code

### Requirement: Cleanup and never-throw are preserved

`runTestsAtCommit` SHALL never throw; every failure (spawn error, failed `worktree add`,
non-existent OID, missing `node_modules`) MUST be returned as `{ kind: "unavailable" }`. The
isolated worktree and its `node_modules` symlink MUST be removed in a finally-style cleanup on every
path, including when tests fail.

#### Scenario: worktree and symlink are cleaned up after a run

**Given** a `runTestsAtCommit` scoped run over a real repo
**When** the run completes (whether the tests passed or failed)
**Then** no `specrunner-bite-evidence` worktree remains registered
**And** the isolated worktree directory (including its `node_modules` symlink) is gone

#### Scenario: non-existent OID never throws

**Given** an OID that does not exist in the repo
**When** `runTestsAtCommit` is called with a test file
**Then** it returns `{ kind: "unavailable" }` without throwing

### Requirement: The bite tooth bites green end-to-end via the real runtime

With `scopedTestCommand` configured, when a materialized test is red at the base OID and green at
the candidate OID, the in-loop bite-evidence gate SHALL produce a verified `biteEvidence` record and
the archive floor derivation SHALL treat `biteEvidence` as achieved — driven by real
`LocalRuntime` execution results, not by a fake runtime.

#### Scenario: base-red, candidate-green yields achieved bite evidence

**Given** a real git repo where a materialized test file fails at the base commit (implementation
absent) and passes at the candidate commit (implementation present)
**And** a config with custom `verification.commands` and a `scopedTestCommand`, run through a real
`LocalRuntime`
**When** the bite-evidence gate runs the test at both OIDs
**Then** the per-file record is base `red`, candidate `green`, `verified` true
**And** the archive floor derivation records `biteEvidence` as achieved for that job
