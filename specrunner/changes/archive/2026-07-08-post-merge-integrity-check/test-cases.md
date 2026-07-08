# Test Cases: post-merge-integrity-check

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 30
- **Manual**: 4
- **Priority**: must: 26, should: 7, could: 1

---

## CFG: Config schema & validation

### TC-001: Absent `archive.postMergeVerify` key passes validation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Post-merge integrity command is configurable > Scenario: Absent config preserves legacy behavior

### TC-002: Empty array `[]` passes validation and is treated as no-op

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `archive.postMergeVerify` is explicitly set to `[]`
**WHEN** the config is validated
**THEN** validation succeeds and the value is treated as equivalent to the absent key (no integrity check)

### TC-003: String-form `ShellCommand` array passes validation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Post-merge integrity command is configurable > Scenario: Valid command list passes validation

### TC-004: Object-form `{ name?, run }` `ShellCommand` passes validation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `archive.postMergeVerify` is `[{ "name": "install", "run": "bun install --frozen-lockfile" }]`
**WHEN** the config is validated
**THEN** validation succeeds and the command is available to `runMergeThenArchive`

### TC-005: Non-array value is rejected with `CONFIG_INVALID`

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Post-merge integrity command is configurable > Scenario: Invalid command list is rejected

### TC-006: Array element with empty string is rejected with `CONFIG_INVALID`

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Post-merge integrity command is configurable > Scenario: Invalid command list is rejected

### TC-007: Array element as object without `run` field is rejected with `CONFIG_INVALID`

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Post-merge integrity command is configurable > Scenario: Invalid command list is rejected

### TC-008: Array element as object with empty `run` string is rejected with `CONFIG_INVALID`

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `archive.postMergeVerify` contains `{ "run": "" }`
**WHEN** the config is validated
**THEN** validation throws `CONFIG_INVALID`

---

## EXEC: Integrity check execution path

### TC-009: Config absent → no fetch, no worktree, no command executed

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Post-merge integrity command is configurable > Scenario: Absent config preserves legacy behavior

### TC-010: Non-empty commands → fetch, worktree add, commands run, worktree removed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Integrity check runs on the merge result of this execution > Scenario: Commands run against the merged base after this execution's merge

### TC-011: Commands run in array order with fail-fast after first non-zero exit

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / T-05 Acceptance Criteria

**GIVEN** `archive.postMergeVerify` has two commands; the first exits non-zero
**WHEN** `runPostMergeIntegrityCheck` runs
**THEN** only the first command is spawned; the second command is never spawned

### TC-012: Each command is executed via `sh -c` with `cwd` set to the ephemeral worktree

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `archive.postMergeVerify` is `["bun install --frozen-lockfile"]`
**WHEN** the integrity check runs
**THEN** the spawn call is `("sh", ["-c", "bun install --frozen-lockfile"])` with `cwd` equal to the ephemeral worktree path (not the repo root)

### TC-013: All commands pass → `{ ok: true }` and worktree is removed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Integrity check runs on the merge result of this execution > Scenario: Passing check completes archive as before

### TC-014: Resume path (MERGED + archived) does not run integrity check

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Integrity check runs on the merge result of this execution > Scenario: Resume path does not re-run the integrity check

### TC-015: Merge-during-wait path does not run integrity check

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Integrity check runs on the merge result of this execution > Scenario: Merge that occurred during wait is not attributed to this execution

### TC-016: Ephemeral worktree path does not collide with the job's own worktree

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** a job worktree exists at `<slug>-<jobId8>`
**WHEN** `runPostMergeIntegrityCheck` constructs the ephemeral worktree path
**THEN** the path uses a distinct prefix (e.g. `integrity-<slug>-<sha8>`) that cannot collide with the job worktree naming convention

### TC-017: Merge commit SHA is resolved via `git rev-parse origin/<baseBranch>` after fetch

**Category**: unit
**Priority**: should
**Source**: design.md > D3

**GIVEN** `git fetch origin <baseBranch>` completes successfully
**WHEN** the SHA is resolved for attribution and worktree checkout
**THEN** `git rev-parse origin/<baseBranch>` is invoked and its output is used as `mergeSha`

---

## ESC: Escalation content & behavior

### TC-018: Failing check produces an escalation attributed to PR number and merge commit SHA

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Failed integrity check escalates without rollback and reports the merge honestly > Scenario: Failing check produces an attributed escalation

### TC-019: Merge is not rolled back or reverted on integrity check failure

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Failed integrity check escalates without rollback and reports the merge honestly > Scenario: Merge is not rolled back on failure

### TC-020: Escalation states that the PR was MERGED (not falsified)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Failed integrity check escalates without rollback and reports the merge honestly > Scenario: Merge is not rolled back on failure

### TC-021: `runPostMergeCleanup` is not called when integrity check returns `{ ok: false }`

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / T-06 Acceptance Criteria

**GIVEN** `postMergeVerify` is set and `runPostMergeIntegrityCheck` returns `{ ok: false, escalation }`
**WHEN** `runMergeThenArchive` processes the result
**THEN** `runPostMergeCleanup` is not invoked and exit code 1 is returned with the escalation text

### TC-022: Resume after integrity failure converges via post-merge cleanup

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Failed integrity check escalates without rollback and reports the merge honestly > Scenario: Resume after an integrity failure converges via cleanup

### TC-023: Escalation `resumeCommand` is `specrunner job archive --with-merge <slug>`

**Category**: unit
**Priority**: should
**Source**: design.md > D5

**GIVEN** the integrity check exits non-zero
**WHEN** `formatEscalation` is called to build the escalation
**THEN** the `resumeCommand` field equals `specrunner job archive --with-merge <slug>`

### TC-024: Escalation `failedStep` is `"post-merge integrity check (main)"`

**Category**: unit
**Priority**: should
**Source**: design.md > D5

**GIVEN** the integrity check exits non-zero
**WHEN** `formatEscalation` is called to build the escalation
**THEN** the `failedStep` field equals `"post-merge integrity check (main)"`

---

## INFRA: Infrastructure resilience

### TC-025: `git fetch` failure emits a warning and continues to cleanup without escalating

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Infrastructure failures do not block or falsely pass > Scenario: Fetch failure warns and continues

### TC-026: `git worktree add` failure emits a warning and returns `{ ok: true }`

**Category**: unit
**Priority**: should
**Source**: design.md > D6

**GIVEN** `git fetch` succeeds but `git worktree add --detach` exits non-zero
**WHEN** `runPostMergeIntegrityCheck` runs
**THEN** a warning is written to stderr stating the base branch was not verified, `{ ok: true }` is returned, and no escalation is emitted

### TC-027: `git rev-parse` failure emits a warning and returns `{ ok: true }`

**Category**: unit
**Priority**: should
**Source**: design.md > D6

**GIVEN** `git fetch` succeeds but `git rev-parse origin/<baseBranch>` exits non-zero
**WHEN** `runPostMergeIntegrityCheck` runs
**THEN** a warning is written to stderr and `{ ok: true }` is returned without escalating

### TC-028: Worktree removal failure in `finally` emits a warning but does not alter the outcome

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Infrastructure failures do not block or falsely pass > Scenario: Ephemeral worktree cleanup is best-effort

---

## WIRE: CLI → orchestrator wiring

### TC-029: Configured `archive.postMergeVerify` reaches `runMergeThenArchive` as `postMergeVerify`

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `.specrunner/config.json` has `archive.postMergeVerify: ["bun install --frozen-lockfile"]`
**WHEN** `job archive --with-merge <slug>` is invoked
**THEN** the CLI reads the value from `config.archive.postMergeVerify` and passes it as `postMergeVerify` in the `runMergeThenArchive` input

### TC-030: Config load failure leaves `postMergeVerify` undefined (backward compatible)

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** the `.specrunner/config.json` file cannot be loaded
**WHEN** `job archive --with-merge <slug>` is invoked
**THEN** `postMergeVerify` is `undefined`, no integrity check is applied, and the archive flow runs unchanged

### TC-031: `post-merge-integrity.ts` uses only injected `SpawnFn` with no direct `node:child_process` or `process.env`

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria (architecture invariants B-6 / B-12)

**GIVEN** `src/core/archive/post-merge-integrity.ts` is implemented
**WHEN** the file is inspected
**THEN** there is no import of `node:child_process` and no direct access to `process.env`; all subprocess calls use the injected `SpawnFn`

---

## BUILD: Build & typecheck

### TC-032: `bun run typecheck` passes with zero errors

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria / request.md Acceptance Criteria

**GIVEN** all implementation files (`post-merge-integrity.ts`, schema changes, wiring) are in place
**WHEN** `bun run typecheck` is executed
**THEN** the TypeScript compiler reports zero errors

### TC-033: `bun run test` passes, including pre-existing merge-then-archive tests (config-unset path)

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria / request.md Acceptance Criteria

**GIVEN** all implementation and test files are in place
**WHEN** `bun run test` is executed
**THEN** all tests pass; pre-existing `merge-then-archive` tests for the config-unset path remain unchanged and green

### TC-034: `docs/configuration.md` documents `archive.postMergeVerify` with no-op-when-absent semantics

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `docs/configuration.md` has been updated
**WHEN** the `archive.postMergeVerify` section is read
**THEN** it describes the purpose, `ShellCommand[]` shape, no-op when absent or empty, and includes an example such as `["bun install --frozen-lockfile"]`, consistent with the existing `archive.protectedPaths` / `verification.commands` documentation style

---

## Result

```yaml
result: completed
total: 34
automated: 30
manual: 4
must: 26
should: 7
could: 1
blocked_reasons: []
```
