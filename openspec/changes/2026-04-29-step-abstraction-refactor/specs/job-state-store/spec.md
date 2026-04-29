## MODIFIED Requirements

### Requirement: JobState.steps Schema is StepRun Array Per Step
`JobState.steps` SHALL be typed as `Record<StepName, StepRun[]>` where `StepRun` records a single execution attempt of a step.

`StepRun` SHALL have the following fields:

- `attempt: number` — 1-based attempt index for this step within the job
- `sessionId: string` — Managed Agents session id used for this attempt
- `outcome: StepOutcome` — parsed verdict / artifact references (existing structure)
- `startedAt: string` — ISO 8601 timestamp at session creation
- `endedAt: string` — ISO 8601 timestamp at session completion or error

#### Field Mapping: Legacy StepResult → StepRun

The following table shows how each field in the existing `job-state-store` spec (StepResult schema) maps to the new `StepRun` fields:

| Legacy field (StepResult) | New field (StepRun) | Notes |
|---------------------------|---------------------|-------|
| `iteration: number` | `attempt: number` | renamed; same 1-based semantics |
| `session: SessionInfo` | `sessionId: string` | flattened; `session.id` becomes `sessionId` |
| `verdict` | `outcome.verdict` | moved into `StepOutcome` |
| `findingsPath: string \| null` | `outcome.findingsPath?: string` | moved into `StepOutcome` |
| `error: ErrorInfo \| null` | `outcome.error?: ErrorInfo` | moved into `StepOutcome` |
| `completedAt: ISO8601 \| null` | `endedAt: string` | renamed |
| _(absent)_ | `startedAt: string` | new field; see derivation rule in Legacy B scenario |

#### Scenario: Multiple attempts append rather than overwrite
- **GIVEN** a job in which `spec-review` was executed twice with verdicts `needs-fix` then `approved`
- **WHEN** the state is persisted
- **THEN** `state.steps["spec-review"]` is an array of length 2 in chronological order
- **AND** the latest attempt is the last element

#### Scenario: StepRun captures lifecycle timestamps
- **WHEN** a step completes successfully
- **THEN** the corresponding `StepRun` has both `startedAt` and `endedAt` set as ISO 8601 strings
- **AND** `endedAt >= startedAt`

### Requirement: Backward Compatibility with Legacy Schemas
`JobStateStore.load()` SHALL accept and normalize legacy `JobState` formats from prior CLI versions:

- **Legacy A** (pre-PR #24): `JobState.steps[name]` is a single `StepResult` object → normalize to `[StepRun]` (attempt = 1)
- **Legacy B** (post-PR #24, pre-this-change): `JobState.steps[name]` is `StepResult[]` → map each element to `StepRun` (attempt = index + 1)

The normalized state SHALL be saved in the new format on the next `persist()` call. Backward writes (saving in legacy format) are NOT supported.

#### Scenario: Pre-PR #24 single-result format is normalized on load
- **GIVEN** a state file where `state.steps["propose"] = { sessionId: "s1", verdict: "approved", ... }`
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the in-memory state has `state.steps["propose"] = [{ attempt: 1, sessionId: "s1", outcome: { verdict: "approved", ... }, startedAt, endedAt }]`

#### Scenario: Post-PR #24 array format is normalized on load
- **GIVEN** a state file where `state.steps["spec-review"] = [{ session: { id: "s1" }, verdict: "needs-fix", completedAt: "2026-01-01T00:00:00Z", ... }, { session: { id: "s2" }, verdict: "approved", completedAt: "2026-01-02T00:00:00Z", ... }]`
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** each element gains `attempt: 1` and `attempt: 2` respectively
- **AND** `sessionId` is derived from `session.id` of each element
- **AND** `outcome.verdict`, `outcome.findingsPath`, `outcome.error` are derived from the top-level fields of each element
- **AND** `endedAt` is set to `StepResult.completedAt` when present
- **AND** `startedAt` is set to `state.updatedAt` (the job-level timestamp at load time) as a best-effort fallback when no per-entry start time is available

#### Scenario: Subsequent persist writes new format only
- **GIVEN** a legacy state was loaded and normalized
- **WHEN** `JobStateStore.persist()` is called
- **THEN** the on-disk JSON uses `StepRun[]` shape with all required fields
- **AND** the legacy fields (`iteration`, `session`, `completedAt` at top level) are NOT written back

### Requirement: JobStateStore is the Sole Persistence Authority
All reads and writes of `JobState` SHALL go through `JobStateStore` methods (`load` / `persist` / `appendHistory` / `appendStepRun`). Direct file I/O against the state path is prohibited outside `JobStateStore`.

This MODIFIED Requirement replaces the following Requirements from the existing `job-state-store` spec:
- `Requirement: 状態ファイルは固定スキーマに従う` — schema shape is superseded by StepRun[] above
- `Requirement: getLatestStepResult は最新 iteration の StepResult を返す` — replaced by `JobStateStore.appendStepRun` / `getLatestStepRun` returning `StepRun`
- `Requirement: StepResult への push は iteration 番号を自動採番する` — replaced by `appendStepRun` which auto-increments `attempt`

All other Requirements in `job-state-store` spec (file path, atomic writes, history append-only, enumeration resilience, `state.step` current-step field, `state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` format) remain unchanged.

#### Scenario: appendStepRun is atomic with respect to readers
- **WHEN** `JobStateStore.appendStepRun(state, stepName, stepRun)` is called
- **THEN** the on-disk file is updated atomically (write-and-rename)
- **AND** a concurrent reader observes either the pre-call state or the post-call state, never a partial write

#### Scenario: Error codes preserved across schema migration
- **GIVEN** any of the following error conditions: session timeout, branch not registered, spec-review retries exhausted, config incomplete, session terminated
- **WHEN** the error is surfaced through the CLI
- **THEN** the error code string is one of `SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`
- **AND** the error code matches the pre-refactor behavior verbatim
