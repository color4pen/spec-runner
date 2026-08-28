# Test Cases: fixer-unpushable-path-coverage

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
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
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 22, should: 1, could: 0

---

### TC-001: code-fixer initial message includes push capability notice

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-fixer SHALL inject the push capability notice in its prompt > Scenario: code-fixer initial message with active pushCapability

---

### TC-002: code-fixer continuation message includes push capability notice

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-fixer SHALL inject the push capability notice in its prompt > Scenario: code-fixer continuation message with active pushCapability

---

### TC-003: code-fixer message omits notice when pushCapability is null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-fixer SHALL inject the push capability notice in its prompt > Scenario: code-fixer message with no pushCapability

---

### TC-004: code-fixer outputContracts returns unpushable-path contract with active pushCapability

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-fixer SHALL declare the unpushable-path output contract when pushCapability is set > Scenario: code-fixer outputContracts with active pushCapability

---

### TC-005: code-fixer outputContracts returns empty array when pushCapability is null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-fixer SHALL declare the unpushable-path output contract when pushCapability is set > Scenario: code-fixer outputContracts without pushCapability

---

### TC-006: spec-fixer initial message with findings includes push capability notice

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL inject the push capability notice in its prompt > Scenario: spec-fixer initial message with findings and active pushCapability

---

### TC-007: spec-fixer fallback message includes push capability notice

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL inject the push capability notice in its prompt > Scenario: spec-fixer fallback message with active pushCapability

---

### TC-008: spec-fixer continuation message includes push capability notice

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL inject the push capability notice in its prompt > Scenario: spec-fixer continuation message with active pushCapability

---

### TC-009: spec-fixer message omits notice when pushCapability is null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL inject the push capability notice in its prompt > Scenario: spec-fixer message with no pushCapability

---

### TC-010: spec-fixer outputContracts returns unpushable-path contract with active pushCapability

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL declare the unpushable-path output contract when pushCapability is set > Scenario: spec-fixer outputContracts with active pushCapability

---

### TC-011: spec-fixer outputContracts returns empty array when pushCapability is null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL declare the unpushable-path output contract when pushCapability is set > Scenario: spec-fixer outputContracts without pushCapability

---

### TC-012: buildUnpushablePathContracts returns empty array for null pushCapability

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `buildUnpushablePathContracts` in `fixer-helpers.ts` SHALL return an empty array when no patterns are declared > Scenario: null pushCapability

---

### TC-013: buildUnpushablePathContracts returns empty array for empty patterns array

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `buildUnpushablePathContracts` in `fixer-helpers.ts` SHALL return an empty array when no patterns are declared > Scenario: empty patterns array

---

### TC-014: buildUnpushablePathContracts returns one contract with correct shape for non-empty patterns

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `buildUnpushablePathContracts` in `fixer-helpers.ts` SHALL return an empty array when no patterns are declared > Scenario: non-empty patterns array

---

### TC-015: code-fixer Layer 2 backstop fires after follow-up fails to resolve unpushable-path violation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fixer steps SHALL rely on existing Layer 2 backstop when a follow-up cannot resolve the unpushable-path violation > Scenario: code-fixer follow-up does not resolve the violation

---

### TC-016: code-fixer conformance branch includes push capability notice

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 (conformance branch path) / tasks.md T-04 (listed test case) / design.md D3

**GIVEN** `deps.pushCapability` is set with `patterns: [".github/workflows/**"]`
**AND** the state has a conformance step run with verdict `"needs-fix:code-fixer"` whose `endedAt` is strictly later than the active reviewer's last `endedAt`
**AND** the conformance run's `toolResult.findings` is non-empty
**WHEN** `CodeFixerStep.buildMessage(state, deps)` is called
**THEN** the returned string contains `"Push Capability Notice"`

---

### TC-017: code-fixer coordinator loop branch includes push capability notice

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02 (coordinator loop branch paths) / design.md Risk: Multiple return paths in code-fixer.buildMessage

**GIVEN** `deps.pushCapability` is set with `patterns: [".github/workflows/**"]`
**AND** the state reflects an active coordinator loop (`isCoordinatorLoopActive` returns true) with at least one needs-fix member step
**AND** structured aggregated findings exist for that member (initial entry, not a continuation)
**WHEN** `CodeFixerStep.buildMessage(state, deps)` is called
**THEN** the returned string contains `"Push Capability Notice"`

---

### TC-018: typecheck passes with no new errors

**Category**: gate
**Priority**: must
**Source**: tasks.md T-05 (typecheck acceptance criterion)

Verification command: `bun run typecheck` — must exit with code 0 and introduce no new type errors.

---

### TC-019: full test suite passes with no regressions

**Category**: gate
**Priority**: must
**Source**: tasks.md T-05 (test regression acceptance criterion)

Verification command: `bun run test` — must exit with code 0. All pre-existing tests must continue to pass. The new test file `src/core/step/__tests__/fixer-push-capability.test.ts` must exist and all tests within it must pass (minimum 18 tests: 4 helper + 6 code-fixer + 8 spec-fixer).

---

### TC-020: implementer.ts and request-review.ts are unmodified

**Category**: gate
**Priority**: must
**Source**: tasks.md T-05 (no change to implementer / request-review acceptance criterion)

Verification: `git diff main -- src/core/step/implementer.ts src/core/step/request-review.ts` must produce no output. These files must remain byte-for-byte identical to their baseline on `main`.

---

### TC-021: infrastructure files step-context-builder.ts, output-verify.ts, and commit-push.ts are unmodified

**Category**: gate
**Priority**: must
**Source**: tasks.md T-05 (no change to infrastructure files acceptance criterion)

Verification: `git diff main -- src/core/step/step-context-builder.ts src/core/step/output-verify.ts` and any path containing `commit-push.ts` must produce no output. These files must remain byte-for-byte identical to their baseline on `main`.

---

### TC-022: spec-fixer conformance branch initial entry includes push capability notice

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 (conformance branch, initial path) / design.md D3 / design.md D4

**GIVEN** `deps.pushCapability` is set with `patterns: [".github/workflows/**"]`
**AND** the state has a conformance step run with verdict `"needs-fix:spec-fixer"` whose `endedAt` is strictly later than the active spec-reviewer's last `endedAt`
**AND** the conformance run's `toolResult.findings` is non-empty
**AND** the step has no prior session (not a continuation — `isFixerContinuation` is false)
**WHEN** `SpecFixerStep.buildMessage(state, deps)` is called
**THEN** the returned string contains `"Push Capability Notice"`

---

### TC-023: spec-fixer conformance branch continuation includes push capability notice

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 (conformance branch, continuation path) / design.md D3 / design.md D4

**GIVEN** `deps.pushCapability` is set with `patterns: [".github/workflows/**"]`
**AND** the state has a conformance step run with verdict `"needs-fix:spec-fixer"` whose `endedAt` is strictly later than the active spec-reviewer's last `endedAt`
**AND** the conformance run's `toolResult.findings` is non-empty
**AND** the step has a prior session recorded in state (`isFixerContinuation` is true)
**WHEN** `SpecFixerStep.buildMessage(state, deps)` is called
**THEN** the returned string contains `"Push Capability Notice"`

---

## Result

```yaml
result: completed
total: 23
automated: 19
manual: 0
must: 22
should: 1
could: 0
blocked_reasons: []
```
