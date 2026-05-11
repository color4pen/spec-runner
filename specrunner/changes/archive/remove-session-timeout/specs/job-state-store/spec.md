## MODIFIED Requirements

### Requirement: Backward Compatibility with Legacy Schemas
`JobStateStore.load()` SHALL accept and normalize legacy `JobState` formats from prior CLI versions:

- **Legacy A** (pre-PR #24): `JobState.steps[name]` is a single `StepResult` object → normalize to `[StepRun]` (attempt = 1)
- **Legacy B** (post-PR #24, pre-this-change): `JobState.steps[name]` is `StepResult[]` → map each element to `StepRun` (attempt = index + 1)
- **Legacy C** (pre-remove-session-timeout): `state.error.code === "SESSION_TIMEOUT"` → normalize to `SESSION_TERMINATED`. The remap SHALL be applied during `validateJobState` (load path); the change is persisted lazily on the next `persist()` call (write-back is not eagerly forced).

The normalized state SHALL be saved in the new format on the next `persist()` call. Backward writes (saving in legacy format) are NOT supported. New jobs SHALL never write `SESSION_TIMEOUT`; the value `SESSION_TIMEOUT` is removed from the set of `state.error.code` values producible by current CLI versions.

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

#### Scenario: Legacy SESSION_TIMEOUT is lazy-migrated to SESSION_TERMINATED on load
- **GIVEN** a state file where `state.error = { code: "SESSION_TIMEOUT", message: "Session timed out after 30m." }`
- **WHEN** `JobStateStore.load()` (delegating to `validateJobState`) is invoked
- **THEN** the in-memory `state.error.code` equals `"SESSION_TERMINATED"`
- **AND** no warning or error is surfaced to the user
- **AND** the on-disk file is unchanged until the next `persist()` call

#### Scenario: Persisted state after lazy migration drops SESSION_TIMEOUT
- **GIVEN** a legacy state with `error.code === "SESSION_TIMEOUT"` was loaded and normalized in memory
- **WHEN** any subsequent `JobStateStore.persist()` is invoked (resume / status touch / cancel)
- **THEN** the on-disk JSON has `error.code === "SESSION_TERMINATED"`
- **AND** the string `SESSION_TIMEOUT` no longer appears in the file

### Requirement: JobStateStore is the Sole Persistence Authority
All reads and writes of `JobState` SHALL go through `JobStateStore` methods (`load` / `persist` / `appendHistory` / `appendStepRun`). Direct file I/O against the state path is prohibited outside `JobStateStore`.

**Canonical `state.error.code` values** — This is the normative definition of `state.error.code`; all other specs (e.g. `propose-pipeline`) reference this list as the single source of truth:

| Code | Meaning |
|------|---------|
| `SESSION_TERMINATED` | Session was forcibly terminated (Anthropic-side or user cancel). Terminal, not resumable. |
| `BRANCH_NOT_REGISTERED` | idle+end_turn detected without `register_branch` tool call. |
| `SPEC_REVIEW_RETRIES_EXHAUSTED` | `maxIterations` reached in spec-review / code-review loop. |
| `CONFIG_INCOMPLETE` | Required config fields missing at startup. |

`SESSION_TIMEOUT` is NOT a valid value for new jobs. Legacy state files containing `SESSION_TIMEOUT` are lazy-migrated to `SESSION_TERMINATED` on load (see Backward Compatibility Requirement above).

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
- **GIVEN** any of the following error conditions: branch not registered, spec-review retries exhausted, config incomplete, session terminated
- **WHEN** the error is surfaced through the CLI
- **THEN** the error code string is one of `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`
- **AND** the error code matches the pre-refactor behavior verbatim
- **AND** `SESSION_TIMEOUT` is NOT a valid value (legacy state files containing it are lazy-migrated to `SESSION_TERMINATED` on load — see the Backward Compatibility Requirement)
