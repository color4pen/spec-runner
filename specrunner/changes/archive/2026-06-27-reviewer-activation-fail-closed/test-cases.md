# Test Cases: reviewer-activation-fail-closed

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 15
- **Manual**: 2
- **Priority**: must: 11, should: 6, could: 0

---

### TC-001: managed runtime does not invoke listChangedFiles for a paths reviewer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The activation gate SHALL consult changed-file derivability before evaluating a `paths` condition > Scenario: managed runtime does not invoke listChangedFiles for a paths reviewer

---

### TC-002: local runtime invokes listChangedFiles for a paths reviewer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The activation gate SHALL consult changed-file derivability before evaluating a `paths` condition > Scenario: local runtime invokes listChangedFiles for a paths reviewer

---

### TC-003: managed runtime activates a paths reviewer instead of skipping it

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: A `paths`-conditioned reviewer SHALL be activated (not silently skipped) when changed files cannot be derived > Scenario: managed runtime activates a paths reviewer instead of skipping it

---

### TC-004: paths condition with non-derivable changed files activates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `evaluateActivation` SHALL treat non-derivable changed files as activating for a `paths` condition > Scenario: paths condition with non-derivable changed files activates

---

### TC-005: requestTypes mismatch still skips even when changed files are non-derivable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `evaluateActivation` SHALL treat non-derivable changed files as activating for a `paths` condition > Scenario: requestTypes mismatch still skips even when changed files are non-derivable

---

### TC-006: derivable changed files with no match still skips (no regression)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `evaluateActivation` SHALL treat non-derivable changed files as activating for a `paths` condition > Scenario: derivable changed files with no match still skips (no regression)

---

### TC-007: omitted derivability fact defaults to derivable

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: `evaluateActivation` SHALL treat non-derivable changed files as activating for a `paths` condition > Scenario: omitted derivability fact defaults to derivable

---

### TC-008: condition-mismatch skip carries a paths-mismatch reason (derivable)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `skipReason` SHALL distinguish "changed files not derivable" from "condition did not match" > Scenario: condition-mismatch skip carries a paths-mismatch reason (derivable)

---

### TC-009: non-derivable case produces activation, not a paths-mismatch skip

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `skipReason` SHALL distinguish "changed files not derivable" from "condition did not match" > Scenario: non-derivable case produces activation, not a paths-mismatch skip

---

### TC-010: unconditional reviewer activates on a non-derivable runtime

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Reviewers without a `paths` condition SHALL be unaffected > Scenario: unconditional reviewer activates on a non-derivable runtime

---

### TC-011: requestTypes-only reviewer is gated solely by request type on non-derivable runtime

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Reviewers without a `paths` condition SHALL be unaffected > Scenario: requestTypes-only reviewer is gated solely by request type

---

### TC-012: non-empty non-matching changedFiles with non-derivable flag still activates

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `evaluateActivation` is called with `cond = { paths: ["src/auth/**"] }` and facts `{ changedFiles: ["src/util/helper.ts"], requestType: "bug-fix", changedFilesDerivable: false }`
**WHEN** `evaluateActivation(cond, facts)` executes
**THEN** the result is `{ activated: true }` (the glob match is not attempted; non-empty non-matching changedFiles are irrelevant when derivability is false)

---

### TC-013: requestTypes match combined with paths condition and non-derivable runtime activates

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `evaluateActivation` is called with `cond = { requestTypes: ["bug-fix"], paths: ["src/auth/**"] }` and facts `{ changedFiles: [], requestType: "bug-fix", changedFilesDerivable: false }`
**WHEN** `evaluateActivation(cond, facts)` executes
**THEN** the result is `{ activated: true }` (requestTypes matches, and non-derivable paths condition activates rather than skips)

---

### TC-014: listChangedFiles is not called for an unconditional reviewer on a non-derivable runtime

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** a reviewer step with no `activation` condition
**AND** a runtime whose `canDeriveChangedFiles()` returns `false` with a `listChangedFiles` spy
**WHEN** the activation gate runs (no `if (step.activation)` block entered)
**THEN** `listChangedFiles` is not called (the no-activation fast-path is unaffected by derivability)

---

### TC-015: "fail-safe: under-activate" framing removed from managed.ts docs

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** the updated `src/core/runtime/managed.ts`
**WHEN** the JSDoc for `listChangedFiles` and `canDeriveChangedFiles` is reviewed
**THEN** no phrase frames the `[]` return as "fail-safe" or "under-activate"; instead the doc describes the structural limitation (no worktree), states that `[]` MUST NOT be read as "no changes", and notes that the activation gate consults `canDeriveChangedFiles()` and activates paths-conditioned reviewers (fail-closed)

---

### TC-016: "MUST NOT reference this predicate" instruction removed from runtime-strategy.ts

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** the updated `src/core/port/runtime-strategy.ts`
**WHEN** the JSDoc for `canDeriveChangedFiles?()` is reviewed
**THEN** the instruction "Reviewer activation consumers MUST NOT reference this predicate" is absent; the doc states that both scope-check and the reviewer activation gate consume the predicate with fail-closed semantics; the method signature and return-value semantics are unchanged

---

### TC-017: typecheck and test suite pass green after all changes

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** all changes from T-01 through T-06 are applied (activation.ts, executor.ts, managed.ts, runtime-strategy.ts, new/updated tests)
**WHEN** `bun run typecheck` and `bun run test` are executed
**THEN** both commands exit with code 0; all pre-existing tests in `executor-activation.test.ts` and `activation.test.ts` continue to pass

## Result

```yaml
result: completed
total: 17
automated: 15
manual: 2
must: 11
should: 6
could: 0
blocked_reasons: []
```
