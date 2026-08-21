# Spec: Signal Name in Interruption Records

## Requirements

### Requirement: Interruption records SHALL carry the signal name

When a job process is terminated by a registered signal (SIGINT, SIGTERM, or SIGHUP), the interruption record appended to events.jsonl MUST include a `signal` field containing the exact signal name received by the handler. The `reason` field MUST remain `"signal"` unchanged.

#### Scenario: SIGTERM received — interruption record includes signal name

**Given** a job is running under the local runtime with an active `signalCleanup` handler
**When** the process receives SIGTERM
**Then** `appendInterruption` is called with `{ type: "interruption", reason: "signal", signal: "SIGTERM", ts: <ISO string> }`

#### Scenario: SIGINT received — interruption record includes signal name

**Given** a job is running under the local runtime
**When** the process receives SIGINT
**Then** `appendInterruption` is called with `{ type: "interruption", reason: "signal", signal: "SIGINT", ts: <ISO string> }`

#### Scenario: SIGHUP received — interruption record includes signal name

**Given** a job is running under the local runtime
**When** the process receives SIGHUP
**Then** `appendInterruption` is called with `{ type: "interruption", reason: "signal", signal: "SIGHUP", ts: <ISO string> }`

#### Scenario: exit-guard fires (no signal handler ran) — signal field absent

**Given** a job is running and the process exits without any registered signal handler firing
**When** the `beforeExit` exit-guard handler calls `appendInterruption`
**Then** the record is `{ type: "interruption", reason: "signal", ts: <ISO string> }` with no `signal` field

---

### Requirement: Transition history message SHALL include the signal name

When `signalCleanup` calls `transitionJob`, the `reason` field of the transition (which becomes the history entry message) MUST include the signal name. The format SHALL be `"Interrupted by <SIGNAME>"` (e.g. `"Interrupted by SIGTERM"`).

#### Scenario: SIGTERM — transition message includes signal name (local runtime)

**Given** a job is running under the local runtime
**When** the process receives SIGTERM and `signalCleanup` runs
**Then** `transitionJob` is called with `reason: "Interrupted by SIGTERM"` in the transition options

#### Scenario: SIGTERM — transition message includes signal name (managed runtime)

**Given** a job is running under the managed runtime
**When** the process receives SIGTERM and `signalCleanup` runs
**Then** `transitionJob` is called with `reason: "Interrupted by SIGTERM"` in the transition options

#### Scenario: SIGHUP — transition message includes signal name (local runtime)

**Given** a job is running under the local runtime
**When** the process receives SIGHUP and `signalCleanup` runs
**Then** `transitionJob` is called with `reason: "Interrupted by SIGHUP"` in the transition options

---

### Requirement: `resumePoint.reason` SHALL remain unchanged

The `resumePoint.reason` value written to job state MUST NOT change. In local and managed runtimes it MUST remain `"Interrupted by signal"`; in exit-guard it MUST remain `"signal"`. This preserves backward compatibility with `canon-provenance` resume judgment and existing resume context logic.

#### Scenario: SIGTERM — resumePoint.reason is unchanged in local runtime

**Given** a job is running under the local runtime
**When** the process receives SIGTERM and `signalCleanup` persists the updated state
**Then** `state.resumePoint.reason` is `"Interrupted by signal"` (not `"Interrupted by SIGTERM"` or `"SIGTERM"`)

#### Scenario: SIGTERM — resumePoint.reason is unchanged in managed runtime

**Given** a job is running under the managed runtime
**When** the process receives SIGTERM and `signalCleanup` persists the updated state
**Then** `state.resumePoint.reason` is `"Interrupted by signal"` (unchanged from current behavior)

#### Scenario: exit-guard — resumePoint.reason is "signal"

**Given** a job is running and exit-guard fires via `beforeExit`
**When** the job is transitioned to `awaiting-resume`
**Then** `state.resumePoint.reason` is `"signal"` (unchanged from current behavior)

---

### Requirement: SIGHUP SHALL be registered and deregistered in both runtimes

Both `LocalRuntime.registerCleanup` and `ManagedRuntime.registerCleanup` MUST register `signalCleanup` as a handler for SIGHUP in addition to SIGINT and SIGTERM. Both runtimes' `teardown` methods MUST deregister SIGHUP via `process.off` to prevent handler leaks.

#### Scenario: SIGHUP registered in local runtime

**Given** `LocalRuntime.registerCleanup` is called for a job
**When** the cleanup handle is created
**Then** `process.on("SIGHUP", signalCleanup)` is called (in addition to SIGINT and SIGTERM)

#### Scenario: SIGHUP deregistered in local runtime teardown

**Given** a `LocalRuntime` cleanup handle exists with SIGHUP registered
**When** `LocalRuntime.teardown` is called
**Then** `process.off("SIGHUP", signalCleanup)` is called (in addition to SIGINT and SIGTERM)

#### Scenario: SIGHUP registered in managed runtime

**Given** `ManagedRuntime.registerCleanup` is called for a job
**When** the cleanup handle is created
**Then** `process.on("SIGHUP", signalCleanup)` is called

#### Scenario: SIGHUP deregistered in managed runtime teardown

**Given** a `ManagedRuntime` cleanup handle exists with SIGHUP registered
**When** `ManagedRuntime.teardown` is called
**Then** `process.off("SIGHUP", signalCleanup)` is called
