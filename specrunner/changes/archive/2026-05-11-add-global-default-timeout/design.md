# Design: add-global-default-timeout

## Root Cause

PR #95 (step-config-externalization) added `timeoutMs` to the config schema and `getStepExecutionConfig()` resolution chain, but explicitly deferred consumption:

> Non-Goals: "timeoutMs の実装（SDK に timeout パラメータなし。config 定義のみ用意）"

The resolution chain in `src/config/step-config.ts` already correctly resolves `timeoutMs` through 4 levels (step-level > defaults > stepDefaults > null). Tests TC-017, TC-024, TC-025 confirm this. **No change needed in step-config.ts.**

The gap is in the two runtimes' consumption of the resolved value:

| Runtime | Current behavior | Expected |
|---------|-----------------|----------|
| `ManagedAgentRunner` | Uses `getStepExecutionConfig()` + `resolveTimeoutMs()`. `resolveTimeoutMs` applies a secondary fallback (null → `DEFAULT_POLL_TIMEOUT_MS` 900s) outside the step-config chain | Polling default should be injected via `stepDefaults.timeoutMs` so the 4-level chain handles it |
| `ClaudeCodeRunner` | Calls `getStepExecutionConfig()` but **ignores** `resolvedConfig.timeoutMs` entirely | Enforce wall-clock timeout via `AbortController` + `setTimeout` |

## Design

### D1: Unify ManagedAgentRunner timeout into step-config chain

`resolveTimeoutMs()` in `agent-runner.ts:58-61` applies `null → DEFAULT_POLL_TIMEOUT_MS` as a secondary default that bypasses the 4-level resolution chain. This makes the managed-agent runner's timeout behavior opaque to the config system.

**Fix**: Pass `DEFAULT_POLL_TIMEOUT_MS` as `stepDefaults.timeoutMs` when calling `getStepExecutionConfig()`, so the 4-level chain resolves the default:

```typescript
// Before:
const resolvedConfig = getStepExecutionConfig(config, step.name, { model: step.agent.model });
const timeoutMs = resolveTimeoutMs(resolvedConfig.timeoutMs);

// After:
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
  timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
});
const effectiveTimeoutMs = resolvedConfig.timeoutMs === 0 ? null : resolvedConfig.timeoutMs;
```

Resolution chain after this change:
1. `config.steps.implementer.timeoutMs: 300000` → 300000
2. `config.steps.defaults.timeoutMs: 600000` → 600000
3. (none) → `DEFAULT_POLL_TIMEOUT_MS` (900000) via stepDefaults
4. (unreachable — stepDefaults always provides a value)

`resolveTimeoutMs()` is inlined to a single expression (`=== 0 ? null : value`). The function can be removed.

### D2: ClaudeCodeRunner wall-clock timeout via AbortController

The Claude Code SDK's `query()` accepts `abortController?: AbortController` in its Options. Use this to enforce a wall-clock timeout.

```typescript
const resolvedConfig = getStepExecutionConfig(ctx.config, step.name, {
  model: step.agent.model,
  maxTurns: dynamicMaxTurns ?? step.maxTurns,
  // No timeoutMs default — null = no timeout for local SDK (correct SDK default)
});

const abortController = new AbortController();
let timeoutId: ReturnType<typeof setTimeout> | undefined;
if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
  timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
}
```

Pass `abortController` to `query()` options. On abort, return `{ completionReason: "timeout" }` consistent with ManagedAgentRunner.

ClaudeCodeRunner does NOT pass `timeoutMs` as stepDefaults — the SDK has no inherent timeout, and `null` (no timeout) is the correct default for local execution.

### D3: 0-semantics preserved

`timeoutMs: 0` means "explicitly disable timeout" (validated as non-negative integer, TC-016r/TC-024). Both runtimes convert 0 → no timeout:

- ManagedAgentRunner: `0 → null` → no polling timeout
- ClaudeCodeRunner: `0` → skip AbortController setup → no timeout

### D4: Abort detection in ClaudeCodeRunner

When the AbortController fires, the SDK's async generator throws. Distinguish timeout abort from other errors by checking `abortController.signal.aborted`:

```typescript
} catch (err) {
  if (abortController.signal.aborted && timeoutId !== undefined) {
    clearTimeout(timeoutId);
    return {
      completionReason: "timeout",
      resultContent: null,
      error: Object.assign(
        new Error(`Step '${step.name}' timed out after ${resolvedConfig.timeoutMs}ms`),
        { code: "STEP_TIMEOUT" },
      ),
    };
  }
  // ... existing error handling
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/adapter/managed-agent/agent-runner.ts` | Pass `DEFAULT_POLL_TIMEOUT_MS` as `stepDefaults.timeoutMs`, inline `resolveTimeoutMs` |
| `src/adapter/claude-code/agent-runner.ts` | Add AbortController-based wall-clock timeout using `resolvedConfig.timeoutMs` |
| `tests/unit/adapter/claude-code/agent-runner.test.ts` | Add timeout enforcement tests |

## No Delta Spec Required

The `step-execution-architecture` spec already defines the 4-level resolution chain including `timeoutMs`. The `cli-config-store` spec already includes `timeoutMs` in `StepExecutionConfig`. This fix closes an implementation gap without changing specified behavior.
