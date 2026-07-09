# Test Cases: claude-code adapter workspace write scope

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 8
- **Manual**: 0
- **Priority**: must: 6, should: 2, could: 0

---

### TC-SB-01: Step agent query options carry a workspace-scoped sandbox

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step agent execution scopes filesystem writes to the workspace > Scenario: query options carry a workspace-scoped sandbox

---

### TC-SB-02: Bash remains executable under the sandbox

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step agent execution scopes filesystem writes to the workspace > Scenario: Bash remains executable under the sandbox

---

### TC-SB-03: Degraded run continues and warns exactly once

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sandbox unavailability fails open with a single warning > Scenario: degraded run continues and warns once

---

### TC-SB-04: Repeated degradation signals produce at most one warning

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Sandbox unavailability fails open with a single warning > Scenario: repeated degradation signals still warn only once

---

### TC-SB-05: Sandbox configured for graceful degradation via failIfUnavailable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sandbox unavailability fails open with a single warning > Scenario: sandbox configured for graceful degradation

---

### TC-SB-06: One-shot query options carry no sandbox setting

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: One-shot query behavior is unchanged > Scenario: one-shot options carry no sandbox

---

### TC-SB-07: Sandbox-unavailable predicate correctly classifies stderr lines

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 (Acceptance Criteria: "The predicate returns `true` for a representative sandbox-unavailable line and `false` for unrelated stderr lines")

**GIVEN** the `isSandboxUnavailableWarning` predicate function

**WHEN** called with a stderr line containing a sandbox-unavailable / sandbox-disabled / falling-back signature from the SDK

**THEN** it returns `true`

**AND** when called with an unrelated stderr line (e.g. a normal tool-use log line), it returns `false`

---

### TC-SB-08: Pre-existing tests remain green after the change

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 (Acceptance Criteria: "typecheck and test are green; no pre-existing test was edited")

**GIVEN** the modified `src/adapter/claude-code/agent-runner.ts` with the `sandbox` setting added to step-agent query options

**WHEN** `bun run typecheck && bun run test` is executed against the full test suite

**THEN** TC-023 (options shape test) and TC-AR-01 (`disallowedTools` assertion) pass without any modification to their source files

**AND** `typecheck` reports zero type errors (the `sandbox` value conforms to the SDK `SandboxSettings` type)

**AND** no pre-existing test file was edited to accommodate the new option keys

---

## Result

```yaml
result: completed
total: 8
automated: 8
manual: 0
must: 6
should: 2
could: 0
blocked_reasons: []
```
