# Design: transient-retry-coverage

## Context

The transient-error auto-retry subsystem (`src/adapter/claude-code/transient-error.ts`,
`src/adapter/claude-code/agent-runner.ts`) has two coverage gaps that allowed a
"Stream idle timeout" failure to escape the retry loop and halt a run that a human
had to manually resume.

**Gap 1 — token whitelist**: `"stream idle timeout"` is absent from
`SIMPLE_TOKENS_LC`. The SDK wraps child-process error results as
`Claude Code returned an error result: <text>` and throws. That throw reaches
`isTransientAgentError` via the existing throw path (agent-runner.ts:335-339),
but substring-match fails because the token is missing.

**Gap 2 — error result path**: When the SDK child process stays alive but returns
a structured `subtype !== "success"` result, the check happens at
`agent-runner.ts:372-386` — outside the `retryWithBackoff` wrapper. Even when the
error text is transient, `retryWithBackoff` never sees it and no retry fires.

## Goals / Non-Goals

**Goals**:
- Add `"stream idle timeout"` to the whitelist so the exact observed error is
  classified as transient.
- Wire the error result path into the retry wrapper by converting a transient error
  result to a throw inside `runMainWorkTurn`, so existing backoff and
  `step:retry` emission work unchanged.
- Keep fail-closed semantics: any result whose error text is non-transient (or whose
  `errors[]` array is empty) continues to halt immediately.

**Non-Goals**:
- inbox-layer halt/resume automation
- managed runtime error classification
- sleep-prevention (caffeinate etc.) and other operational configuration

## Decisions

### D1 — Add `"stream idle timeout"` to `SIMPLE_TOKENS_LC`

**Rationale**: The exact observed message is `API Error: Stream idle timeout -
partial response received`. The token `"stream idle timeout"` is unambiguous —
it appears only in SDK stream-lifecycle errors and has no false-positive overlap
with domain text. Adding it follows the same whitelist convention already used for
`"socket timeout"` and `"gateway timeout"`.

**Alternatives considered**:
- Broader token `"idle timeout"`: rejected — too broad, could match unrelated
  application-level timeout messages.
- Regex pattern: unnecessary complexity for a simple substring; the existing
  approach is sufficient.

### D2 — Convert transient error result to throw inside `runMainWorkTurn`

**Rationale**: `retryWithBackoff` already handles both throw-based and
`shouldRetryResult`-based retry (see `src/util/retry.ts`). The architect directive
says "error result を transient 判定時にその単位内の throw へ変換する形で既存
wrapper に乗せる". Throwing from `runMainWorkTurn` reuses the existing
`isTransientError` callback in `retryWithBackoff`, all existing `step:retry` event
emission, and the existing exhaustion→halt path — without new retry layers or new
config fields.

**Placement**: The check is added at the end of `runMainWorkTurn`, after the
primary call (and optional resume-fallback call) resolves. The function extracts
`errors[]` from the result, joins them, calls `isTransientAgentError`, and throws
when transient. Non-transient results are returned unchanged; the existing handler
at line 372 continues to own that case.

**Error message on throw**: `Claude Code SDK query failed: <joined errors text>`.
This matches the format already used by the outer non-success handler and preserves
the error text for observability.

**Alternatives considered**:
- `shouldRetryResult` hook in `retryWithBackoff`: would work, but requires
  threading an extra callback through the call site and the architect explicitly
  preferred the throw-conversion approach.
- Moving the non-success check into `runQuery()`: rejected — `runQuery` is a pure
  SDK bridge; mixing retry-trigger logic there would break single-responsibility
  and complicate the resume-fallback branch in `runMainWorkTurn`.

### D3 — `isTransientAgentError` is reused as-is for error result text

**Rationale**: The function already operates on an `unknown` value and recursively
collects `.message` strings. Constructing `new Error(joinedErrorText)` and passing
it in is the simplest way to reuse the classifier without exposing internal helpers.
No new export is needed from `transient-error.ts`.

## Risks / Trade-offs

- **[Risk] False-positive transient classification of error results**: If an
  agent returns an `error_during_execution` result containing a token such as
  `"service unavailable"` for a domain-level reason (e.g. the agent's target API
  is down), the step will be retried before halting. Mitigation: the retry budget
  (default `maxRetries=3`) bounds the extra cost; the step will still halt after
  exhaustion. Fail-closed semantics are intact — unknown tokens still halt
  immediately.

- **[Risk] `errors[]` empty or missing**: Some error result subtypes may carry
  no `errors` array. In that case `joinedErrorText` is empty, `isTransientAgentError`
  returns false, and the result is returned unchanged — the existing handler halts.
  No regression.

## Open Questions

None. All design decisions are settled by the architect evaluation in request.md.
