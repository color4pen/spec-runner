# Tasks: add-global-default-timeout

## [x] Task 1: Unify ManagedAgentRunner timeout resolution (D1)

**File**: `src/adapter/managed-agent/agent-runner.ts`

Both `runProposeStyle` (L194) and `runPollingStyle` (L384) call `getStepExecutionConfig()` without `timeoutMs` in stepDefaults, then apply `resolveTimeoutMs()` as secondary fallback.

1. In `runProposeStyle` (L194), pass `DEFAULT_POLL_TIMEOUT_MS` as `stepDefaults.timeoutMs`:

```typescript
// Before:
const resolvedConfig = getStepExecutionConfig(config, step.name, { model: step.agent.model });
const timeoutMs = resolveTimeoutMs(resolvedConfig.timeoutMs);

// After:
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
  timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
});
const timeoutMs = resolvedConfig.timeoutMs === 0 ? null : resolvedConfig.timeoutMs;
```

2. Apply the same change in `runPollingStyle` (L384)

3. Remove the `resolveTimeoutMs` function (L58-61) and its export. Update any imports if referenced elsewhere (check with grep).

## [x] Task 2: Add wall-clock timeout to ClaudeCodeRunner (D2, D4)

**File**: `src/adapter/claude-code/agent-runner.ts`

In `ClaudeCodeRunner.run()`, after the existing `resolvedConfig` computation (L130-133):

1. Create AbortController and schedule timeout:

```typescript
const abortController = new AbortController();
let timeoutId: ReturnType<typeof setTimeout> | undefined;
if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
  timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
}
```

2. Pass `abortController` to `query()` options (L144-153):

```typescript
options: {
  cwd,
  allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
  permissionMode: "bypassPermissions",
  ...maxTurnsOption,
  model: resolvedConfig.model,
  abortController,
},
```

3. In the existing `catch (err)` block (L191-201), add abort detection BEFORE the generic error return:

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

4. Add `finally` cleanup after the try-catch to clear timeout on normal completion:

```typescript
} finally {
  if (timeoutId !== undefined) clearTimeout(timeoutId);
}
```

Note: the `finally` must wrap the entire try-catch that contains the query iteration, so the structure becomes try { query + iterate } catch { abort/error } finally { clearTimeout }. Ensure the existing `catch` returns before `finally` runs.

## [x] Task 3: Add ClaudeCodeRunner timeout tests

**File**: `tests/unit/adapter/claude-code/agent-runner.test.ts`

### TC-032: timeoutMs triggers abort and returns timeout result

- Create config with `steps: { defaults: { timeoutMs: 50 } }` (50ms — fast for tests)
- Create a mock `queryFn` that emits messages slowly (e.g., `await new Promise(r => setTimeout(r, 200))` before yielding result)
- Run `ClaudeCodeRunner.run(ctx)`
- Assert `result.completionReason === "timeout"`
- Assert `result.error.code === "STEP_TIMEOUT"`

### TC-033: timeoutMs null means no timeout (default behavior)

- Create config without `steps` (defaults to no timeout)
- Create a mock `queryFn` that resolves normally
- Run `ClaudeCodeRunner.run(ctx)`
- Assert `result.completionReason === "success"` (no timeout interference)

### TC-034: step-level timeoutMs overrides defaults

- Create config with `steps: { defaults: { timeoutMs: 50 }, "spec-review": { timeoutMs: 5000 } }`
- Create a mock `queryFn` that takes 100ms
- Run with stepName "spec-review"
- Assert `result.completionReason === "success"` (step-level 5000ms > 100ms execution)

### TC-035: timeoutMs: 0 disables timeout

- Create config with `steps: { defaults: { timeoutMs: 0 } }`
- Create a mock `queryFn` that resolves normally
- Run `ClaudeCodeRunner.run(ctx)`
- Assert `result.completionReason === "success"` (0 = no timeout)

## [x] Task 4: Verify

- `bun run typecheck` passes
- `bun run test` passes
