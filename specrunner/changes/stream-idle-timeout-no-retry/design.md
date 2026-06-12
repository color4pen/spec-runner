# Design: stream-idle-timeout-no-retry

## Context

`ClaudeCodeRunner.run()` in `src/adapter/claude-code/agent-runner.ts` executes agent
sessions in up to four query phases:

1. **Main work turn** — `runMainWorkTurn()` wrapped in `retryWithBackoff`
2. **report_result follow-up loop** — lines ~436-459, bare `this.queryFn` calls
3. **postWorkPrompts loop** — lines ~463-517, bare `this.queryFn` calls
4. **Output verification loop** — lines ~523-571, already wrapped in try/catch (best-effort)

`retryWithBackoff` covers only phase 1. Phases 2 and 3 call `this.queryFn` and iterate
the async generator without any transient retry wrapper. An SDK exception thrown during
the generator iteration escapes to the outer `catch (err)` block (line ~620), which wraps
it with `Claude Code SDK query failed: ${cause.message}` and returns
`completionReason: "error"` with `transientRetryAttempts = 0`.

The realised error was:
```
Claude Code SDK query failed: Claude Code returned an error result:
  API Error: Stream idle timeout - partial response received
```

The single `Claude Code SDK query failed:` prefix is characteristic of the outer catch
(not of `maybeThrowTransientResult`, which would produce a double prefix). Combined with
`transientRetryAttempts = 0` and no `step:retry` events in the pipeline log, the error
originated in a follow-up query phase (phases 2 or 3) after the main work turn had
already succeeded.

The `"stream idle timeout"` token is present in `SIMPLE_TOKENS_LC` and would be detected
as transient by `isTransientAgentError`. The gap is purely topological: the error never
reaches a `retryWithBackoff` boundary.

## Goals / Non-Goals

**Goals**:
- Extend transient retry coverage to postWorkPrompts and report_result follow-up query turns
- Preserve the existing semantics: same `maxRetries`, `baseDelayMs`, `step:retry` event
  schema, and `transientRetryAttempts` field
- New tests pinning the fixed paths

**Non-Goals**:
- Transient retry for managed / codex adapters
- Changes to retry limits or backoff parameters
- Output verification loop (already best-effort; exceptions are swallowed)

## Decisions

### D1: Extract a shared `runFollowUpQueryWithRetry` helper inside `agent-runner.ts`

All follow-up query calls share the same pattern:

```
queryFn → async iterator → collect lastResult → handle error result
```

Rather than duplicating retry wiring in each loop, extract one private async helper
`runFollowUpQueryWithRetry(prompt, options, onMessage?)` that:

1. Calls `this.queryFn` and iterates the generator, calling `onMessage` for each item
2. On SDK exception — passes through; `retryWithBackoff` decides to retry or re-throw
3. On error result with transient `errors[]` content — throws internally (same as
   `maybeThrowTransientResult`) so `retryWithBackoff` treats it like a transient exception
4. On non-transient error result or success — returns `lastResult`
5. Wraps steps 1-4 in `retryWithBackoff` with the same `maxRetries + 1` / `baseDelayMs` /
   `isTransientError` / `sleepFn` / `onRetry` as the main work turn

The helper closes over `maxRetries`, `baseDelayMs`, `abortController`, `this.sleepFn`,
`ctx.emit`, `step.name`, and the mutable `transientRetryAttempts` counter — all of which
are already in scope.

**Rationale — why a single helper rather than per-loop inline retry:**
The three follow-up loops each call `queryFn` differently (different prompt, different
option shape, different message handlers). A shared helper separates the retry mechanism
from the loop-specific logic, keeping each site small. Inlining `retryWithBackoff` three
times would spread the same wiring across ~90 new lines with no abstraction boundary.

**Alternatives considered:**
- Lift all phases into one mega-retry: would restart the main work turn on a follow-up
  failure, changing semantics and cost profile. Rejected.
- Treat follow-up errors as best-effort (swallow): would hide real transient failures and
  leave jobs in an error state when they could have been recovered automatically. Rejected.

### D2: `transientRetryAttempts` accumulates across all turn types

The current main-work `onRetry` sets `transientRetryAttempts = attempt` (overwrites).
This is fine when only the main work retries. The follow-up helper's `onRetry` must
_increment_ instead of overwrite so that a main-work retry followed by a follow-up retry
gives the correct total.

Change the main-work `onRetry` to also increment (`transientRetryAttempts++`) rather than
assign. The semantics of the field — "total transient retries taken" — is preserved and
becomes correct across phases.

**Rationale:** The `AgentRunResult.transientRetryAttempts` field is used by the executor
to record how many retries occurred. Summation is the correct aggregation when retries
can occur in multiple phases.

### D3: Error result detection in the helper mirrors `maybeThrowTransientResult`

Inside `runFollowUpQueryWithRetry`, when `lastResult.subtype !== "success"`, join the
`errors[]` array and call `isTransientAgentError(new Error(joinedText))`. If true, throw
an error with code `CLAUDE_CODE_QUERY_FAILED_TRANSIENT` so that `retryWithBackoff` and
`isTransientAgentError` on the re-check both classify it correctly.

If the joined text is empty or not transient, return `lastResult` unchanged — the
calling loop then handles the non-success result as before (early `return` with
`completionReason: "error"`).

## Risks / Trade-offs

- [Risk] Follow-up turn retries add latency. A transient stream idle timeout at minute 14
  of a 15-minute step could trigger up to 3 retries × backoff — adding significant wall
  time before the step finally halts. Mitigation: this is the same trade-off already
  accepted for the main work turn. The backoff ceiling is bounded by `baseDelayMs × 2^2 =
  4 s` at the default settings, which is acceptable.

- [Risk] Accumulating `transientRetryAttempts` across phases changes the value seen in
  logs/state. Mitigation: the field is informational; downstream code only checks
  presence vs. absence, not magnitude.

## Open Questions

None. The approach is fully determined by the existing retry architecture.
