# Test Cases: archive-resume-when-unmerged

## Summary

- **Total**: 6 cases
- **Automated** (unit/integration): 4
- **Manual**: 2
- **Priority**: must: 4, should: 2, could: 0

---

### TC-001: Non-with-merge archive on already-archived job returns idempotently

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive/resume lookup SHALL include archived states > Scenario: non-with-merge archive on already-archived job returns idempotently

---

### TC-002: With-merge archive on archived+merged job completes post-merge cleanup

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive/resume lookup SHALL include archived states > Scenario: with-merge archive on archived+merged job completes post-merge cleanup

---

### TC-003: With-merge archive on archived+unmerged job proceeds to merge flow

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive/resume lookup SHALL include archived states > Scenario: with-merge archive on archived+unmerged job proceeds to merge flow

---

### TC-004: Cancel does not operate on archived jobs

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: cancel / inbox / exit-guard list calls SHALL NOT include archived states > Scenario: cancel does not operate on archived jobs

---

### TC-005: Non-target list() call sites remain unchanged

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06: Confirm non-target list() calls are unchanged

**GIVEN** the files `src/core/cancel/runner.ts`, `src/core/inbox/run-inbox.ts`, and `src/core/lifecycle/exit-guard.ts`
**WHEN** grepping each file for `JobStateStore.list` call sites
**THEN** none of the calls include `includeArchived` — the option is absent from all three files, confirming no unintended scope expansion

---

### TC-006: Build, typecheck, and test suite all pass

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07: Final verification

**GIVEN** the two list() call sites are patched and new tests are added
**WHEN** `bun run build`, `bun run typecheck`, and `bun test` are executed in sequence
**THEN** all three commands exit with code 0 and no pre-existing tests regress

---

## Result

```yaml
result: completed
total: 6
automated: 4
manual: 2
must: 4
should: 2
could: 0
blocked_reasons: []
```
