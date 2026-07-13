# Test Cases: job-power-assertion

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 15
- **Manual**: 1
- **Priority**: must: 13, should: 3, could: 0

---

### TC-001: assertion is acquired at job start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A running local job MUST hold an idle-sleep power assertion > Scenario: assertion is acquired at job start

---

### TC-002: assertion is released on success teardown

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A running local job MUST hold an idle-sleep power assertion > Scenario: assertion is released on success teardown

---

### TC-003: assertion is released on error teardown

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A running local job MUST hold an idle-sleep power assertion > Scenario: assertion is released on error teardown

---

### TC-004: assertion is released on signal interruption

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A running local job MUST hold an idle-sleep power assertion > Scenario: assertion is released on signal interruption

---

### TC-005: unsupported platform is a no-op

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Power-assertion acquisition MUST fail open > Scenario: unsupported platform is a no-op

---

### TC-006: missing caffeinate does not stop the job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Power-assertion acquisition MUST fail open > Scenario: missing caffeinate does not stop the job

---

### TC-007: no new direct child_process importer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The resident process MUST be spawned through the util/spawn.ts seam > Scenario: no new direct child_process importer

---

### TC-008: resident child env is stripped of secrets

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The resident process MUST be spawned through the util/spawn.ts seam > Scenario: resident child env is stripped of secrets

---

### TC-009: process is wired to follow parent exit

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The resident process MUST NOT be orphaned > Scenario: process is wired to follow parent exit

---

### TC-010: managed runtime acquires no assertion

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The managed runtime MUST remain unchanged > Scenario: managed runtime acquires no assertion

---

### TC-011: spawnBackground kill() is idempotent and never throws

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add a resident-process seam function `spawnBackground` to `util/spawn.ts`

**GIVEN** a fake `ChildProcess` with a `kill` spy injected via the mocked `node:child_process`  
**WHEN** `handle.kill()` is called twice in succession  
**THEN** the underlying `proc.kill("SIGTERM")` is called at most once (guarded by the `killed` flag)  
**AND** no exception is thrown even if the underlying `kill` call throws internally

---

### TC-012: spawnBackground attaches an error listener synchronously before returning

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add a resident-process seam function `spawnBackground` to `util/spawn.ts`

**GIVEN** a fake `ChildProcess` whose `on("error", ...)` listener is captured at call time  
**WHEN** the captured listener is invoked with `new Error("spawn caffeinate ENOENT")`  
**THEN** the `opts.onError` callback receives that error  
**AND** the `error` event is never unhandled (no `uncaughtException` risk)

---

### TC-013: spawnBackground spawns with stdio "ignore" and shell false

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / T-04: Add a resident-process seam function `spawnBackground` to `util/spawn.ts`

**GIVEN** `node:child_process` is mocked and `spawn` is a spy  
**WHEN** `spawnBackground("caffeinate", ["-i"], { cwd: "/w" })` is called  
**THEN** `spawn` is called with `{ stdio: "ignore", shell: false }` in its options

---

### TC-014: spawnBackground unref-es the child so it does not keep the event loop alive

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / T-04: Add a resident-process seam function `spawnBackground` to `util/spawn.ts`

**GIVEN** a fake `ChildProcess` with an `unref` spy  
**WHEN** `spawnBackground(cmd, args, opts)` is called  
**THEN** `proc.unref()` is called exactly once before the handle is returned

---

### TC-015: existing local.ts and signal-handler-order tests pass unchanged

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Bind acquire/release to the local job lifecycle in `local.ts`

**GIVEN** the power-assertion lifecycle binding is added to `registerCleanup` / `teardown` / `signalCleanup`  
**WHEN** the existing `local.test.ts` (TC-LR-005/006) and `signal-handler-order.test.ts` are executed  
**THEN** all existing assertions pass without modification  
**AND** signal-handler registration count and teardown cleanup branch behaviour are unchanged (release is layered around existing logic, not in place of it)

---

### TC-016: `bun run typecheck && bun run test` exits 0

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07: Guard managed-runtime invariance and B-12/B-6 continuity; full verification

**GIVEN** all tasks T-01 through T-06 are implemented  
**WHEN** `bun run typecheck` and then `bun run test` are executed in the project root  
**THEN** both commands exit with code 0  
**AND** the output includes green results for `spawn-background.test.ts`, `power-assertion.test.ts`, `local-power-assertion.test.ts`, `managed.test.ts`, `local.test.ts`, `signal-handler-order.test.ts`, and `core-invariants.test.ts`

---

## Result

```yaml
result: completed
total: 16
automated: 15
manual: 1
must: 13
should: 3
could: 0
blocked_reasons: []
```
