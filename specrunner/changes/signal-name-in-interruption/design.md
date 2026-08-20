# Design: Signal Name in Interruption Records

## Context

When a running job's process is terminated by an OS signal, the events.jsonl journal appends an `InterruptionRecord` and the job transitions to `awaiting-resume`. Currently the record contains only `{ type: "interruption", reason: "signal", ts: "..." }` — there is no field recording *which* signal was received. The transition history message is the fixed string `"Interrupted by signal"` regardless of the signal. This makes post-mortem investigation of unattended job terminations difficult (SIGINT from Ctrl-C, SIGTERM from a supervisor, and SIGHUP from terminal disconnect are indistinguishable).

Additionally, SIGHUP is not registered in either runtime (`local.ts` or `managed.ts`). A terminal disconnect kills the process without activating the signal cleanup path, meaning no journal record is written and no clean `awaiting-resume` transition occurs.

**Affected files (verified by fact-check attestation):**

| File | Role |
|------|------|
| `src/store/event-journal.ts` | `InterruptionRecord` type definition |
| `src/core/runtime/local.ts:1683-1721` | `signalCleanup` handler + registrations |
| `src/core/runtime/managed.ts:741-776` | `signalCleanup` handler + registrations |
| `src/core/lifecycle/exit-guard.ts:55-171` | `beforeExit` fallback — does NOT know signal name |
| `src/core/resume/canon-provenance.ts:27-32` | `INTERRUPTION_REASONS` — unaffected by field addition |

**Node.js API note:** Signal handler callbacks registered via `process.on("SIGINT", cb)` receive the signal name (`NodeJS.Signals`) as their first argument. This is currently discarded because the handlers are declared `async (): Promise<void>`.

---

## Goals / Non-Goals

**Goals**:
- Add optional `signal` field to `InterruptionRecord` to carry the signal name
- Update `signalCleanup` in local and managed runtimes to capture the signal name from Node's callback argument and write it into the interruption record
- Update the transition history `reason` message (in `transitionJob`) to include the signal name (e.g. `"Interrupted by SIGTERM"`)
- Register SIGHUP in both runtimes alongside SIGINT and SIGTERM; include in cleanup deregistration
- Write pinning tests for all acceptance criteria

**Non-Goals**:
- Changing `resumePoint.reason` values (`"Interrupted by signal"` in local/managed, `"signal"` in exit-guard) — normalization is explicitly out of scope
- Changing `INTERRUPTION_REASONS` in `canon-provenance.ts`
- Changing the exit code from `process.exit(130)`
- Adding signal info to exit-guard interruption records — exit-guard fires only when the signal handler did NOT run, so no signal name is available
- Changing exit-guard's transition history `reason` field
- Detach / job-wait behaviour changes

---

## Decisions

### D1: `signal` field is optional in `InterruptionRecord`

**Decision:** Add `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` as an optional field to `InterruptionRecord` in `src/store/event-journal.ts`.

**Rationale:** exit-guard's `handleNoWorktreeExit` / `handlePerJobExit` call `appendInterruption` from a `beforeExit` callback — there is no in-scope signal name at that point (the handler fires when the signal handler did NOT run). Making the field optional lets existing exit-guard call-sites compile and function unchanged while local/managed signal handlers populate it when they do have the name.

**Alternatives considered:**
- Required field with a sentinel (`signal: "UNKNOWN"`) — adds noise to exit-guard records and pollutes analytics without useful information; rejected.
- Separate record type `SignalInterruptionRecord` — increases type union surface and complicates all consumers; rejected.

### D2: Signal name captured from Node callback argument

**Decision:** Change `signalCleanup` from `async (): Promise<void>` to `async (signal: NodeJS.Signals): Promise<void>` in both runtimes. The signal name flows directly from Node's handler invocation.

**Rationale:** Node.js passes the signal name as the first argument to every signal handler registered with `process.on`. The existing handlers already accept `async (): Promise<void>` (assignment to `NodeJS.SignalsListener` is accepted by TypeScript because the return value is ignored). Adding the parameter is the minimal, zero-allocation way to capture the name; no global state or closure is needed.

**Alternatives considered:**
- Store the active signal in module-level state at handler invocation — adds mutable global state and a race condition window; rejected.
- Separate handler per signal (`onSIGINT`, `onSIGTERM`, `onSIGHUP`) — triples registration boilerplate and complicates teardown; rejected.

### D3: Transition history `reason` updated; `resumePoint.reason` left unchanged

**Decision:** Change the `reason` field passed to `transitionJob` (the history-entry message) from the fixed string `"Interrupted by signal"` to the template `"Interrupted by ${signal}"`. Leave `resumePoint.reason` values unchanged in all files.

**Rationale:** `canon-provenance.ts` checks `INTERRUPTION_REASONS.has(resumePoint.reason)`. The `resumePoint.reason` normalization inconsistency between runtimes (local/managed use `"Interrupted by signal"`, exit-guard uses `"signal"`) is explicitly out of scope. The transition history `reason` field is display-only and has no machine-judgment consumers, so updating it to include the signal name is safe and provides value.

**Alternatives considered:**
- Update both `transitionJob reason` and `resumePoint.reason` — changes `resumePoint.reason`, which is explicitly out of scope; rejected.

### D4: SIGHUP follows the same cleanup path as SIGINT/SIGTERM

**Decision:** Register `process.on("SIGHUP", signalCleanup)` immediately after the SIGTERM registration in both runtimes. Add `process.off("SIGHUP", ...)` to each runtime's teardown path symmetrically.

**Rationale:** SIGHUP (terminal disconnect) is a mechanical interruption with the same desired outcome as SIGTERM: transition the job to `awaiting-resume` with a journal record so the operator can investigate and resume. There is no semantic reason to treat it differently. Using the same handler keeps the cleanup logic as a single code path.

**Alternatives considered:**
- Separate SIGHUP handler with different exit code — mixes the signal-recording feature with exit-code semantics; the latter is explicitly out of scope; rejected.
- Ignore SIGHUP — leaves terminal-disconnect as unrecorded, silent death; the stated problem in the background; rejected.

### D5: exit-guard call-sites unchanged

**Decision:** `handleNoWorktreeExit` and `handlePerJobExit` in `exit-guard.ts` continue to call `appendInterruption({ type: "interruption", reason: "signal", ts })` with no `signal` field.

**Rationale:** The exit-guard fires only when `isSignalHandlerFired()` is false — meaning none of the registered signal handlers ran. In the post-change world this covers only SIGKILL or unexpected crashes. There is no signal name available at `beforeExit` time. The optional `signal` field is simply absent from these records, which is accurate.

**Alternatives considered:**
- Remove `appendInterruption` from exit-guard — changes existing exit-guard behavior outside this request's scope; rejected.

---

## Risks / Trade-offs

**[Risk] Existing test `signal-handler-order.test.ts` calls `signalCleanup()` without arguments**
Mitigation: The test uses `as unknown as { signalCleanup: () => Promise<void> }` to access the function, bypassing TypeScript's type check. At runtime, `signal` will be `undefined`, resulting in `appendInterruption({ signal: undefined, ... })`. JSON serialization omits `undefined` values, so the stored record is unchanged. Both `appendInterruption` and `persist` are mocked in that test, so the call is safe. No modification to the existing test is needed.

**[Risk] SIGHUP registration changes default signal disposition**
Mitigation: Before this change, SIGHUP caused immediate process termination (default OS disposition). After, it triggers the `signalCleanup` path and exits with code 130. This is the intentional goal — terminal disconnect now records cleanly. Operators relying on SIGHUP to kill without recording were previously relying on unguarded behaviour.

**[Risk] Transition history message change breaks existing tests**
Mitigation: `member-resume-routing.test.ts` and `resume-member-context.test.ts` use `reason: "Interrupted by signal"` in fixture `resumePoint` objects — these are `resumePoint.reason`, not the transition history `reason` field. Since `resumePoint.reason` is left unchanged, those tests are unaffected. The existing `signal-handler-order.test.ts` mocks `persist` so does not assert the message value.

---

## Open Questions

None. All design decisions are settled and architect-confirmed per the request's pre-evaluated decisions.
