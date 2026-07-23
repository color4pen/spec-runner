# Test Cases: resume-worktree-reconciliation

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 22
- **Manual**: 0
- **Priority**: must: 20, should: 1, could: 1

---

### TC-001: Interrupted residue is quarantined, removed, and the next step passes

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume mechanically reconciles the worktree before starting the step > Scenario: interrupted-attempt residue is quarantined, removed, and the next step completes

---

### TC-002: No residue → reconcile is a no-op (idempotent)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume mechanically reconciles the worktree before starting the step > Scenario: reconcile is a no-op on a worktree with no residue (idempotent)

---

### TC-003: state.json and src/ dirt survive reconcile while residue is removed

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: reconcile preserves the state journal and non-managed paths > Scenario: state.json and src/ dirt survive reconcile while residue is removed

---

### TC-004: Quarantine failure halts resume with the residue intact

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: reconcile is fail-closed when evidence cannot be preserved > Scenario: quarantine failure halts resume with the residue intact

---

### TC-005: Dirty canon fail-closes before reconcile runs

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: reconcile does not weaken the protected-canon apply-canon gate > Scenario: dirty canon still fail-closes before reconcile runs

---

### TC-006: isReconcilableArtifact returns true for a step-result file under the change folder

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 TC-U1

**GIVEN** slug `foo-bar` and path `specrunner/changes/foo-bar/spec-review-result-002.md`
**WHEN** `isReconcilableArtifact(path, slug)` is called
**THEN** it returns `true`

---

### TC-007: isReconcilableArtifact returns false for every path in protectedCanonPaths

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 TC-U2

**GIVEN** slug `foo-bar` and each path in `protectedCanonPaths("foo-bar")` (e.g. `spec.md`, `tasks.md`, `request.md`)
**WHEN** `isReconcilableArtifact(path, slug)` is called for each path
**THEN** it returns `false` for every path in the set

---

### TC-008: isReconcilableArtifact returns false for every path in pipelineManagedPaths

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 TC-U3

**GIVEN** slug `foo-bar` and each path in `pipelineManagedPaths("foo-bar")` (`state.json`, `events.jsonl`, `usage.json`, `bite-evidence-result.md`, `pr-create-result.md`)
**WHEN** `isReconcilableArtifact(path, slug)` is called for each path
**THEN** it returns `false` for every path in the set

---

### TC-009: isReconcilableArtifact returns false for a non-change-folder path (src/)

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 TC-U4

**GIVEN** slug `foo-bar` and path `src/foo.ts`
**WHEN** `isReconcilableArtifact(path, slug)` is called
**THEN** it returns `false`

---

### TC-010: isReconcilableArtifact returns false for a same-prefix-different-directory path

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 TC-U5

**GIVEN** slug `foo-bar` and path `specrunner/changes/foo-bar-other/x.md` (starts with the same prefix as the change folder but is a different directory)
**WHEN** `isReconcilableArtifact(path, slug)` is called
**THEN** it returns `false`

---

### TC-011: reconcileWorktreeArtifacts returns no-op result on a clean worktree

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 TC-U6

**GIVEN** a mocked `SpawnFn` that returns empty output and exit code 0 for `git status --porcelain -z --no-renames`
**WHEN** `reconcileWorktreeArtifacts(slug, worktreePath, spawnFn)` is called
**THEN** it returns `{ reconciled: [], quarantineDir: null }` AND no quarantine write or removal git command is issued

---

### TC-012: reconcileWorktreeArtifacts returns no-op on git status failure or spawn rejection

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 TC-U7

**GIVEN** a mocked `SpawnFn` that (a) returns a non-zero exit code for `git status`, or (b) rejects on spawn
**WHEN** `reconcileWorktreeArtifacts(slug, worktreePath, spawnFn)` is called
**THEN** it returns `{ reconciled: [], quarantineDir: null }` without throwing

---

### TC-013: Removal kind dispatch — untracked removed via clean, tracked-modified restored via checkout HEAD

**Category**: integration
**Priority**: should
**Source**: tasks.md T-05 TC-R5

**GIVEN** a real git repo containing (a) an untracked residue file under the change folder, and (b) a tracked-but-modified non-canon change-folder artifact (e.g. `verification-result.md` that has been modified in the worktree)
**WHEN** `reconcileWorktreeArtifacts(slug, repoDir, defaultSpawnFn)` is called
**THEN** the untracked residue (a) is absent from the worktree (removed via `git clean -f`)
**AND** the tracked-modified artifact (b) is restored to its HEAD content (restored via `git checkout HEAD`)

---

### TC-014: prepare() default resume calls reconcileWorktreeArtifacts

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06 TC-I1

**GIVEN** a `ResumeCommand` with a resolved slug and worktree path, clean canon state, and `reconcileWorktreeArtifacts` mocked to return the no-op result
**WHEN** `prepare()` is called without any special flags
**THEN** `reconcileWorktreeArtifacts` is called once with the resolved slug and worktree path

---

### TC-015: prepare() --from resume calls reconcileWorktreeArtifacts

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06 TC-I2

**GIVEN** same setup as TC-014 with the `--from <step>` option added
**WHEN** `prepare()` is called with `--from <step>`
**THEN** `reconcileWorktreeArtifacts` is called (the `--from` flag only changes `startStep`; it does not bypass reconcile)

---

### TC-016: prepare() --apply-canon path calls reconcileWorktreeArtifacts after canon commit

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06 TC-I3

**GIVEN** a `ResumeCommand` with a dirty protected canon path, the `--apply-canon` flag, mocked canon commit, and mocked `reconcileWorktreeArtifacts`
**WHEN** `prepare()` is called with `--apply-canon`
**THEN** the canon commit executes first, and then `reconcileWorktreeArtifacts` is called

---

### TC-017: prepare() maps reconcile throw to PrepareError(1) without starting the step

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06 TC-I4

**GIVEN** a `ResumeCommand` where mocked `reconcileWorktreeArtifacts` throws an error
**WHEN** `prepare()` is called
**THEN** `prepare()` throws `PrepareError` with exit code 1
**AND** the step is not started

---

### TC-018: prepare() --no-worktree mode does not call reconcileWorktreeArtifacts

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06 TC-I5

**GIVEN** a `ResumeCommand` operating in `--no-worktree` mode (resolved worktree path is null)
**WHEN** `prepare()` is called
**THEN** `reconcileWorktreeArtifacts` is NOT called

---

### TC-019: prepare() dirty canon without --apply-canon stops at the apply-canon gate before reconcile

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06 TC-I6

**GIVEN** a `ResumeCommand` with a dirty protected canon path and no `--apply-canon` flag, and mocked `reconcileWorktreeArtifacts`
**WHEN** `prepare()` is called
**THEN** `prepare()` throws (exit code 1) at the apply-canon gate
**AND** `reconcileWorktreeArtifacts` is NOT called

---

### TC-020: Destruction confirmation — removing reconcile call reinstates residue-misattribution halt

**Category**: integration
**Priority**: could
**Source**: tasks.md T-06 TC-I7

**GIVEN** the reconcile call has been removed from `prepare()`, and a worktree contains an untracked step-result residue file under the change folder
**WHEN** the subsequent step's write-set check runs
**THEN** `findScopedCommitViolations` or `findWriteScopeViolations` reports `WRITE_SCOPE_VIOLATION` for the residue (confirming TC-001 would regress without the reconcile call)

---

### TC-021: docs/operations.md contains the recovery-contract subsection with all three classes

**Category**: unit
**Priority**: must
**Source**: tasks.md T-07

**GIVEN** `docs/operations.md` read from disk
**WHEN** the drift-guard test runs assertions against its content
**THEN** the file contains the heading `halt → resume の回復契約`
**AND** names all three path classes (protected canon, pipeline-managed artifact, non-managed path)
**AND** names `.specrunner/local/` as the quarantine destination
**AND** states the fail-closed-on-quarantine-failure rule

---

### TC-022: Pre-existing apply-canon tests pass without modification

**Category**: integration
**Priority**: must
**Source**: tasks.md T-08

**GIVEN** the pre-existing test files `apply-canon.test.ts`, `resume-apply-canon.test.ts`, and `operator-canon-apply-on-resume-e2e.test.ts` with zero edits applied
**WHEN** `bun run test` executes those test files
**THEN** all tests pass (reconcile no-ops on the fake worktree paths those tests use, per design D7)

---

## Result

```yaml
result: completed
total: 22
automated: 22
manual: 0
must: 20
should: 1
could: 1
blocked_reasons: []
```
