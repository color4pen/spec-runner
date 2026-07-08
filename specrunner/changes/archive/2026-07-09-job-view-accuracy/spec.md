# Spec: job-view-accuracy

## Requirements

### Requirement: escalation source step reflects only the current interruption

`deriveEscalationSourceStep` SHALL return the escalation source step only when the
current `awaiting-resume` interruption is escalation-sourced. When the state carries
a `resumePoint`, the function MUST scope its escalation verdict check to
`state.steps[resumePoint.step]` (the current interruption step only) and return null
if that step's most recent run does not have `verdict === "escalation"`.

#### Scenario: escalation-sourced interruption with resumePoint

**Given** a job in `awaiting-resume` with `resumePoint.step = "spec-review"` and
`state.steps["spec-review"]` containing one run with `verdict === "escalation"`
**When** `deriveEscalationSourceStep` is called
**Then** the function returns `"spec-review"`

#### Scenario: timeout-sourced interruption with prior escalation in history

**Given** a job in `awaiting-resume` with `resumePoint.step = "implementer"` (from a
timeout), and `state.steps["spec-review"]` still contains a historical escalation
run from a previous cycle
**When** `deriveEscalationSourceStep` is called
**Then** the function returns `null` (the timeout interruption is not escalation-sourced)

#### Scenario: iteration-exhaustion interruption with prior escalation in history

**Given** a job in `awaiting-resume` with `resumePoint.step = "code-review"` (from
iteration exhaustion), and `state.steps` contains historical escalation runs at other
steps
**When** `deriveEscalationSourceStep` is called
**Then** the function returns `null`

### Requirement: legacy state falls back to history scan

When `state.resumePoint` is absent, `deriveEscalationSourceStep` MUST use the
existing full-history scan (scan all steps for the run with greatest timestamp
and `verdict === "escalation"`), preserving existing behaviour.

#### Scenario: legacy state without resumePoint shows escalation step

**Given** a job in `awaiting-resume` with no `resumePoint` field, and
`state.steps["spec-review"]` containing a run with `verdict === "escalation"`
**When** `deriveEscalationSourceStep` is called
**Then** the function returns `"spec-review"` (legacy fallback path)

### Requirement: job stats cost is scoped to the current job's invocations

`deriveRunStat` SHALL compute `costUsd` by summing only those `commandInvocations`
in the usage file whose `jobId` matches `state.jobId`. Invocations that carry a
different `jobId` MUST be excluded.

#### Scenario: two jobs share a usage file, each sees only its own cost

**Given** a usage file containing two invocations — one with `jobId = "job-A"` and
one with `jobId = "job-B"`, each with distinct modelUsage costs — and the current
job state has `jobId = "job-A"`
**When** `deriveRunStat` is called
**Then** `costUsd` equals the cost of the `"job-A"` invocation only, not the sum of both

### Requirement: legacy invocations without jobId are always included

Invocations in usage.json that have no `jobId` field (legacy data) MUST be counted
toward cost regardless of which job's state is being computed.

#### Scenario: usage file contains only jobId-absent invocations

**Given** a usage file where all `commandInvocations` lack a `jobId` field
**When** `deriveRunStat` is called
**Then** `costUsd` equals the sum of all invocation costs (same behaviour as before this change)

#### Scenario: usage file mixes legacy and new invocations

**Given** a usage file with one legacy invocation (no `jobId`) and one new
invocation with `jobId = "job-A"`, and the current job has `jobId = "job-A"`
**When** `deriveRunStat` is called
**Then** `costUsd` includes cost from both invocations (legacy passthrough + own-job match)
