# Test Cases: detach-start-ack

## Summary

- **Total**: 24 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 21, should: 3, could: 0

---

## Spec-Derived Test Cases (GWT 省略、Source 参照のみ)

### TC-001: Parent does not exit while registration is pending

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The detach parent SHALL wait for registration or child death before exiting > Scenario: parent does not exit while registration is pending and the child is alive

### TC-002: Parent exits 0 with guidance on registration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The detach parent SHALL wait for registration or child death before exiting > Scenario: parent exits 0 with guidance once the child registers

### TC-003: job wait finds the job immediately after a successful detach start

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: A registered exit 0 SHALL guarantee the job is discoverable > Scenario: job wait finds the job immediately after a successful detach start

### TC-004: Resume does not treat stale sidecar as registration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A registered exit 0 SHALL guarantee the job is discoverable > Scenario: resume does not treat a stale sidecar as registration

### TC-005: Pre-registration child death propagates as non-zero exit with log tail

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A child that dies before registering SHALL fail the parent with the log tail > Scenario: pre-registration child death propagates as a non-zero exit with the log tail

### TC-006: Spawn failure does not hang the parent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A child that dies before registering SHALL fail the parent with the log tail > Scenario: spawn failure does not hang the parent

### TC-007: Registration on same tick as death is treated as success

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A child that dies before registering SHALL fail the parent with the log tail > Scenario: registration observed on the same tick as death is treated as success

### TC-008: Not-found output carries the detach-log hint

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait` "No job found" SHALL include a detach-log hint > Scenario: not-found output carries the detach-log hint

### TC-009: Help no longer promises immediate return

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Help and guidance wording SHALL follow the new contract, with failure text defined once > Scenario: help no longer promises immediate return

### TC-010: Failure message is a single pinnable definition

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Help and guidance wording SHALL follow the new contract, with failure text defined once > Scenario: failure message is a single pinnable definition

### TC-011: Detach child still runs foreground without re-spawning

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Foreground and detach-child behavior SHALL be unchanged > Scenario: detach child still runs foreground without re-spawning

---

## Non-Scenario Test Cases (GWT 必須)

### TC-012: onExit callback is registered on the child handle when provided

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add `onExit` callback to `spawnBackground`

**GIVEN** `SpawnBackgroundOptions` includes an `onExit` callback
**WHEN** `spawnBackground` is called with those options
**THEN** `proc.on("exit", onExit)` is registered on the spawned child process handle; no other existing option behavior is affected

### TC-013: Spawn shape is synchronous up-front inside async detachSelf

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: Make `detachSelf` async and child-death-gated with injected seams

**GIVEN** `detachSelf` is called with an injected `spawnFn` spy and ack seams configured to never resolve
**WHEN** `detachSelf` is invoked (the returned promise is not yet settled)
**THEN** `spawnFn` has already been called synchronously (before the first await), so spawn-shape assertions on `detached`, `logFilePath`, and `DETACH_MARKER_ENV` can be made immediately after invocation without awaiting the promise

### TC-014: Destructive check — removing the registration gate causes premature resolution

**Category**: unit
**Priority**: must
**Source**: request.md > 受け入れ基準 "親は登録完了まで exit しないことをテストで固定する…破壊確認込み"

**GIVEN** an injected `readSidecarPid` that initially returns `null` for several ticks and then returns `childPid`
**WHEN** the ack loop's registration check is bypassed (e.g., the check is removed or forced to resolve immediately)
**THEN** the assertion "promise does not resolve before registration" fails — confirming the registration gate is real and not vacuous

### TC-015: detach-flag-cli mock updated from mockReturnValue to mockResolvedValue

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Update the existing pin tests to the new contract

**GIVEN** `src/cli/__tests__/detach-flag-cli.test.ts`
**WHEN** the `detachSelf` mock declaration at line 39 and the inline override at line 216 are inspected
**THEN** both use `mockResolvedValue(0)` (not `mockReturnValue(0)`), and the TC-004 / TC-024 assertions in that file pass with the async mock; no other assertions in the file change

### TC-016: detach-output-contract adds pins for failure message constant and reworded help

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Update the existing pin tests to the new contract

**GIVEN** `src/cli/__tests__/detach-output-contract.test.ts`
**WHEN** the test file is inspected after the update
**THEN** it contains at least one new pin verifying the `buildDetachStartFailure` output includes the slug and the detach-log path; it also contains an assertion that the `--detach` help/usage text no longer contains the phrase "returns immediately" or "即座に return"; existing TC-019 / TC-026 / TC-027 / TC-028 assertions remain unchanged and green

### TC-017: spawn-background-detach tests pass unchanged

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add `onExit` callback to `spawnBackground` / T-05: Update the existing pin tests

**GIVEN** `src/util/__tests__/spawn-background-detach.test.ts` with no `onExit` in any existing call
**WHEN** the test suite runs after the `SpawnBackgroundOptions` change
**THEN** all pre-existing test cases pass without modification (assertions on `detached`, `stdio`, `env`, `unref`, `openSync` are unaffected)

### TC-018: xdg-detach-log tests pass unchanged

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Update the existing pin tests to the new contract

**GIVEN** `src/util/__tests__/xdg-detach-log.test.ts`
**WHEN** the test suite runs
**THEN** all pre-existing test cases pass without modification

### TC-019: job-wait.test.ts pre-existing it() blocks pass unchanged

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: Add a detach-log hint to `job wait` "No job found" / T-05

**GIVEN** `src/cli/__tests__/job-wait.test.ts` existing `it()` blocks (including exit 2 + 5-retry assertions)
**WHEN** the test suite runs after adding the hint line to the not-found error output
**THEN** all pre-existing test cases pass without modification (the hint line does not change exit code or retry count)

### TC-020: Integration — detachSelf SUCCESS followed by loadState finds the job

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06: Integration test

**GIVEN** a test fixture in `src/core/command/__tests__/detach-integration.test.ts` with a fake `spawnFn` (known child pid), an injected `readSidecarPid` that returns `childPid` after one poll, and state.json written to the fixture path
**WHEN** `detachSelf` resolves `EXIT_CODE.SUCCESS` and `loadState(slug)` is called against the same fixture paths
**THEN** `loadState` returns a valid job record (not null / not-found), asserting that ack exit 0 guarantees discoverability

### TC-021: Integration destructive — GENERAL_ERROR when child dies without registering

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06: Integration test (destructive branch)

**GIVEN** a fixture where `readSidecarPid` never returns `childPid` and the injected `spawnFn` fires `onExit` before any registration
**WHEN** the ack loop processes the child death
**THEN** `detachSelf` resolves `EXIT_CODE.GENERAL_ERROR`; a subsequent `loadState` call is irrelevant, and the test asserts `GENERAL_ERROR` in this branch

### TC-022: Detach-log tail read uses exactly 40 lines

**Category**: unit
**Priority**: should
**Source**: design.md > D4: Failure is propagated by transcribing the detach log tail (N = 40)

**GIVEN** `detachSelf` with an injected `readDetachLogTail` spy and a child that fires `onExit` before any registration
**WHEN** the ack loop resolves `GENERAL_ERROR`
**THEN** `readDetachLogTail` is called with `lines = 40`

### TC-023: Poll interval defaults to 200 ms

**Category**: unit
**Priority**: should
**Source**: design.md > Open Questions "Ack poll interval: 200 ms"

**GIVEN** the `DetachSelfDeps` (or equivalent) object's production default
**WHEN** `pollIntervalMs` is inspected
**THEN** its default value is `200`

### TC-024: typecheck && test green

**Category**: gate
**Priority**: must
**Source**: request.md > 受け入れ基準 "`typecheck && test` が green"

verification phase: `typecheck` then `test` (all test suites pass with zero failures)

---

## Result

```yaml
result: completed
total: 24
automated: 23
manual: 0
must: 21
should: 3
could: 0
blocked_reasons: []
```
