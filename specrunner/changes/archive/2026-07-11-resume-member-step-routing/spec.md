# Spec: resume-member-step-routing

## Requirements

### Requirement: member step resumePoint is routed to coordinator on resume

When a job's `resumePoint.step` points to a custom reviewer member name, `resolveResumeStep` SHALL return the coordinator step name (`custom-reviewers`) instead, so the pipeline re-enters via `runCoordinatorFanOut`.

#### Scenario: approved member — pipeline reaches terminal state

**Given** a job state with `resumePoint.step = "cross-boundary-invariants"` and `state.reviewers = [{ name: "cross-boundary-invariants" }]`
**When** `resolveResumeStep` is called without `--from`
**Then** it returns `"custom-reviewers"`

#### Scenario: coordinator fan-out recalculates pending from reviewerStatuses

**Given** a job whose coordinator fan-out starts from a member-name resumePoint
**When** `runCoordinatorFanOut` executes
**Then** the reviewerStatuses ledger determines which members are pending; already-approved members are not re-executed

#### Scenario: static step resumePoint is unaffected

**Given** a job state with `resumePoint.step = "code-review"` and reviewers present
**When** `resolveResumeStep` is called without `--from`
**Then** it returns `"code-review"` (no mapping applied)

---

### Requirement: `--from <member-name>` is mapped to coordinator

When `--from` is explicitly set to a custom reviewer member name, `resolveResumeStep` SHALL map it to the coordinator step name and proceed as if `--from custom-reviewers` was given.

#### Scenario: --from member maps to coordinator

**Given** reviewers contain `{ name: "security-review" }` and `--from security-review` is provided
**When** `resolveResumeStep` is called
**Then** it returns `"custom-reviewers"` (not an error, not `"security-review"`)

#### Scenario: --from custom-reviewers is explicitly valid

**Given** reviewers are present and `--from custom-reviewers` is provided
**When** `resolveResumeStep` is called
**Then** it returns `"custom-reviewers"` (coordinator is in the allowed set)

---

### Requirement: coordinator is in the allowed step set when reviewers are present

When `buildAllowedStepSet` is called with a non-empty `reviewers` array, the returned set SHALL include `"custom-reviewers"`.

#### Scenario: coordinator added to allowed set

**Given** `reviewers = [{ name: "lint-review" }]`
**When** `buildAllowedStepSet(reviewers)` is called
**Then** the returned set contains `"custom-reviewers"`

#### Scenario: no reviewers — coordinator not in set

**Given** `reviewers` is empty or undefined
**When** `buildAllowedStepSet(reviewers)` is called
**Then** the returned set does NOT contain `"custom-reviewers"`

---

### Requirement: signal stop produces exactly one interruption record

When a job is stopped by a signal (SIGINT / SIGTERM), the journal SHALL contain exactly one `{ type: "interruption", reason: "signal" }` record per signal event, even if both the signal handler and the exit-guard run concurrently.

#### Scenario: signal handler marks flag; exit-guard skips append

**Given** the signal handler has called `markSignalHandlerFired()` (synchronously, before any `await`)
**When** `createExitGuardHandler` fires (e.g., due to `beforeExit`)
**Then** the exit-guard does not call `appendInterruption` and does not call `store.persist`

#### Scenario: no signal — exit-guard acts as normal backstop

**Given** the signal handler has NOT fired (`isSignalHandlerFired()` returns false)
**When** a running job's process exits (e.g., unhandled exception)
**Then** the exit-guard appends an interruption record and transitions state to `awaiting-resume`

---

### Requirement: existing resume behaviors are unaffected

Static step resume, regression-gate resume, and the hard-crash fallback (`state.step`) SHALL continue to work as before. The `--from` validation error path for truly unknown step names SHALL also be unchanged.

#### Scenario: static step resume unchanged

**Given** a job with `resumePoint.step = "implementer"` and no custom reviewers
**When** `resolveResumeStep` is called without `--from`
**Then** it returns `"implementer"`

#### Scenario: unknown --from still throws

**Given** reviewers are present and `--from totally-unknown-step` is provided
**When** `resolveResumeStep` is called
**Then** it throws with "Invalid --from value" (not silently mapped)
