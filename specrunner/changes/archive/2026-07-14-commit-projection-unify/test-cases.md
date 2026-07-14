# Test Cases: CommitOrchestrator projection unification

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 14, should: 5, could: 0

---

### TC-001: commitSuccess uses projectSuccess projector

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Shared projectors unify success/skip in-memory projection > Scenario: commitSuccess uses projectSuccess projector

---

### TC-002: commitRound uses projectSuccess projector in the member fold

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Shared projectors unify success/skip in-memory projection > Scenario: commitRound uses projectSuccess projector in the member fold

---

### TC-003: commitSkipped uses projectSkip projector

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Shared projectors unify success/skip in-memory projection > Scenario: commitSkipped uses projectSkip projector

---

### TC-004: commitRound uses projectSkip projector in the member fold

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Shared projectors unify success/skip in-memory projection > Scenario: commitRound uses projectSkip projector in the member fold

---

### TC-005: Sequential success uses shared post-persist helper

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Post-persist effects are shared via a common helper > Scenario: Sequential success uses shared post-persist helper

---

### TC-006: Round uses shared post-persist helper per success member

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Post-persist effects are shared via a common helper > Scenario: Round uses shared post-persist helper per success member

---

### TC-007: Structure gate test — no duplication markers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: No duplication markers remain in source > Scenario: Structure gate test — no duplication markers

---

### TC-008: Structure gate test — liveness

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Projectors are referenced from both sequential and round paths > Scenario: Structure gate test — liveness

---

### TC-009: B-13 architecture test remains green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Behavioral invariants preserved > Scenario: B-13 architecture test remains green

---

### TC-010: B-14 architecture test remains green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Behavioral invariants preserved > Scenario: B-14 architecture test remains green

---

### TC-011: Full test suite green after refactoring

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Behavioral invariants preserved > Scenario: Full test suite green

---

### TC-012: projectSuccess is a pure module-level function with no async, no store, no this

**Category**: unit
**Priority**: should
**Source**: design.md > D1 / tasks.md > T-01

**GIVEN** `projectSuccess` is defined in `commit-orchestrator.ts`
**WHEN** the function source is inspected
**THEN** it is a module-level (non-class, non-exported) function; contains no `async` keyword, no `await`, no `store.` references, and no `this`; and returns a new `JobState` as a synchronous value

---

### TC-013: projectSkip is a pure module-level function with no async, no store, no this

**Category**: unit
**Priority**: should
**Source**: design.md > D1 / tasks.md > T-02

**GIVEN** `projectSkip` is defined in `commit-orchestrator.ts`
**WHEN** the function source is inspected
**THEN** it is a module-level (non-class, non-exported) function; contains no `async` keyword, no `await`, no `store.` references, and no `this`; and returns a new `JobState` as a synchronous value

---

### TC-014: applySuccessPostPersistEffects contains usage, lineage, and emit in that order with individual try/catch

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** `applySuccessPostPersistEffects` is defined as a private method on `CommitOrchestrator`
**WHEN** the method body is inspected
**THEN** it contains three blocks in order: (1) usage `appendInvocation` wrapped in its own `try { ... } catch {}`, (2) lineage `appendLineage` wrapped in its own `try { ... } catch {}`, and (3) `this.events.emit("verdict:parsed", {...})` — each independently best-effort

---

### TC-015: commitSuccess retains exactly two store.persist calls

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-04

**GIVEN** `commitSuccess` has been refactored to use `projectSuccess` and `applySuccessPostPersistEffects`
**WHEN** the body of `commitSuccess` is inspected for `store.persist` occurrences
**THEN** exactly two `store.persist(` calls are present (persist #1 after in-memory projection; persist #2 after branch/pullRequest reflection); `store.appendHistory` is absent

---

### TC-016: commitSkipped emits verdict:parsed before store.persist

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `commitSkipped` is called with a skip reason
**WHEN** the execution sequence is examined
**THEN** `this.events.emit("verdict:parsed", {...})` is invoked before `store.persist(s)`, preserving the sequential emit-before-persist invariant

---

### TC-017: Round fold history order — {step}-started appears before {step}-verdict / {step}-skipped

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `commitRound` is called with at least one success member and one skipped member
**WHEN** the in-memory state fold completes for each member
**THEN** for a success member the `{step}-started` history entry precedes the `{step}-verdict` entry in the resulting state's history array; for a skipped member the `{step}-started` entry precedes the `{step}-skipped` entry

---

### TC-018: commitRound retains exactly one store.persist call

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `commitRound` has been refactored to use shared projectors and `applySuccessPostPersistEffects`
**WHEN** the body of `commitRound` is inspected for `store.persist` occurrences
**THEN** exactly one `store.persist(state)` call is present (the single batch persist after all member folds and coordinator patch)

---

### TC-019: Round post-persist loop still emits verdict:parsed for skipped members

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `commitRound` has been refactored and the skipped `verdict:parsed` emit loop is retained
**WHEN** `commitRound` processes one or more skipped members
**THEN** `this.events.emit("verdict:parsed", {...})` is called for each skipped member in the post-persist section, independent of `applySuccessPostPersistEffects`

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 14
should: 5
could: 0
blocked_reasons: []
```
