# Test Cases: STEP_TIMEOUT halt records carry last-tool observation

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 18
- **Manual**: 0
- **Priority**: must: 17, should: 2, could: 1

---

## Tracker unit tests

### TC-001: Tracker — tool in-flight at timeout

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Last-tool tracker records the most recent tool and its completion > Scenario: tool observed and still in-flight at timeout

### TC-002: Tracker — tool completed before timeout

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Last-tool tracker records the most recent tool and its completion > Scenario: tool observed and completed before timeout

### TC-003: Tracker — no tool observed in the session

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Last-tool tracker records the most recent tool and its completion > Scenario: no tool observed in the session

### TC-004: Tracker — non-matching completion does not clear in-flight state

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Last-tool tracker records the most recent tool and its completion > Scenario: a non-matching completion does not clear in-flight state

---

## claude-code runner integration tests

### TC-005: claude-code — tool_use observed then stream goes silent

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: claude-code timeout error carries the last-tool observation > Scenario: tool_use observed then the stream goes silent

### TC-006: claude-code — tool_result observed before the silence

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: claude-code timeout error carries the last-tool observation > Scenario: tool_result observed before the silence

### TC-007: claude-code — no tool_use observed before timeout

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: claude-code timeout error carries the last-tool observation > Scenario: no tool_use observed before timeout

---

## codex runner integration tests

### TC-008: codex — item.started observed then stream goes silent

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: codex timeout error carries the last-tool observation > Scenario: item.started observed then the stream goes silent

### TC-009: codex — item.completed observed before the silence

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: codex timeout error carries the last-tool observation > Scenario: item.completed observed before the silence

### TC-010: codex — no tool item observed before timeout

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: codex timeout error carries the last-tool observation > Scenario: no tool item observed before timeout

---

## Persistence tests

### TC-011: Hint survives into the step-attempt error record

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the observation reaches the persisted step-attempt record > Scenario: hint survives into the step-attempt error

---

## Existing-behavior invariant tests

### TC-012: Timeout still transitions to awaiting-resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: existing timeout behavior is unchanged > Scenario: timeout still transitions to awaiting-resume

### TC-013: Inactivity message text is unchanged

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: existing timeout behavior is unchanged > Scenario: inactivity message text is unchanged

---

## Non-scenario tests (design / tasks derived)

### TC-014: isToolResult returns true for a valid tool_result message

**Category**: unit
**Priority**: must
**Source**: tasks.md § T-03

**GIVEN** a message object with `type: "user"` and a `message.content` array containing at least one block with `type: "tool_result"` and a `tool_use_id`
**WHEN** `isToolResult` is called with that message
**THEN** it returns `true`

### TC-015: isToolResult returns false for non-tool_result messages

**Category**: unit
**Priority**: must
**Source**: tasks.md § T-03

**GIVEN** each of: a `tool_use` content-block message, an `assistant` message, a `result` type message, a malformed object missing required fields, and a `user` message whose content contains only non-`tool_result` blocks
**WHEN** `isToolResult` is called with each
**THEN** it returns `false` for every case

### TC-016: Asymmetric best-effort id match

**Category**: unit
**Priority**: should
**Source**: design.md § D2; tasks.md § T-01

**GIVEN** a tracker on which `onToolStart("Bash", "cmd", "id-A")` was called, and then `onToolEnd(undefined)` is called (caller has no id)
**WHEN** `timeoutHint()` is rendered
**THEN** the hint indicates the tool is still in-flight (an id-less completion must not clear an id-tracked start — a false "completed" would mask a hung command)

**GIVEN** a tracker on which `onToolStart("Bash", "cmd", undefined)` was called (no id at start), and then `onToolEnd("any-id")` is called
**WHEN** `timeoutHint()` is rendered
**THEN** the hint indicates the tool completed (best-effort match; an id-less start accepts any completion)

### TC-017: step:progress is still emitted at all three claude-code observation sites

**Category**: integration
**Priority**: should
**Source**: design.md § D3; tasks.md § T-04

**GIVEN** the claude-code runner with the tracker wired in via an `observeMessage` closure
**WHEN** a `tool_use` content block is encountered at each of the three stream sites (main work loop line 658, postWork `onMessage` callback line 944, output-repair loop line 1021)
**THEN** a `step:progress` event is emitted for each occurrence, identical to the pre-wiring behavior, and `tracker.onToolStart` is also called at each site

### TC-018: Wall-clock timeout also receives the last-tool hint

**Category**: integration
**Priority**: could
**Source**: design.md § D5

**GIVEN** the claude-code runner has observed a `tool_use` block for `Bash` with a command target
**WHEN** the wall-clock timeout (not inactivity watchdog) fires and the runner returns a `STEP_TIMEOUT` error
**THEN** `error.hint` contains the last tool name, target, and in-flight marker, produced by the same `tracker.timeoutHint()` call that covers the inactivity sub-case

---

## Gate tests

### TC-019: typecheck and test suite pass green

**Category**: gate
**Priority**: must
**Source**: tasks.md § T-08

Verification phase: `verification` — runs `bun run typecheck && bun run test`.

### TC-020: Existing watchdog / timeout test files are byte-identical to main and green

**Category**: gate
**Priority**: must
**Source**: design.md § Existing timeout/watchdog test inventory (AC #5); tasks.md § T-08

Verification phase: `verification` — the six files enumerated in design.md's AC #5 table must each pass without modification:
`src/adapter/shared/__tests__/inactivity-watchdog.test.ts`,
`src/core/step/__tests__/executor-sequential-regression.test.ts`,
`src/core/step/__tests__/commit-orchestrator.test.ts`,
`src/core/step/__tests__/executor-drift-detection.test.ts`,
`src/core/step/__tests__/no-op-detect-exemption.test.ts`,
`src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`.

### TC-021: reset clears tracked state (retry-attempt isolation)

**Category**: unit
**Priority**: should
**Source**: design.md § D2 (reset API)

**GIVEN** a tracker on which `onToolStart("Bash", "cmd", "id-A")` was called, and then `reset()` is called (new retry attempt begins)
**WHEN** `timeoutHint()` is rendered
**THEN** the hint indicates no tool observed (state from a previous attempt never leaks into the current attempt's hint)

### TC-022: Replayed prior-session messages do not update tracker state

**Category**: unit
**Priority**: should
**Source**: design.md § D3 (replay skip)

**GIVEN** a claude-code stream that yields a current-session `tool_use` for `tu-1` followed by a `tool_result` for `tu-1` carrying `isReplay: true` (SDK session-resume replay), and then goes silent until the inactivity timeout fires
**WHEN** the STEP_TIMEOUT error record is produced
**THEN** the hint reports the tool as in-flight (the replayed completion is ignored; replayed messages update neither `step:progress` nor tracker state)

---

## Result

```yaml
result: completed
total: 22
automated: 20
manual: 0
must: 17
should: 2
could: 1
blocked_reasons: []
```
