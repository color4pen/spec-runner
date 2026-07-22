# Test Cases: bootstrap-commit-egress-ledger

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 9
- **Manual**: 0
- **Priority**: must: 9, should: 0, could: 0

---

### TC-001: workspace-materializer new-run path records bootstrap OID in synthesizedCommits

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Bootstrap commit OID SHALL be recorded in synthesizedCommits > Scenario: workspace-materializer new-run path records bootstrap OID

---

### TC-002: local.ts no-worktree run path records bootstrap OID in synthesizedCommits

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Bootstrap commit OID SHALL be recorded in synthesizedCommits > Scenario: local.ts no-worktree run path records bootstrap OID

---

### TC-003: managed.ts run path records bootstrap OID in synthesizedCommits

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Bootstrap commit OID SHALL be recorded in synthesizedCommits > Scenario: managed.ts run path records bootstrap OID

---

### TC-004: workspace-materializer rev-parse failure aborts bootstrap and cleans up worktree

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Bootstrap SHALL fail closed when rev-parse fails > Scenario: workspace-materializer rev-parse failure aborts bootstrap

---

### TC-005: local.ts rev-parse failure aborts bootstrap

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Bootstrap SHALL fail closed when rev-parse fails > Scenario: local.ts rev-parse failure aborts bootstrap

---

### TC-006: managed.ts rev-parse failure aborts bootstrap

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Bootstrap SHALL fail closed when rev-parse fails > Scenario: managed.ts rev-parse failure aborts bootstrap

---

### TC-007: first push egress passes when bootstrap OID is in ledger

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: Egress check SHALL pass on the first push after bootstrap > Scenario: first push egress passes with bootstrap OID in ledger

---

### TC-008: first push egress fails when bootstrap OID is absent from ledger (destruction confirmation)

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: Egress check SHALL pass on the first push after bootstrap > Scenario: first push egress fails when bootstrap OID is absent (destruction confirmation)

---

### TC-009: existing egress and synthesis tests remain green after fix

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-08

**GIVEN** the fix to 3 bootstrap sites (workspace-materializer.ts, local.ts, managed.ts) is applied  
**WHEN** `bun run typecheck && bun run test` is executed  
**THEN** all tests pass without modification, including:
- `tests/unit/step/pipeline-sole-committer-egress.test.ts`
- `tests/unit/state/pipeline-sole-committer-state.test.ts`
- `tests/unit/step/pipeline-sole-committer-synthesis.test.ts`
- `tests/unit/step/test-materialize-boundary.test.ts` (existing baseline seed preserved as-is)

## Result

```yaml
result: completed
total: 9
automated: 9
manual: 0
must: 9
should: 0
could: 0
blocked_reasons: []
```
