# Delta Spec: runtime-selection — Step Artifact Lifecycle via RuntimeStrategy

**Change**: runtime-branch-consolidation  
**Baseline**: specrunner/specs/runtime-selection/spec.md  
**Delta type**: additive (new requirements; baseline scenarios unaffected)

---

## Requirements

### Requirement: RuntimeStrategy MUST provide step artifact lifecycle methods

`RuntimeStrategy` SHALL expose the following three methods as part of its interface
so that `StepExecutor` can delegate all runtime-specific step artifact operations
without branching on `config.runtime`:

1. `captureHeadSha(cwd: string): Promise<string | null>`  
   — Capture the HEAD commit SHA before an agent step runs.  
   — LocalRuntime: executes `git rev-parse HEAD`; returns `null` on failure.  
   — ManagedRuntime: returns `null` (no local worktree).

2. `prepareStepArtifacts(cwd, slug, stepName, state): Promise<void>`  
   — Place output template files in the change folder before the agent runs.  
   — LocalRuntime: calls `writeOutputTemplates()`.  
   — ManagedRuntime: no-op.

3. `finalizeStepArtifacts(step, state, deps, headBeforeStep, commitPushInfra): Promise<void>`  
   — Clean up B-group reference templates and commit+push after a successful agent run.  
   — LocalRuntime: calls `cleanupOutputTemplates()` then `commitAndPush()`.  
   — ManagedRuntime: no-op.

#### Scenario: LocalRuntime captures HEAD SHA before step

**Given** a LocalRuntime with a functional git worktree  
**When** `captureHeadSha(cwd)` is called  
**Then** it MUST return the current HEAD SHA string (non-null, non-empty)

#### Scenario: ManagedRuntime returns null for captureHeadSha

**Given** a ManagedRuntime  
**When** `captureHeadSha(cwd)` is called  
**Then** it MUST return `null`

#### Scenario: LocalRuntime prepares output templates

**Given** a LocalRuntime and a step with output templates defined  
**When** `prepareStepArtifacts(cwd, slug, stepName, state)` is called  
**Then** the template files MUST be written to the change folder under `cwd`

#### Scenario: ManagedRuntime prepareStepArtifacts is a no-op

**Given** a ManagedRuntime  
**When** `prepareStepArtifacts(...)` is called  
**Then** no files SHALL be written and no error SHALL be thrown

#### Scenario: LocalRuntime finalizes step artifacts with commit and push

**Given** a LocalRuntime and a successfully completed agent step  
**When** `finalizeStepArtifacts(step, state, deps, headBeforeStep, infra)` is called  
**Then** B-group template files MUST be deleted and changes MUST be committed and pushed via `infra.spawnFn`

#### Scenario: ManagedRuntime finalizeStepArtifacts is a no-op

**Given** a ManagedRuntime  
**When** `finalizeStepArtifacts(...)` is called  
**Then** no git operations SHALL be performed and no error SHALL be thrown
