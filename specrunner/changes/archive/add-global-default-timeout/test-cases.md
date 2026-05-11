# Test Cases: add-global-default-timeout

## Overview

| ID | Category | Priority | Source | Description |
|----|----------|----------|--------|-------------|
| TC-032 | ClaudeCodeRunner | must | Task 3 | timeoutMs triggers abort and returns timeout result |
| TC-033 | ClaudeCodeRunner | must | Task 3 | timeoutMs null means no timeout (default behavior) |
| TC-034 | ClaudeCodeRunner | must | Task 3 | step-level timeoutMs overrides defaults |
| TC-035 | ClaudeCodeRunner | must | Task 3 | timeoutMs: 0 disables timeout |
| TC-036 | ManagedAgentRunner | must | Task 1 | defaults.timeoutMs is applied when no step-level override |
| TC-037 | ManagedAgentRunner | must | Task 1 | step-level timeoutMs overrides defaults in ManagedAgentRunner |
| TC-038 | ManagedAgentRunner | must | Task 1 | resolveTimeoutMs removed; stepDefaults provides fallback |
| TC-039 | ManagedAgentRunner | should | Task 1 | timeoutMs: 0 disables timeout in ManagedAgentRunner |
| TC-040 | Resolution chain | must | Design D1/D2 | No config → existing behavior preserved (no regression) |
| TC-041 | ClaudeCodeRunner | should | Design D4 | Non-timeout error is not misclassified as timeout |
| TC-042 | ClaudeCodeRunner | could | Design D2 | clearTimeout called on normal completion (no resource leak) |

---

## TC-032: timeoutMs triggers abort and returns timeout result

**Category**: ClaudeCodeRunner
**Priority**: must
**Source**: Task 3 / Design D2, D4

```
GIVEN  a config with steps.defaults.timeoutMs: 50
AND    a queryFn mock that delays 200ms before yielding a result message
WHEN   ClaudeCodeRunner.run(ctx) is called
THEN   the result.completionReason === "timeout"
AND    result.error.code === "STEP_TIMEOUT"
AND    result.resultContent === null
```

---

## TC-033: timeoutMs null means no timeout (default behavior)

**Category**: ClaudeCodeRunner
**Priority**: must
**Source**: Task 3 / Design D2

```
GIVEN  a config without a steps key (no timeout configured)
AND    a queryFn mock that resolves normally within 50ms
WHEN   ClaudeCodeRunner.run(ctx) is called
THEN   the result.completionReason === "success"
AND    no STEP_TIMEOUT error is attached
```

---

## TC-034: step-level timeoutMs overrides defaults in ClaudeCodeRunner

**Category**: ClaudeCodeRunner
**Priority**: must
**Source**: Task 3 / Design D2

```
GIVEN  a config with steps.defaults.timeoutMs: 50
AND    steps["spec-review"].timeoutMs: 5000
AND    a queryFn mock that takes 100ms to resolve
WHEN   ClaudeCodeRunner.run(ctx) is called with stepName "spec-review"
THEN   the result.completionReason === "success"
AND    the step-level 5000ms limit was in effect, not the 50ms default
```

---

## TC-035: timeoutMs: 0 disables timeout in ClaudeCodeRunner

**Category**: ClaudeCodeRunner
**Priority**: must
**Source**: Task 3 / Design D3

```
GIVEN  a config with steps.defaults.timeoutMs: 0
AND    a queryFn mock that resolves normally
WHEN   ClaudeCodeRunner.run(ctx) is called
THEN   the result.completionReason === "success"
AND    no AbortController abort is triggered
```

---

## TC-036: defaults.timeoutMs is applied when no step-level override (ManagedAgentRunner)

**Category**: ManagedAgentRunner
**Priority**: must
**Source**: Task 1 / Design D1

```
GIVEN  a config with steps.defaults.timeoutMs: 600000
AND    no step-specific timeoutMs for the running step
WHEN   getStepExecutionConfig() is called with DEFAULT_POLL_TIMEOUT_MS as stepDefaults.timeoutMs
THEN   resolvedConfig.timeoutMs === 600000
AND    the resolved value is used instead of DEFAULT_POLL_TIMEOUT_MS
```

---

## TC-037: step-level timeoutMs overrides defaults in ManagedAgentRunner

**Category**: ManagedAgentRunner
**Priority**: must
**Source**: Task 1 / Design D1

```
GIVEN  a config with steps.defaults.timeoutMs: 600000
AND    steps["implementer"].timeoutMs: 300000
WHEN   getStepExecutionConfig() is called for step "implementer" with DEFAULT_POLL_TIMEOUT_MS as stepDefaults
THEN   resolvedConfig.timeoutMs === 300000
AND    the step-specific value takes precedence over both defaults and stepDefaults
```

---

## TC-038: resolveTimeoutMs removed; stepDefaults provides fallback for ManagedAgentRunner

**Category**: ManagedAgentRunner
**Priority**: must
**Source**: Task 1 / Design D1

```
GIVEN  no timeoutMs in config.steps.defaults and no step-specific timeoutMs
WHEN   getStepExecutionConfig() is called with stepDefaults.timeoutMs = DEFAULT_POLL_TIMEOUT_MS
THEN   resolvedConfig.timeoutMs === DEFAULT_POLL_TIMEOUT_MS (900000)
AND    resolveTimeoutMs function no longer exists in agent-runner.ts
AND    no test or source file imports resolveTimeoutMs
```

---

## TC-039: timeoutMs: 0 disables timeout in ManagedAgentRunner

**Category**: ManagedAgentRunner
**Priority**: should
**Source**: Task 1 / Design D3

```
GIVEN  a config with steps.defaults.timeoutMs: 0
WHEN   the inline expression resolvedConfig.timeoutMs === 0 ? null : resolvedConfig.timeoutMs is evaluated
THEN   the effective timeout is null
AND    no polling timeout is applied
```

---

## TC-040: No config → existing behavior preserved (no regression)

**Category**: Resolution chain
**Priority**: must
**Source**: Design D1, D2 / Requirement 3

```
GIVEN  a minimal config with no steps key at all
WHEN   ClaudeCodeRunner.run(ctx) is called
THEN   resolvedConfig.timeoutMs === null
AND    no AbortController is created
AND    result.completionReason === "success" on normal completion

WHEN   ManagedAgentRunner.run(ctx) is called
THEN   resolvedConfig.timeoutMs === DEFAULT_POLL_TIMEOUT_MS (fallback via stepDefaults)
AND    behavior matches existing polling timeout behavior
```

---

## TC-041: Non-timeout error is not misclassified as timeout (ClaudeCodeRunner)

**Category**: ClaudeCodeRunner
**Priority**: should
**Source**: Design D4

```
GIVEN  a config with steps.defaults.timeoutMs: 5000
AND    a queryFn mock that throws a non-abort error immediately
WHEN   ClaudeCodeRunner.run(ctx) is called
THEN   result.completionReason !== "timeout"
AND    the error is propagated through existing error handling
AND    abortController.signal.aborted === false at the time of the error
```

---

## TC-042: clearTimeout called on normal completion (ClaudeCodeRunner)

**Category**: ClaudeCodeRunner
**Priority**: could
**Source**: Task 2 / Design D2

```
GIVEN  a config with steps.defaults.timeoutMs: 5000
AND    a queryFn mock that resolves successfully before the timeout
WHEN   ClaudeCodeRunner.run(ctx) completes
THEN   the setTimeout timer is cleared (no dangling timer after run)
AND    result.completionReason === "success"
```
