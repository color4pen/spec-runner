



## MODIFIED Requirements

### Requirement: `JobStatus` includes `awaiting-resume` and `canceled`

`JobStatus` SHALL be typed as `"running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled"`.

- `awaiting-resume`: pipeline が escalation / loop exhaustion / SIGINT で halt し、resume 可能な状態
- `canceled`: ユーザーが明示的に cancel した状態（将来の cancel コマンド用。schema 先行追加）
- `failed`: SESSION_CREATE_FAILED / CONFIG_MISSING / CONFIG_INCOMPLETE / CONFIG_INVALID 等、本当に再開不能なケースのみ

This MODIFIED Requirement replaces:
- `Requirement: JobStatus includes archived as a terminal status` — status enum を拡張

#### Scenario: `awaiting-resume` persists across load/save

- **WHEN** `state.status` is set to `"awaiting-resume"` and `JobStateStore.persist()` is called, then `JobStateStore.load()` reads the same file
- **THEN** the loaded state has `state.status === "awaiting-resume"`

#### Scenario: `canceled` persists across load/save

- **WHEN** `state.status` is set to `"canceled"` and `JobStateStore.persist()` is called, then `JobStateStore.load()` reads the same file
- **THEN** the loaded state has `state.status === "canceled"`

#### Scenario: Legacy `success` state still migrates to `awaiting-merge`

- **GIVEN** a state file with `status: "success"` written by a prior CLI version
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `state.status === "awaiting-merge"` (existing on-read remap preserved)

## ADDED Requirements

### Requirement: `JobState.resumePoint` records the halt position

`JobState` SHALL include an optional `resumePoint` field with the shape:

```typescript
interface ResumePoint {
  step: StepName;              // the step where the pipeline halted
  reason: string;              // human-readable reason for halt
  iterationsExhausted: number; // number of iterations completed (0 if not loop exhaustion)
}
```

`resumePoint` SHALL be non-null only when `status === "awaiting-resume"`. For all other statuses, `resumePoint` SHALL be `null` or absent.

Legacy state files lacking the `resumePoint` field SHALL load successfully with `resumePoint === undefined`.

#### Scenario: escalation sets resumePoint

- **GIVEN** a pipeline step returns verdict `"escalation"`
- **WHEN** the pipeline reaches the `escalate` terminal
- **THEN** `state.status === "awaiting-resume"`
- **AND** `state.resumePoint.step` equals the name of the step that escalated
- **AND** `state.resumePoint.reason` describes the escalation
- **AND** `state.resumePoint.iterationsExhausted === 0` (single-step escalation, not loop exhaustion)

#### Scenario: loop exhaustion sets resumePoint with iteration count

- **GIVEN** `spec-review` loop reaches `maxIterations` (e.g. 3)
- **WHEN** `handleExhausted` is called
- **THEN** `state.status === "awaiting-resume"`
- **AND** `state.resumePoint.step === "spec-review"`
- **AND** `state.resumePoint.iterationsExhausted === 3`

#### Scenario: SIGINT sets resumePoint

- **GIVEN** a pipeline is running at step `"implementer"`
- **WHEN** SIGINT is received
- **THEN** `state.status === "awaiting-resume"`
- **AND** `state.resumePoint.step === "implementer"`
- **AND** `state.resumePoint.reason === "Interrupted by signal"`

#### Scenario: Legacy state files without resumePoint load successfully

- **GIVEN** a state file written by a prior CLI version that lacks `resumePoint`
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `resumePoint === undefined`
- **AND** no error is thrown

## ADDED Requirements

### Requirement: `validateJobState` rejects unknown statuses

`validateJobState` SHALL maintain a `VALID_STATUSES` set containing all valid `JobStatus` values. When `obj["status"]` is not in `VALID_STATUSES`, `validateJobState` SHALL throw `Error("Invalid status: <value>")`.

The validation SHALL execute after the existing `status === "success"` on-read remap, so that legacy `"success"` values are remapped to `"awaiting-merge"` before the check.

#### Scenario: Unknown status is rejected

- **GIVEN** a state file with `status: "unknown-value"`
- **WHEN** `validateJobState(raw)` is called
- **THEN** it throws `Error("Invalid status: unknown-value")`

#### Scenario: All valid statuses pass validation

- **GIVEN** a state file with any status in `["running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "archived", "canceled"]`
- **WHEN** `validateJobState(raw)` is called
- **THEN** no error is thrown on the status field

## MODIFIED Requirements

### Requirement: `handleExhausted` writes `awaiting-resume` instead of `failed`

`handleExhausted` SHALL set `status: "awaiting-resume"` (not `"failed"`) and populate `resumePoint` with the exhausted step name and iteration count. The `error` field SHALL still be populated with the loop-specific error shape from `LOOP_ERROR_CODES` (preserving error information for diagnostics).

This MODIFIED Requirement replaces the behavior described in:
- `Requirement: state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED は retry 上限到達を示す` — the Scenario stating `state.status は success（pipeline 自体は完走）` is updated: status SHALL be `"awaiting-resume"` instead

#### Scenario: retries exhausted sets awaiting-resume

- **WHEN** `maxRetries=2` で iter=1 needs-fix -> iter=2 needs-fix が起きる
- **THEN** `state.status === "awaiting-resume"`
- **AND** `state.resumePoint.step === "spec-review"`
- **AND** `state.resumePoint.iterationsExhausted === 2`
- **AND** `state.error.code === "SPEC_REVIEW_RETRIES_EXHAUSTED"` (error info preserved)

## MODIFIED Requirements

### Requirement: stale running job detection in `specrunner ps`

`specrunner ps` SHALL display a `(stale?)` suffix in the STATUS column for jobs where `status === "running"` and `updatedAt` is more than 1 hour before the current time. This is a display-only hint for jobs created before the `awaiting-resume` transition was implemented.

The `ACTIVE_STATUSES` set SHALL include `"awaiting-resume"` in addition to `"running"`, so that `--active` flag shows both running and halted-but-resumable jobs.

#### Scenario: stale running job shows suffix

- **GIVEN** a job with `status: "running"` and `updatedAt` 2 hours ago
- **WHEN** `specrunner ps` is invoked
- **THEN** the STATUS column shows `running (stale?)`

#### Scenario: recent running job shows no suffix

- **GIVEN** a job with `status: "running"` and `updatedAt` 10 minutes ago
- **WHEN** `specrunner ps` is invoked
- **THEN** the STATUS column shows `running`

#### Scenario: awaiting-resume is included in --active filter

- **GIVEN** a job with `status: "awaiting-resume"`
- **WHEN** `specrunner ps --active` is invoked
- **THEN** the job is included in the output
