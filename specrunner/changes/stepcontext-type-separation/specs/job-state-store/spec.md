## MODIFIED Requirements

### Requirement: JobStateStore is the Sole Persistence Authority

All reads and writes of `JobState` SHALL go through `JobStateStore` methods (`load` / `persist` / `appendHistory` / `appendStepRun`). Direct file I/O against the state path is prohibited outside `JobStateStore`.

`JobStateStore` SHALL be invoked exclusively by `StepExecutor` for step-level state persistence. `AgentRunner` adapters (including `ManagedAgentRunner` and `ClaudeCodeRunner`) SHALL NOT import, instantiate, or call any method of `JobStateStore`. This eliminates the dual state-management paths where both the adapter and the executor independently persisted state.

The `_updatedState` internal extension (previously used by `ManagedAgentRunner` to return full `JobState` piggy-backed on `AgentRunResult`) SHALL NOT exist. `AgentRunResult` SHALL contain only the fields defined in its interface (`completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`).

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

#### Scenario: ManagedAgentRunner does not use JobStateStore
- **WHEN** `src/adapter/managed-agent/agent-runner.ts` is inspected
- **THEN** it does NOT import `JobStateStore`
- **AND** it does NOT import `pushStepResult`
- **AND** it does NOT call `store.update`, `store.appendHistory`, `store.fail`, or `store.persist`

#### Scenario: _updatedState does not exist in codebase
- **WHEN** `grep -r "_updatedState" src/` is executed
- **THEN** zero matches are returned
