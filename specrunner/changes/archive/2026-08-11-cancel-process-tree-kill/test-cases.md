# Test Cases: job cancel process-tree kill

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 17, should: 2, could: 1

---

## TC-001: state.pid drives the kill

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Cancel resolves the kill-target pid from state then a jobId-matched sidecar > Scenario: state.pid drives the kill

---

## TC-002: sidecar fills in a null state.pid

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Cancel resolves the kill-target pid from state then a jobId-matched sidecar > Scenario: sidecar fills in a null state.pid

---

## TC-003: foreign sidecar is not adopted

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Cancel resolves the kill-target pid from state then a jobId-matched sidecar > Scenario: foreign sidecar is not adopted

---

## TC-004: awaiting-resume with a resolved live pid is killed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Cancel gates the kill on process liveness, not on job status > Scenario: awaiting-resume with a resolved live pid is killed

破壊確認: status gate を復元すると SIGTERM が送信されないことを同じテストで固定する。

---

## TC-005: no resolvable pid warns and continues

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Cancel gates the kill on process liveness, not on job status > Scenario: no resolvable pid warns and continues

---

## TC-006: leader pid escalation reaps the group

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Graceful kill reaps the process group on SIGKILL escalation only for group leaders > Scenario: leader pid escalation reaps the group

---

## TC-007: non-leader pid escalation does not touch the group

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Graceful kill reaps the process group on SIGKILL escalation only for group leaders > Scenario: non-leader pid escalation does not touch the group

---

## TC-008: SIGTERM aborts the registered query controller

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The runner aborts in-flight agent queries on SIGINT/SIGTERM before exit > Scenario: SIGTERM aborts the registered query controller

破壊確認: `abortActive()` 呼び出しを除去するとコントローラが abort されないことを同じテストで固定する。

---

## TC-009: awaiting-resume is still persisted after abort

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The runner aborts in-flight agent queries on SIGINT/SIGTERM before exit > Scenario: awaiting-resume is still persisted after abort

---

## TC-010: drain timeout does not block awaiting-resume persist and exit

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The runner aborts in-flight agent queries on SIGINT/SIGTERM before exit > Scenario: drain timeout does not block awaiting-resume persist and exit

---

## TC-011: group reap is reported in cancel output

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Cancel output distinguishes a skipped kill from a group reap > Scenario: group reap is reported

---

## TC-012: skipped kill is reported in cancel output

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Cancel output distinguishes a skipped kill from a group reap > Scenario: skipped kill is reported

---

## TC-013: resolveJobPid pure unit — statePid wins over sidecar

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `statePid` is 1234 and sidecar carries `{ pid: 5678, jobId: <matching id> }`
**WHEN** `resolveJobPid({ statePid: 1234, sidecar, expectedJobId })` is called
**THEN** returns `{ pid: 1234, source: "state" }` (sidecar pid ignored)

fs 不要の純粋関数テスト。

---

## TC-014: resolveJobPid pure unit — sidecar adopted on jobId match

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `statePid` is null and sidecar carries `{ pid: 5678, jobId: "job-a" }` and `expectedJobId` is `"job-a"`
**WHEN** `resolveJobPid({ statePid: null, sidecar, expectedJobId: "job-a" })` is called
**THEN** returns `{ pid: 5678, source: "sidecar" }`

---

## TC-015: resolveJobPid pure unit — sidecar rejected on jobId mismatch

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `statePid` is null and sidecar carries `{ pid: 5678, jobId: "job-b" }` and `expectedJobId` is `"job-a"`
**WHEN** `resolveJobPid({ statePid: null, sidecar, expectedJobId: "job-a" })` is called
**THEN** returns `{ pid: null, source: null }`

---

## TC-016: group signal EPERM/ESRCH does not flip `killed`

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D3

**GIVEN** a pid is a group leader and SIGKILL escalation fires, and the group signal `kill(-pid, "SIGKILL")` throws EPERM
**WHEN** `gracefulKill` completes
**THEN** `result.killed` remains true (pid kill result is unchanged) and `result.groupKilled` is false (best-effort, error absorbed)

---

## TC-017: QueryAbortHub drain resolves when registered set empties

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** a `QueryAbortHub` with one registered `AbortController`, and the controller deregisters itself (via the returned deregister fn) after `abortActive()` is called
**WHEN** `drain(timeoutMs, sleep)` is called with an injected `sleep`
**THEN** the promise resolves promptly (well before the timeout bound)

---

## TC-018: QueryAbortHub drain resolves at bound when controller never deregisters

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** a `QueryAbortHub` with one registered `AbortController` that never deregisters within the drain timeout
**WHEN** `drain(timeoutMs, sleep)` is called with an injected `sleep` and a short `timeoutMs`
**THEN** the promise resolves after the bound elapses (does not hang indefinitely)

---

## TC-019: QueryAbortHub abortActive on empty hub is no-op

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** a freshly constructed `QueryAbortHub` with no registered controllers
**WHEN** `abortActive()` is called
**THEN** no exception is thrown

---

## TC-020: agent runner registers and deregisters exactly one controller per run

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** a `ClaudeCodeRunner` with an injected fake hub that records `register`/`deregister` calls
**WHEN** `run()` completes (success, error, or throw)
**THEN** the hub received exactly one `register` call and exactly one corresponding deregister call regardless of the exit path; and existing agent-runner tests (no hub) stay green

---

## TC-021: integration — detached job cancel leaves no process-group survivors

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** a real process spawned with `detached: true` (group leader) that itself spawns a longer-lived child in the same group
**WHEN** the cancel graceful-kill path runs against the leader pid with the production `isGroupLeader` probe and a short escalation timeout (so SIGKILL fires)
**THEN** after the kill, no process in the leader's group survives (`kill(-leaderPid, 0)` yields ESRCH)

破壊確認: `isGroupLeader` を `() => false` に差し替えると子プロセスが残りテストが失敗する。POSIX のみ実行（`process.platform === "win32"` でスキップ）。`afterEach` でサバイバーを best-effort kill してクリーンアップ。

---

## TC-022: typecheck && test green (gate)

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

verification phase: `bun run typecheck` および `bun run test` が全件 green で完了すること。

---

## TC-023: existing cancel test suites pass unchanged (gate)

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

verification phase: 以下 4 スイートが原則無変更で green であること。status gate を pin している `it` のみ期待値変更を許容し、その場合は該当 `it` 名を tasks.md / code-review に明記する。

- `tests/unit/core/cancel/runner.test.ts`
- `tests/unit/cli/cancel.test.ts`
- `tests/unit/core/cancel/sidecar-teardown.test.ts`
- `src/core/cancel/__tests__/runner-branch-delete.test.ts`

---

## TC-024: leader poll-death reaps the group

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Graceful kill reaps the process group only for group leaders, on every observed death path > Scenario: leader that dies from SIGTERM with surviving descendants still gets its group reaped

**GIVEN** a group-leader pid that dies during the SIGTERM poll window (observed via `isAlive` returning false or throwing ESRCH) while `isGroupLeader` reports true
**WHEN** `gracefulKill` observes the death during polling
**THEN** SIGKILL is sent to the group `-pid` and `result.groupKilled === true`

実装: `tests/unit/core/cancel/pid-kill.test.ts` の poll-death + leader 系（isAlive=false / ESRCH の両観測経路）。

---

## TC-025: non-leader poll-death does not touch the group

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Graceful kill reaps the process group only for group leaders, on every observed death path > Scenario: non-leader pid that dies during polling does not touch the group

**GIVEN** a non-leader pid that dies during the SIGTERM poll window
**WHEN** `gracefulKill` observes the death during polling
**THEN** no group-directed (`-pid`) signal is sent

実装: `tests/unit/core/cancel/pid-kill.test.ts` の poll-death + non-leader 系。

---

## Result

```yaml
result: completed
total: 25
automated: 23
manual: 0
must: 19
should: 2
could: 1
blocked_reasons: []
```
