# Delta Spec: step-execution-architecture — Executor Delegates Artifact Lifecycle to RuntimeStrategy

**Change**: runtime-branch-consolidation  
**Baseline**: specrunner/specs/step-execution-architecture/spec.md  
**Delta type**: modification (updates existing "StepExecutor Manages Lifecycle" requirement)

---

## Requirements

### Requirement: StepExecutor Delegates Artifact Lifecycle via RuntimeStrategy

`StepExecutor` SHALL remain runtime-agnostic with respect to step artifact operations.
The executor MUST NOT branch on `deps.config.runtime` directly.
Instead, it SHALL delegate artifact lifecycle operations to `deps.runtimeStrategy` seam:

- Before agent run: `deps.runtimeStrategy?.captureHeadSha(cwd)` to obtain the HEAD SHA
- Before agent run: `deps.runtimeStrategy?.prepareStepArtifacts(cwd, slug, stepName, state)` to write output templates
- After successful agent run: `deps.runtimeStrategy?.finalizeStepArtifacts(step, state, deps, headBeforeStep, commitPushInfra)` to clean up templates and commit+push

When `runtimeStrategy` is absent (e.g. in tests without injection), all artifact lifecycle operations
MUST be no-ops (executor SHALL NOT throw).

Error handling for `finalizeStepArtifacts` MUST remain in the executor:
commit-and-push errors SHALL be recorded in job state and rethrown with the state attached.

#### Scenario: Executor delegates HEAD capture to RuntimeStrategy

**Given** a `StepExecutor` with `deps.runtimeStrategy` injected  
**When** `runAgentStep` executes  
**Then** the executor MUST call `deps.runtimeStrategy.captureHeadSha(cwd)` to get the pre-step HEAD SHA  
**And** the executor MUST NOT call `gitExec` directly

#### Scenario: Executor delegates artifact finalization to RuntimeStrategy

**Given** a `StepExecutor` with `deps.runtimeStrategy` injected  
**And** the agent step completes successfully  
**When** `runAgentStep` finalizes the step  
**Then** the executor MUST call `deps.runtimeStrategy.finalizeStepArtifacts(...)` with the executor's `commitPushInfra`  
**And** the executor MUST NOT check `deps.config.runtime` before or after this call

#### Scenario: Executor handles finalizeStepArtifacts errors in state

**Given** `deps.runtimeStrategy.finalizeStepArtifacts(...)` throws an error  
**When** the executor's `.catch()` handler runs  
**Then** the error MUST be recorded in job state via `recordFailedStepResult` and `store.fail`  
**And** the error MUST be rethrown with state attached via `attachStateAndRethrow`

#### Scenario: Executor no-ops when runtimeStrategy is absent

**Given** a `StepExecutor` where `deps.runtimeStrategy` is `undefined`  
**When** `runAgentStep` executes  
**Then** no artifact lifecycle operations SHALL occur (no git calls, no template writes)  
**And** the step MUST complete without error
