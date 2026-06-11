# Test Cases: transient-retry-coverage

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 10
- **Manual**: 1
- **Priority**: must: 7, should: 4, could: 0

---

### TC-001: stream idle timeout throw is retried

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: stream idle timeout is classified as transient > Scenario: stream idle timeout throw is retried

---

### TC-002: unrelated text is not affected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: stream idle timeout is classified as transient > Scenario: unrelated text is not affected

---

### TC-003: transient error result retried

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: transient error result triggers retry > Scenario: transient error result retried

---

### TC-004: non-transient error result halts immediately

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: transient error result triggers retry > Scenario: non-transient error result halts immediately

---

### TC-005: error result with empty errors array halts immediately

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: transient error result triggers retry > Scenario: error result with empty errors array halts immediately

---

### TC-006: persistent transient error result exhausts budget

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: retry exhaustion halts as before > Scenario: persistent transient error result exhausts budget

---

### TC-007: stream idle timeout token is matched case-insensitively

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** an error message containing `"Stream Idle Timeout"` (mixed case)
**WHEN** `isTransientAgentError` is called with that error
**THEN** it returns `true`

---

### TC-008: bare "API Error: Stream idle timeout" (without SDK wrapper) is classified as transient

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `new Error("API Error: Stream idle timeout")`
**WHEN** `isTransientAgentError` is called
**THEN** it returns `true`

---

### TC-009: existing throw-path transient retry is unaffected

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: existing throw-path behaviour is unchanged

**GIVEN** `maxRetries ≥ 1` and the SDK query throws a previously-whitelisted transient error (e.g. `"socket timeout"`)
**WHEN** `runner.run(ctx)` is called
**THEN** `step:retry` is emitted with `attempt: 1`, the second call succeeds, and `completionReason` is `"success"` — identical to pre-change behaviour, with no existing test assertions modified

---

### TC-010: typecheck and full test suite pass

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** all code changes for T-01 through T-04 are applied
**WHEN** `bun run typecheck && bun run test` is executed
**THEN** `typecheck` exits 0 (zero type errors) and `test` exits 0 with no failing cases across `transient-error.test.ts`, `agent-runner-transient-retry.test.ts`, and `agent-runner.test.ts`

---

### TC-011: thrown error for transient error result carries expected error message format

**Category**: unit
**Priority**: should
**Source**: design.md > D2 — Convert transient error result to throw inside `runMainWorkTurn`

**GIVEN** a query returns `{ subtype: "error_during_execution", errors: ["Stream idle timeout"] }`
**WHEN** `runMainWorkTurn` processes the result
**THEN** it throws an `Error` whose `.message` is `"Claude Code SDK query failed: Stream idle timeout"` and whose `.code` is `"CLAUDE_CODE_QUERY_FAILED_TRANSIENT"`

---

## Result

```yaml
result: completed
total: 11
automated: 10
manual: 1
must: 7
should: 4
could: 0
blocked_reasons: []
```
