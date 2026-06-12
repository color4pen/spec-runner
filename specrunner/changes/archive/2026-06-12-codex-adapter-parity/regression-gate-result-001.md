# Regression Gate Result — Iteration 1

- **verdict**: needs-fix

## TC-012 [MEDIUM] — abort signal suppresses transient retry

- **status**: fixed
- **file**: tests/adapter/codex/agent-runner-transient-retry.test.ts (lines 213–258)
- **detail**: Test "abort signal active: transient error does not trigger retry (guard exercised)" is present. It injects a genuinely transient error (`ConnectionRefused`) after the AbortSignal fires, sets `timeoutMs: 100`, advances fake timers, and asserts `completionReason === "timeout"`, zero `step:retry` events, and `callCount === 1`. The `!signal.aborted` guard in `isTransientError` is exercised.

## TC-026 [LOW] — typed-outcome follow-up turn transient retry

- **status**: not fixed
- **severity**: high
- **resolution**: fixable
- **file**: tests/adapter/codex/agent-runner-transient-retry.test.ts
- **detail**: No dedicated test for the transient retry path inside the typed-outcome (outputSchema) follow-up loop. `agent-runner.test.ts` covers outputSchema presence on retry turns but does not test a transient error injected during the outputSchema follow-up and verify retry + `step:retry` emission. The postWorkPrompts transient retry test covers a different path. A test case is needed: outputSchema follow-up turn raises a transient error once, then succeeds on retry, with `transientRetryAttempts ≥ 1` and `≥ 1 step:retry` events.
