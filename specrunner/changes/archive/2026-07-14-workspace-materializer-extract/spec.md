# Spec: WorkspaceMaterializer Extraction

## Requirements

### Requirement: MaterializerHost interface is the sole seam between WorkspaceMaterializer and LocalRuntime

WorkspaceMaterializer SHALL accept a `MaterializerHost` interface (not a `LocalRuntime` reference) at construction. The interface MUST declare exactly: `cwd: string`, `manager: WorktreeManager`, `spawnFn: SpawnFn`, `resolveSetupPlan(): WorkspaceSetupPlan`, `registerWorkspace(workspace: WorkspaceContext): void`, `updateJobState(jobId, mutator, slugOpts): Promise<void>`, and `writeLivenessSidecar(slug, jobId, worktreePath): Promise<void>`.

#### Scenario: WorkspaceMaterializer constructed with a stub host

**Given** a test creates a minimal object satisfying `MaterializerHost`
**When** `new WorkspaceMaterializer(stubHost)` is called
**Then** construction succeeds without importing LocalRuntime

---

### Requirement: manager.create calls reside exclusively in workspace-materializer.ts

After this change, `src/core/runtime/local.ts` SHALL contain zero occurrences of the string `manager.create(`. `src/core/runtime/workspace-materializer.ts` SHALL contain at least two occurrences of `manager.create(` (one for the resume-recreated/resume-without-recorded-worktree arm, one for the new-run arm).

#### Scenario: Structure gate test passes

**Given** the structure gate test reads both source files at their known repo-relative paths
**When** the test counts occurrences of `manager.create(`
**Then** count in local.ts is 0, count in workspace-materializer.ts is ≥2

---

### Requirement: Ordering invariants are preserved in WorkspaceMaterializer

For all arms that call `updateJobState`, WorkspaceMaterializer MUST call `host.registerWorkspace(workspace)` before any `host.updateJobState(...)` call in that arm. For all arms that use `opts.bootstrapState`, WorkspaceMaterializer MUST persist the bootstrap state before calling `host.updateJobState(...)`. For the new-run arm, on any failure during request.md staging or committing, WorkspaceMaterializer MUST call `host.manager.remove(worktreePath, host.cwd)` and `host.manager.prune(host.cwd)` before propagating the error.

#### Scenario: workspace registered before updateJobState (resume-recreated arm)

**Given** a resume-recreated plan
**When** `materializer.materialize(slug, jobId, plan, opts)` is called
**Then** `host.registerWorkspace` is called before `host.updateJobState`

#### Scenario: seed before updateJobState (new-run arm with bootstrapState)

**Given** a new-run plan and `opts.bootstrapState` is set
**When** `materializer.materialize(slug, jobId, plan, opts)` is called
**Then** `JobStateStore.persist(bootstrapState)` is called before `host.updateJobState`

#### Scenario: cleanup on commit failure (new-run arm)

**Given** a new-run plan with `opts.requestFilePath` set
**When** the `git commit` spawn returns a non-zero exit code
**Then** `host.manager.remove(worktreePath, host.cwd)` and `host.manager.prune(host.cwd)` are called before the error is thrown

---

### Requirement: no-worktree arm is not handled by WorkspaceMaterializer

WorkspaceMaterializer.materialize SHALL NOT accept or handle a plan of kind `"no-worktree"`. The `no-worktree` arm SHALL remain delegated by `LocalRuntime.materializeWorktree` to `LocalRuntime.setupWorkspaceNoWorktree` before any call to WorkspaceMaterializer.

#### Scenario: LocalRuntime.materializeWorktree delegates no-worktree without calling materializer

**Given** `setupWorkspace` resolves plan kind `"no-worktree"`
**When** `LocalRuntime.materializeWorktree` is called
**Then** `WorkspaceMaterializer.materialize` is not called; `setupWorkspaceNoWorktree` is called instead

---

### Requirement: Existing behavioral tests pass without modification to expected outcomes

All existing tests in `src/core/runtime/__tests__/` SHALL remain green. Import paths or mock targets MAY require mechanical updates if test files imported `manager.create` indirectly through local.ts mocking, but expected behaviors SHALL NOT change.

#### Scenario: Existing test suite green after extraction

**Given** the extraction is complete
**When** `bun test` runs all tests in `src/core/runtime/__tests__/`
**Then** all tests that were green before the change remain green
