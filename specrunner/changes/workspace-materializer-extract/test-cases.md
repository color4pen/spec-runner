# Test Cases: WorkspaceMaterializer Extraction

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 11, should: 4, could: 0

---

### TC-001: WorkspaceMaterializer constructed with a stub host

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: MaterializerHost interface is the sole seam between WorkspaceMaterializer and LocalRuntime > Scenario: WorkspaceMaterializer constructed with a stub host

---

### TC-002: Structure gate test passes

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: manager.create calls reside exclusively in workspace-materializer.ts > Scenario: Structure gate test passes

---

### TC-003: workspace registered before updateJobState (resume-recreated arm)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Ordering invariants are preserved in WorkspaceMaterializer > Scenario: workspace registered before updateJobState (resume-recreated arm)

---

### TC-004: seed before updateJobState (new-run arm with bootstrapState)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Ordering invariants are preserved in WorkspaceMaterializer > Scenario: seed before updateJobState (new-run arm with bootstrapState)

---

### TC-005: cleanup on commit failure (new-run arm)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Ordering invariants are preserved in WorkspaceMaterializer > Scenario: cleanup on commit failure (new-run arm)

---

### TC-006: LocalRuntime.materializeWorktree delegates no-worktree without calling materializer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: no-worktree arm is not handled by WorkspaceMaterializer > Scenario: LocalRuntime.materializeWorktree delegates no-worktree without calling materializer

---

### TC-007: Existing test suite green after extraction

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Existing behavioral tests pass without modification to expected outcomes > Scenario: Existing test suite green after extraction

---

### TC-008: MaterializerHost interface exports all 7 required members

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Define MaterializerHost interface and WorkspaceMaterializer skeleton in workspace-materializer.ts

**GIVEN** `workspace-materializer.ts` is compiled
**WHEN** the TypeScript type of `MaterializerHost` is inspected
**THEN** it declares exactly: `cwd: string`, `manager: WorktreeManager`, `spawnFn: SpawnFn`, `resolveSetupPlan(): WorkspaceSetupPlan`, `registerWorkspace(workspace: WorkspaceContext): void`, `updateJobState(jobId, mutator, slugOpts): Promise<void>`, and `writeLivenessSidecar(slug, jobId, worktreePath): Promise<void>`

---

### TC-009: WorkspaceMaterializer.materialize() handles resume-existing arm with host seam

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: Implement WorkspaceMaterializer.materialize() with all four active arms

**GIVEN** a resume-existing plan with a valid worktreePath
**WHEN** `materializer.materialize(slug, jobId, plan, opts)` is called with a stub host
**THEN** `host.registerWorkspace` is called with the existing workspace context, `host.writeLivenessSidecar` is called with the correct slug/jobId/worktreePath, and `recopyDraftToChangeFolder` is invoked using `host.cwd` and `host.spawnFn`

---

### TC-010: workspace-materializer.ts contains ≥1 occurrence of writeLivenessSidecar(

**Category**: unit
**Priority**: should
**Source**: design.md > D4: Structure gate as grep-in-test

**GIVEN** the extraction is complete
**WHEN** the source text of `src/core/runtime/workspace-materializer.ts` is read
**THEN** the count of occurrences of the string `writeLivenessSidecar(` is ≥1

---

### TC-011: workspace-materializer.ts contains ≥1 occurrence of registerWorkspace(

**Category**: unit
**Priority**: should
**Source**: design.md > D4: Structure gate as grep-in-test

**GIVEN** the extraction is complete
**WHEN** the source text of `src/core/runtime/workspace-materializer.ts` is read
**THEN** the count of occurrences of the string `registerWorkspace(` is ≥1

---

### TC-012: LocalRuntime.registerWorkspace sets this.workspace

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: Adapt LocalRuntime to implement MaterializerHost and delegate materializeWorktree

**GIVEN** `LocalRuntime` has been updated to implement `MaterializerHost`
**WHEN** `localRuntime.registerWorkspace(workspaceContext)` is called
**THEN** the internal `this.workspace` field is set to the provided `workspaceContext`

---

### TC-013: typecheck passes after full extraction

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03: Adapt LocalRuntime to implement MaterializerHost and delegate materializeWorktree

**GIVEN** T-01, T-02, and T-03 are all complete
**WHEN** `bun run typecheck` is executed
**THEN** the process exits with code 0 and reports zero type errors

---

### TC-014: workspace registered before updateJobState in resume-without-recorded-worktree arm

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: Implement WorkspaceMaterializer.materialize() with all four active arms

**GIVEN** a resume-without-recorded-worktree plan and a stub host that tracks call order
**WHEN** `materializer.materialize(slug, jobId, plan, opts)` is called
**THEN** `host.registerWorkspace` is invoked before `host.updateJobState` in the call sequence

---

### TC-015: materialize() type excludes the no-worktree plan variant

**Category**: unit
**Priority**: should
**Source**: design.md > D3: no-worktree arm stays in LocalRuntime

**GIVEN** a value of type `WorktreeMaterializationPlan` with kind `"no-worktree"`
**WHEN** the TypeScript compiler checks a call `materializer.materialize(slug, jobId, noWorktreePlan, opts)`
**THEN** a compile-time type error is reported because the `plan` parameter type is `Exclude<WorktreeMaterializationPlan, { kind: "no-worktree" }>`

---

## Result

```yaml
result: completed
total: 15
automated: 15
manual: 0
must: 11
should: 4
could: 0
blocked_reasons: []
```
