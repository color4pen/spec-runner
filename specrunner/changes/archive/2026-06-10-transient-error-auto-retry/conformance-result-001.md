# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All 11 tasks (T-01–T-11), every checkbox [x] |
| design.md | ✓ | D1–D6 all implemented as specified; re-entry semantics documented |
| spec.md | ✓ | All 7 requirements and all scenarios satisfied |
| request.md | ✓ | All 7 acceptance criteria met; typecheck && test green (4024/4024) |

---

## Detail

### tasks.md

All 11 tasks have every checkbox marked `[x]`. No incomplete items.

### design.md

| Decision | Conformance |
|----------|-------------|
| D1 — retry inside `ClaudeCodeRunner.runMainWorkTurn()` | `agent-runner.ts:302` extracts the function; `retryWithBackoff` wraps it at `:335`. redirect / subtype / follow-up / postWork are outside the retry boundary. ✓ |
| D1 — re-entry semantics documented | `design.md` "再入セマンティクス" section covers new session per retry, worktree residuals, and idempotency rationale per step class. ✓ |
| D1 — budget = in-memory counter; reset-on-success equivalence | `transientRetryAttempts` is a local var inside `run()`; equivalence argument documented. ✓ |
| D2 — fail-closed whitelist; 5xx numeric only with status context | `transient-error.ts` uses `SIMPLE_TOKENS_LC` + `STATUS_5XX_PATTERN` with context requirement. ✓ |
| D3 — top-level `transientRetry` config; `maxRetries=0` skips wrapper | `schema.ts:244–276`; `agent-runner.ts:330–332` direct call path with no events. ✓ |
| D4 — observability via `followUpAttempts` pattern | `AgentRunResult` → `StepResultInput` → `StepOutcome` → `StepAttemptRecord` → `fold()` all carry the field with `undefined`-omit semantics. `step:retry` DomainEvent → `progress.ts` stderr + `pipeline-logger.ts`. ✓ |
| D5 — halt fallthrough reuses existing catch | `retryWithBackoff` re-throws on exhaustion; existing catch at `:540–570` converts to `completionReason:"error"` / `CLAUDE_CODE_QUERY_FAILED`. Transition table unchanged. ✓ |
| D6 — `_sleepFn` injection for test | `ClaudeCodeRunnerDeps._sleepFn` wired at `:141`. ✓ |

### spec.md

| Requirement | Scenarios | Conformance |
|-------------|-----------|-------------|
| R1 — fail-closed whitelist | connection-refused → true; FailedToOpenSocket → true; unknown → false | ✓ |
| R2 — finite retries with backoff | 1 transient then success; persistent → `maxRetries+1` invocations; non-transient → 1 invocation | ✓ |
| R3 — wall-clock timeout not retried | `!abortController.signal.aborted` guard; `completionReason:"timeout"` preserved | ✓ |
| R4 — exhaustion falls through to existing halt | re-throw → executor → `awaiting-resume` + `resumePoint`; escalation semantics unchanged | ✓ |
| R5 — observability | `transientRetryAttempts` in state.json and events.jsonl on success-after-retry and halt-after-retry; stderr retry line on `step:retry` | ✓ |
| R6 — configurable budget; 0 = current behaviour | default 3; `maxRetries=0` skips wrapper, no events, no attempts recorded | ✓ |
| R7 — backward compatibility | field optional at every layer; legacy journal lines fold cleanly | ✓ |

### request.md

| AC | Verification |
|----|-------------|
| transient × 1 then success → no halt | `agent-runner-transient-retry.test.ts` AC1 block ✓ |
| persistent transient → 3 retries → halt (bounded) | AC2 block asserts `queryFn` called `maxRetries+1` times exactly ✓ |
| non-transient error → immediate halt | AC3 block ✓ |
| attempt count in state + progress output | `transient-retry-state.test.ts`; `progress-retry.test.ts` ✓ |
| `maxRetries=0` → current behaviour | AC5 block: 1 call, no `step:retry` events ✓ |
| re-entry semantics documented in design.md | D1 section "再入セマンティクス" ✓ |
| `typecheck && test` green | verification-result.md: build ✓ typecheck ✓ test 4024/4024 ✓ lint ✓ |

### Observations (non-blocking)

- `delayMs` in `onRetry` is computed as `baseDelayMs * 2^(attempt-1)`, matching `retryWithBackoff`'s internal schedule — the value emitted in `step:retry` is accurate.
- `resumeFallbackDone` is scoped outside `runMainWorkTurn`, so the resume→new-session fallback fires at most once across all retry attempts; subsequent retries start from a fresh session directly.
- `transientRetryAttempts` is conditionally included (`maxRetries > 0`) on all return paths (success, error, timeout, redirect-limit, result-file-not-found), preserving the "no field when feature disabled" invariant everywhere.
