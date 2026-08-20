# Test Cases: checkpoint 検証の分離 — generic integrity と use-case policy の二層化

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 13, should: 1, could: 0

---

### TC-001: existing callers work without supplying a policy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verifyCheckpoint shall accept an optional verification policy > Scenario: existing callers work without supplying a policy

---

### TC-002: a custom policy can be injected at call site

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verifyCheckpoint shall accept an optional verification policy > Scenario: a custom policy can be injected at call site

---

### TC-003: generic checks fire even when a permissive policy is supplied

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: generic integrity verification shall be independent of use-case policy > Scenario: generic checks fire even when a permissive policy is supplied

---

### TC-004: integrity failure rejects before policy is evaluated

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: generic integrity verification shall be independent of use-case policy > Scenario: integrity failure rejects before policy is evaluated

---

### TC-005: status not awaiting-resume is rejected by attachResumePolicy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume-specific checks shall live exclusively in attachResumePolicy > Scenario: status not awaiting-resume is rejected by attachResumePolicy

---

### TC-006: resume point unresolvable is rejected by attachResumePolicy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume-specific checks shall live exclusively in attachResumePolicy > Scenario: resume point unresolvable is rejected by attachResumePolicy

---

### TC-007: required reads() input missing is rejected by attachResumePolicy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume-specific checks shall live exclusively in attachResumePolicy > Scenario: required reads() input missing is rejected by attachResumePolicy

---

### TC-008: awaiting-archive checkpoint is rejected end-to-end

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach-resume behavior shall be preserved end-to-end > Scenario: awaiting-archive checkpoint is rejected (end-to-end)

---

### TC-009: valid awaiting-resume checkpoint is accepted end-to-end

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach-resume behavior shall be preserved end-to-end > Scenario: valid awaiting-resume checkpoint is accepted (end-to-end)

---

### TC-010: checkpoint-policy.ts exports required public symbols

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** the refactored `src/core/attach/checkpoint-policy.ts` exists
**WHEN** the module is imported
**THEN** it exports `CheckpointVerificationPolicy` (interface), `PolicyVerificationContext` (interface), and `attachResumePolicy` (object implementing `CheckpointVerificationPolicy`)

---

### TC-011: verify-checkpoint.ts has no direct resume-specific imports after refactoring

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** the refactored `src/core/attach/verify-checkpoint.ts`
**WHEN** its top-level import declarations are inspected
**THEN** `getPipelineDescriptor`, `getPipelineId`, `resolveResumeStep`, and `buildAllowedStepSet` do not appear as direct imports (they have been moved to `checkpoint-policy.ts`)

---

### TC-012: bun run typecheck exits with code 0

**Category**: gate
**Priority**: must
**Source**: tasks.md T-04

充足を担う verification phase: `bun run typecheck`

---

### TC-013: bun run test exits with code 0

**Category**: gate
**Priority**: must
**Source**: tasks.md T-04

充足を担う verification phase: `bun run test`（既存テスト無改変 + 新規テスト全 green を含む）

---

### TC-014: tests/unit/architecture/ passes without new allowlist entries

**Category**: gate
**Priority**: must
**Source**: tasks.md T-03, T-04

充足を担う verification phase: `bun run test` — `tests/unit/architecture/` サブスイート。`arch-allowlist.ts` に新エントリが追加されていないことを確認する。

---

## Result

```yaml
result: completed
total: 14
automated: 11
manual: 0
must: 13
should: 1
could: 0
blocked_reasons: []
```
