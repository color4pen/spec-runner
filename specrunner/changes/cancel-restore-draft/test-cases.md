# Test Cases: job cancel --restore-draft

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 11
- **Manual**: 1
- **Priority**: must: 6, should: 5, could: 1

---

### TC-001: restore writes a runnable draft

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job cancel --restore-draft` restores the branch request.md to drafts/ > Scenario: restore writes a runnable draft

---

### TC-002: source is read before worktree removal

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job cancel --restore-draft` restores the branch request.md to drafts/ > Scenario: source is read before worktree removal

---

### TC-003: no flag leaves drafts untouched

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Default cancel behavior is unchanged without the flag > Scenario: no flag leaves drafts untouched

---

### TC-004: existing draft is preserved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Restore never overwrites an existing draft > Scenario: existing draft is preserved

---

### TC-005: no source request.md to restore

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Missing source is a best-effort skip > Scenario: no source request.md to restore

---

### TC-006: bulk cancel rejects --restore-draft

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--restore-draft` is incompatible with `--all-terminated` > Scenario: bulk cancel rejects --restore-draft

---

### TC-007: empty slug yields warning and skip

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** a job state where `getJobSlug` returns an empty string, and `restoreDraft: true`
**WHEN** `cancelSingleJob` runs the restore step
**THEN** a warning is pushed ("cannot restore draft: slug could not be derived"), no file is written, and cancel exits 0

---

### TC-008: unresolvable worktree path yields warning and skip

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** a job whose worktree path cannot be resolved (`resolveWorktreePathForJob` returns `null`), and `restoreDraft: true`
**WHEN** `cancelSingleJob` runs the restore step
**THEN** a warning is pushed, no draft file is written, and cancel exits 0

---

### TC-009: --restore-draft flag is forwarded to cancelSingleJob via CLI

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `specrunner job cancel <jobId> --restore-draft` is invoked
**WHEN** `runCancel` parses flags and calls `cancelSingleJob`
**THEN** `cancelSingleJob` is called with `restoreDraft: true`; existing flags (`force`, `purge`, `yes`) are unaffected

---

### TC-010: success restore surfaces info message in CancelResult

**Category**: unit
**Priority**: should
**Source**: design.md > D6

**GIVEN** `restoreDraft: true` and the restore succeeds (source readable, destination absent)
**WHEN** `cancelSingleJob` completes
**THEN** `CancelResult.info` contains `"Restored draft to specrunner/drafts/<slug>/request.md"`

---

### TC-011: collision surfaces warning in CancelResult

**Category**: unit
**Priority**: should
**Source**: design.md > D6

**GIVEN** `restoreDraft: true` and the destination `drafts/<slug>/request.md` already exists
**WHEN** `cancelSingleJob` completes
**THEN** `CancelResult.warnings` contains a message indicating the draft already exists and was skipped; `CancelResult.info` contains no restore-success entry

---

### TC-012: restored draft passes specrunner request validate

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-04

**GIVEN** a real job is cancelled with `--restore-draft` against a worktree containing a valid `changes/<slug>/request.md`
**WHEN** `specrunner request validate <slug>` is run after cancel
**THEN** the command exits 0 with no validation errors

---

## Result

```yaml
result: completed
total: 12
automated: 11
manual: 1
must: 6
should: 5
could: 1
blocked_reasons: []
```
