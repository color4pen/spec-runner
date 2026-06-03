# Test Cases: conformance-review-step

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 16
- **Manual**: 2
- **Priority**: must: 17, should: 0, could: 1

---

### TC-001: code-review approved (no fixable) routes to conformance

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pipeline SHALL execute conformance after code-review approved > Scenario: code-review approved with no fixable findings routes to conformance

---

### TC-002: code-fixer approved after observation-fix routes to conformance

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pipeline SHALL execute conformance after code-review approved > Scenario: code-fixer approved after observation-fix routes to conformance

---

### TC-003: all 4 artifacts satisfied produces approved

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Conformance SHALL judge implementation against 4 upstream artifacts > Scenario: all 4 artifacts satisfied produces approved

---

### TC-004: any artifact not satisfied produces needs-fix

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Conformance SHALL judge implementation against 4 upstream artifacts > Scenario: any artifact not satisfied produces needs-fix

---

### TC-005: no direct edge from code-review to adr-gen exists

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: adr-gen SHALL only be reachable via conformance approved > Scenario: no direct edge from code-review to adr-gen exists

---

### TC-006: no direct edge from code-fixer to adr-gen exists

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: adr-gen SHALL only be reachable via conformance approved > Scenario: no direct edge from code-fixer to adr-gen exists

---

### TC-007: conformance needs-fix transitions to implementer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Conformance needs-fix SHALL return to implementer > Scenario: conformance needs-fix transitions to implementer

---

### TC-008: conformance exceeds max iterations escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Conformance SHALL escalate on loop exhaustion > Scenario: conformance exceeds max iterations

---

### TC-009: code-review system prompt references spec.md not specs/

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review system prompt SHALL reference spec.md > Scenario: code-review prompt contains spec.md reference

---

### TC-010: STEP_NAMES and AGENT_STEP_NAMES include "conformance"

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/kernel/step-names.ts` is imported
**WHEN** `STEP_NAMES.CONFORMANCE` and `AGENT_STEP_NAMES` are inspected
**THEN** `STEP_NAMES.CONFORMANCE === "conformance"` and `AGENT_STEP_NAMES` contains `"conformance"`

---

### TC-011: conformanceResultPath returns zero-padded path

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `conformanceResultPath` is called with slug `"foo"` and iteration `1`
**WHEN** the return value is evaluated
**THEN** the result is `"specrunner/changes/foo/conformance-result-001.md"`

---

### TC-012: CONFORMANCE_SYSTEM_PROMPT references all 4 judgment items

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03, design.md > D4

**GIVEN** `CONFORMANCE_SYSTEM_PROMPT` string is imported
**WHEN** its content is inspected for the 4 artifact names
**THEN** `tasks.md`, `design.md`, `spec.md`, and `request.md` all appear in the prompt

---

### TC-013: ConformanceStep satisfies AgentStep with correct identity

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04, design.md > D1

**GIVEN** `ConformanceStep` is imported from `src/core/step/conformance.ts`
**WHEN** `kind`, `name`, and `reportTool` are inspected
**THEN** `kind === "agent"`, `name === "conformance"`, and `reportTool` is `JUDGE_REPORT_TOOL`

---

### TC-014: LOOP_ERROR_CODES contains conformance entry with correct structure

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05, design.md > D3

**GIVEN** `LOOP_ERROR_CODES` is accessed with key `STEP_NAMES.CONFORMANCE`
**WHEN** the entry's `code`, `message`, and `hint` fields are inspected
**THEN** `code === "CONFORMANCE_RETRIES_EXHAUSTED"`, `message` is a function, and `hint` is a function

---

### TC-015: conformance approved transitions to adr-gen

**Category**: unit
**Priority**: must
**Source**: design.md > D2

**GIVEN** the `STANDARD_TRANSITIONS` table
**WHEN** filtering for transitions where step is `"conformance"` and on is `"approved"`
**THEN** exactly one entry exists with `to === "adr-gen"`

---

### TC-016: conformance is registered in STANDARD_LOOP_NAMES

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06, design.md > D3

**GIVEN** `STANDARD_LOOP_NAMES` is inspected in `src/core/pipeline/run.ts`
**WHEN** checking membership
**THEN** `STEP_NAMES.CONFORMANCE` is present in the array

---

### TC-017: ConformanceStep maxTurns equals 15

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04, design.md > D4

**GIVEN** `ConformanceStep` definition
**WHEN** `maxTurns` is read
**THEN** the value is `15`

---

### TC-018: typecheck and test suite both pass

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** all implementation changes are applied
**WHEN** `bun run typecheck && bun run test` is executed
**THEN** both commands exit with code 0 and no failures are reported

---

## Result

```yaml
result: completed
total: 18
automated: 16
manual: 2
must: 17
should: 0
could: 1
blocked_reasons: []
```
