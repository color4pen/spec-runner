# Test Cases: Detect and clean state-less orphan worktrees

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

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

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

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 20
- **Manual**: 2
- **Priority**: must: 15, should: 5, could: 2

---

## doctor check — orphan-worktrees

### TC-001: state-less worktree is reported as orphan

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL report orphan worktrees read-only > Scenario: state-less worktree is reported as orphan

### TC-002: worktree of a non-terminal known job is not reported

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL report orphan worktrees read-only > Scenario: worktree of a non-terminal known job is not reported

### TC-003: no orphan worktrees yields pass

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL report orphan worktrees read-only > Scenario: no orphan worktrees → pass

### TC-004: check never mutates the repository

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL report orphan worktrees read-only > Scenario: check never mutates the repository

### TC-005: orphan-sidecars behavior is preserved after adding orphan-worktrees check

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: existing doctor checks SHALL remain unchanged > Scenario: orphan-sidecars behavior is preserved

---

## job prune — dry-run

### TC-006: dry-run lists orphans without deleting

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job prune SHALL default to dry-run > Scenario: dry-run lists orphans without deleting

---

## job prune --force

### TC-007: force deletes worktree and local branch

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job prune --force SHALL delete orphan worktrees and local branches > Scenario: force deletes worktree and local branch

### TC-008: re-running prune after successful deletion is a no-op

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job prune --force SHALL delete orphan worktrees and local branches > Scenario: re-running prune is a no-op

---

## job prune — worktree guard

### TC-009: prune rejected when invoked from inside a worktree

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job prune SHALL run only from the main checkout > Scenario: prune rejected inside a worktree

---

## work-protection guard

### TC-010: worktree with uncommitted changes is skipped under --force

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: work-protection guard SHALL skip dirty or unpushed worktrees > Scenario: worktree with uncommitted changes is skipped under --force

### TC-011: worktree with unpushed commits is skipped under --force

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: work-protection guard SHALL skip dirty or unpushed worktrees > Scenario: worktree with unpushed commits is skipped under --force

---

## shared detection module

### TC-012: single detection module backs both doctor check and prune runner

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detection logic SHALL be shared between doctor and prune > Scenario: single detection module backs both consumers

---

## scanOrphanWorktrees — defensive behavior

### TC-013: scanOrphanWorktrees returns empty list when base directory is absent

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 — Shared orphan-worktree detection module

**GIVEN** the `.git/specrunner-worktrees/` directory does not exist (e.g. a fresh repo with no jobs run yet), with a mocked `spawn` injected into `scanOrphanWorktrees`
**WHEN** `scanOrphanWorktrees` is called
**THEN** it returns `[]` without throwing and without invoking `git worktree list`

### TC-014: scanOrphanWorktrees returns empty list when git worktree list fails

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 — Shared orphan-worktree detection module

**GIVEN** a mocked `spawn` that rejects / exits non-zero for the `git worktree list --porcelain` call
**WHEN** `scanOrphanWorktrees` is called
**THEN** it returns `[]` without throwing

---

## inspectWorktreeWork — unit logic

### TC-015: inspectWorktreeWork returns hasWork true when status --porcelain is non-empty

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 — Shared orphan-worktree detection module

**GIVEN** a mocked `spawn` that returns non-empty output for `git -C <path> status --porcelain`
**WHEN** `inspectWorktreeWork` is called with the worktree path
**THEN** `hasWork` is `true` and `reasons` contains a description of uncommitted/untracked changes

### TC-016: inspectWorktreeWork returns hasWork true when rev-list count is greater than zero

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 — Shared orphan-worktree detection module

**GIVEN** a mocked `spawn` that returns `"0\n"` for `status --porcelain` (clean) and `"3\n"` for `rev-list --count HEAD --not --remotes`
**WHEN** `inspectWorktreeWork` is called with the worktree path
**THEN** `hasWork` is `true` and `reasons` contains a description of unpushed commits

### TC-017: inspectWorktreeWork returns hasWork false when both checks are clean

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 — Shared orphan-worktree detection module

**GIVEN** a mocked `spawn` that returns empty output for `status --porcelain` and `"0\n"` for `rev-list --count HEAD --not --remotes`
**WHEN** `inspectWorktreeWork` is called with the worktree path
**THEN** `hasWork` is `false` and `reasons` is empty

### TC-018: inspectWorktreeWork returns hasWork true (fail-safe) when git command errors

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 — Shared orphan-worktree detection module

**GIVEN** a mocked `spawn` that throws or exits non-zero for any git command inside the worktree
**WHEN** `inspectWorktreeWork` is called with the worktree path
**THEN** `hasWork` is `true` (fail-safe: never delete when work-state is unknown) and `reasons` contains an explanatory message

---

## design D1 — terminal leftover is orphan

### TC-019: worktree belonging to a terminal job (archived/canceled) is classified as orphan

**Category**: unit
**Priority**: should
**Source**: design.md > D1: Detection = worktree directory with no non-terminal known job state

**GIVEN** a mocked `listStates` returning a job whose status is `archived` (terminal), and a mocked `spawn` returning a worktree entry whose basename matches that job's `<slug>-<jobId8>`
**WHEN** `scanOrphanWorktrees` is called
**THEN** that worktree is returned as an orphan (terminal jobs are not in the protected set)

---

## known risk — no remote-tracking refs

### TC-022: worktree in repo with no remote-tracking refs is conservatively skipped

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs — Repos without remote-tracking refs

**GIVEN** a mocked `spawn` that returns `"0\n"` for `status --porcelain` but returns a non-zero count for `rev-list --count HEAD --not --remotes` because no remote refs exist
**WHEN** `inspectWorktreeWork` is called and `pruneOrphanWorktrees` evaluates the orphan
**THEN** the worktree is treated as having work (`hasWork: true`) and is skipped (conservative: never destroys)

---

## CLI wiring — help text

### TC-020: specrunner job prune --help prints PRUNE_USAGE

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-04 — job prune CLI wiring

**GIVEN** a built `specrunner` binary
**WHEN** `specrunner job prune --help` is executed
**THEN** the output matches the `PRUNE_USAGE` constant defined in the command registry (path, flags, description are visible)

### TC-021: job prune appears in specrunner --help job commands section

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-04 — job prune CLI wiring

**GIVEN** a built `specrunner` binary
**WHEN** `specrunner --help` is executed
**THEN** the `Job commands:` section lists `job prune` with a brief description

---

## Result

```yaml
result: completed
total: 22
automated: 20
manual: 2
must: 15
should: 5
could: 2
blocked_reasons: []
```
