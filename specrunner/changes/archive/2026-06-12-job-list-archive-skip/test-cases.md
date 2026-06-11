# Test Cases: job-list-archive-skip

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 10
- **Manual**: 1
- **Priority**: must: 8, should: 3, could: 0

---

### TC-001: default list skips archive directory

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `JobStateStore.list` SHALL skip archive scan by default > Scenario: default list skips archive directory

---

### TC-002: opt-in returns archived states

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `JobStateStore.list` SHALL skip archive scan by default > Scenario: opt-in returns archived states

---

### TC-003: default `job ls` with no flags does not load archive

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job ls` default and `--active` SHALL NOT load archived states > Scenario: default `job ls` with no flags

---

### TC-004: `--all` includes archived jobs

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job ls` default and `--active` SHALL NOT load archived states > Scenario: `--all` includes archived

---

### TC-005: `--status archived` includes archived jobs

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job ls` default and `--active` SHALL NOT load archived states > Scenario: `--status archived` includes archived

---

### TC-006: inbox tick with large archive does not load archived states

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: inbox tick SHALL NOT load archived states > Scenario: inbox tick with large archive

---

### TC-007: `job show` always calls list with `includeArchived: true`

**Category**: unit
**Priority**: should
**Source**: design.md > D2: Caller audit — opt-in list (`src/cli/job-show.ts`)

**GIVEN** a repo with one active job and one archived job
**WHEN** `runJobShow` is called for any job slug
**THEN** `JobStateStore.list` is called with `{ includeArchived: true }`

---

### TC-008: `resolveId` always calls list with `includeArchived: true`

**Category**: unit
**Priority**: should
**Source**: design.md > D2: Caller audit — opt-in list (`JobStateStore.resolveId`)

**GIVEN** a repo with archived jobs
**WHEN** `JobStateStore.resolveId(repoRoot, prefix)` is called with an ID prefix
**THEN** `JobStateStore.list` is called internally with `{ includeArchived: true }`

---

### TC-009: `--status` with non-archived terminal status skips archive

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: Update display and resolution callers to opt in

**GIVEN** a repo with archived jobs
**WHEN** `runPs({ status: 'failed' })` is called (a terminal but non-archived status)
**THEN** `JobStateStore.list` is called without `includeArchived: true`, and no archive paths are read

---

### TC-010: TypeScript compiles without errors after changes

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04: Verify `typecheck && test`

**GIVEN** all source changes from T-01 and T-02 applied
**WHEN** `bun run typecheck` is executed
**THEN** exit code is 0 with zero type errors

---

### TC-011: Pre-existing test suite remains green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04: Verify `typecheck && test`

**GIVEN** all source changes from T-01, T-02, and T-03 applied
**WHEN** `bun run test` is executed
**THEN** all tests pass including tests that existed before this change

---

## Result

```yaml
result: completed
total: 11
automated: 10
manual: 1
must: 8
should: 3
could: 0
blocked_reasons: []
```
