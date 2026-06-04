# Spec: resume-record-interrupted-step

## Requirements

### Requirement: Signal interruption records the in-progress step as the resume point

When a `local` runtime job is interrupted by a signal (SIGINT/SIGTERM), the
cleanup handler SHALL record the step that was executing at interruption time
(`state.step` of the loaded job state) as `resumePoint.step`, so that a later
resume continues from the interrupted step rather than the step the pipeline was
launched from. The handler SHALL fall back to the launch step (`startStep`) only
when the loaded `state.step` is null or undefined.

#### Scenario: interruption during a later step records that step

**Given** a `local` runtime job launched from step `design` (so `startStep` is `design`)
**And** the pipeline has advanced so the persisted `state.step` is `code-review`
**When** the registered signal-cleanup handler runs (SIGINT/SIGTERM)
**Then** the persisted job status becomes `awaiting-resume`
**And** `resumePoint.step` is `code-review` (the in-progress step), not `design`

#### Scenario: resume continues from the interrupted step, not the launch step

**Given** a job whose `resumePoint.step` was recorded as `code-review` after a signal interruption
**When** resume resolves the start step via `resolveResumeStep`
**Then** the resolved start step is `code-review` (or its correct downstream resume target per the existing resolution rules), not the launch step `design`

#### Scenario: missing in-progress step falls back to the launch step

**Given** a signal interruption where the loaded `state.step` is null or undefined
**When** the signal-cleanup handler records the resume point
**Then** `resumePoint.step` falls back to `startStep`
