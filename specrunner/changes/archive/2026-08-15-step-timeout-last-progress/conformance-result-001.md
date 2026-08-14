# Conformance Result — step-timeout-last-progress — iter 1

## 検証した項目

### spec.md — Requirements & Scenarios

**Requirement: Last-tool tracker records the most recent tool and its completion**

- `src/adapter/shared/last-tool-tracker.ts`: `onToolStart` sets `last = { tool, target, startedAt: now(), id, done: false }` replacing any prior entry. `onToolEnd` correlates via `const correlates = last.id === undefined || id === last.id` — id-tracked start rejects id-less end; id-less start accepts any end. `timeoutHint()` returns exactly the three D4 strings. `reset()` nulls state.
- Scenarios covered by tests in `src/adapter/shared/__tests__/last-tool-tracker.test.ts`:
  - In-flight at timeout → TC-001 ✓
  - Completed before timeout → TC-002 ✓
  - No tool observed → TC-003 ✓
  - Non-matching id does not clear in-flight → TC-004 ✓
- Additional design-derived cases: TC-016 (asymmetric best-effort), TC-021 (reset isolation) ✓

**Requirement: claude-code timeout error carries the last-tool observation**

- `src/adapter/claude-code/agent-runner.ts`: tracker constructed per `run()` call. `observeMessage` closure wraps `emitToolProgress` + tracker calls at all three stream sites (main work loop line 676, postWork follow-up line 963, output-repair line 1040). Replay guard (`isReplay === true`) blocks prior-session completions. `tracker.reset()` at entry of `runMainWorkTurn`. `hint: tracker.timeoutHint()` set in STEP_TIMEOUT catch.
- Scenarios: TC-005 (tool_use → in-flight hint), TC-006 (tool_result → completed hint), TC-007 (no tool → "no tool observed") ✓
- TC-022 (replay blocked): replayed `tool_result` does not clear in-flight state ✓
- TC-017 sites: site 1 verified inline in TC-005 (emitSpy); sites 2 & 3 have dedicated tests ✓

**Requirement: codex timeout error carries the last-tool observation**

- `src/adapter/codex/agent-runner.ts`: tracker constructed per `run()` call. `tracker.onToolStart` called in `item.started` handler when `extractCodexProgress ≠ null`. `tracker.onToolEnd` called in `item.completed` handler when `extractCodexProgress ≠ null` (non-tool items skipped). `tracker.reset()` at entry of `runMainWorkTurn`. `hint: tracker.timeoutHint()` set in STEP_TIMEOUT catch.
- Scenarios: TC-008 (item.started → in-flight hint), TC-009 (item.completed → completed hint), TC-010 (non-tool / no items → "no tool observed") ✓

**Requirement: the observation reaches the persisted step-attempt record**

- `src/core/step/step-halt.ts:131`: `makeTimeoutHalt` reads `(err as Error & { hint?: string }).hint ?? ""` into `ErrorInfo.hint` (unchanged from main).
- TC-011: verifies `makeTimeoutHalt` propagates a non-empty `hint` string into `halt.error.hint` unchanged.
- `src/store/event-journal.ts` is unchanged (confirmed by empty diff); the `ErrorInfo.hint → events.jsonl` path is established pre-existing code.

**Requirement: existing timeout behavior is unchanged**

- TC-012: `makeTimeoutHalt` produces `kind=awaiting-resume`, `reason=timeout` ✓
- TC-013: `error.message === formatInactivityTimeoutMessage(stepName, elapsed)`; `error.hint` is separate ✓
- AC #5 — six invariant test files: `git diff main...HEAD` for all six files returns empty (byte-identical to main) ✓
- Source files guarded by invariant tests are also unchanged: `inactivity-watchdog.ts`, `step-halt.ts`, `event-journal.ts` ✓

### request.md — Acceptance Criteria

| AC | Status |
|----|--------|
| claude-code: tool_use → timeout records tool name/target/elapsed | ✓ TC-005 |
| codex: item.started → timeout records tool name/target/elapsed | ✓ TC-008 |
| tool_result/item.completed observed → not in-flight | ✓ TC-006, TC-009 |
| No tool observed → "no tool observed" | ✓ TC-007, TC-010 |
| Existing watchdog tests listed in design, unlisted unchanged and green | ✓ 6 files byte-identical to main |
| `typecheck && test` green | ✓ verification-result.md: all phases passed |

---

## 検証できなかった項目

- **TC-018 (wall-clock timeout hint)**: "could" priority per test-cases.md; no test present. Acceptable per priority designation.
- **events.jsonl full round-trip** (write + read-back for TC-011): test exercises `makeTimeoutHalt` boundary only. Design.md documents the downstream path as established pre-existing code; acceptable.

---

## Findings 詳細

None. All normative Requirements and Scenarios from spec.md and all acceptance criteria from request.md are satisfied.
