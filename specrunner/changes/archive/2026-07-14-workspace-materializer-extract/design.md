# Design: WorkspaceMaterializer Extraction

## Context

`src/core/runtime/local.ts` contains `LocalRuntime.materializeWorktree()` (~135 lines), which is the sole owner of worktree creation (`manager.create`), workspace registration (`this.workspace =`), bootstrap seed, `updateJobState`, liveness sidecar writing, `recopyDraftToChangeFolder`, and request.md stage/commit with failure-path cleanup.

`src/core/runtime/workspace-materializer.ts` currently only exports `WorktreeMaterializationPlan` (a discriminated union type). It is a stub — the module name implies ownership of materialization, but the logic lives elsewhere.

This change moves the materialization logic to the module where it belongs. `LocalRuntime` keeps plan resolution (`setupWorkspace`) and the `no-worktree` arm (`setupWorkspaceNoWorktree`). Behavior does not change; only ownership moves.

Current call chain:
```
setupWorkspace() → resolves plan → materializeWorktree() [local.ts, ~135 lines]
```

Target call chain:
```
setupWorkspace() → resolves plan → materializeWorktree() [delegates] → WorkspaceMaterializer.materialize() [workspace-materializer.ts]
```

Key invariants that must be preserved across the move:
- **workspace-before-updateJobState**: `this.workspace` must be set before the first `updateJobState` call (because `updateJobState` derives slugStoreOpts from workspace in `slugStoreOpts()`)
- **seed-before-updateJobState**: `bootstrapState` persist runs before `updateJobState` (T-02 in request)
- **failure cleanup**: on request.md stage/commit failure (new-run arm), `manager.remove` + `manager.prune` run before throwing

## Goals / Non-Goals

**Goals**:
- `WorkspaceMaterializer` class owns `manager.create`, workspace registration, seed, `updateJobState`, liveness sidecar, recopy, request.md stage+commit, and failure-path cleanup for the four active materialization arms
- `local.ts` contains zero occurrences of `manager.create(`
- `workspace-materializer.ts` contains the `manager.create` call sites and liveness logic
- All ordering invariants (workspace-before-updateJobState, seed-before-updateJobState, failure remove+prune) preserved in WorkspaceMaterializer
- Structure gate test enforces the ownership contract as a machine-verifiable assertion

**Non-Goals**:
- Plan resolution logic (which arm to select) — stays in `LocalRuntime.setupWorkspace()`
- `no-worktree` arm — stays in `LocalRuntime.setupWorkspaceNoWorktree()`
- fetch / base-branch sync behavior — unchanged
- seed / liveness / recopy / stage / commit order or content — unchanged
- Decomposing remaining `LocalRuntime` responsibilities (Manager/Bootstrapper/Inspector/Cleanup) — out of scope
- Touching `architecture/`

## Decisions

### D1: MaterializerHost as a narrow interface seam

`WorkspaceMaterializer` receives host capabilities through a `MaterializerHost` interface, not a `LocalRuntime` reference. The interface exposes exactly what the materializer needs:

```typescript
export interface MaterializerHost {
  readonly cwd: string;
  readonly manager: WorktreeManager;
  readonly spawnFn: SpawnFn;
  resolveSetupPlan(): WorkspaceSetupPlan;
  registerWorkspace(workspace: WorkspaceContext): void;
  updateJobState(
    jobId: string,
    mutator: (s: JobState) => JobState,
    slugOpts: { slug: string; stateRoot: string },
  ): Promise<void>;
  writeLivenessSidecar(slug: string, jobId: string, worktreePath: string | null): Promise<void>;
}
```

`LocalRuntime` implements `MaterializerHost`. `writeLivenessSidecar` changes from `private` to package-visible (still only called via the seam in normal flow). `registerWorkspace` is a new thin method that sets `this.workspace = workspace`.

**Rationale**: narrow seam over passing `this` — prevents materializer from accessing unrelated LocalRuntime state; enables testing WorkspaceMaterializer in isolation with a stub host; avoids bidirectional coupling.

**Alternatives considered**:
- Pass `LocalRuntime` directly — rejected: wide coupling, materializer can touch anything
- Pass individual function closures (not an interface) — rejected: harder to read, no single type to implement in tests

### D2: WorkspaceMaterializer as a class with constructor injection

```typescript
export class WorkspaceMaterializer {
  constructor(private readonly host: MaterializerHost) {}
  async materialize(
    slug: string,
    jobId: string,
    plan: Exclude<WorktreeMaterializationPlan, { kind: "no-worktree" }>,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> { ... }
}
```

The `plan` type excludes `no-worktree` (handled by LocalRuntime before delegation). Instantiated once in `LocalRuntime`'s constructor (stored as `private readonly materializer`).

**Rationale**: matches existing runtime conventions; class enables future augmentation without changing call sites.

### D3: no-worktree arm stays in LocalRuntime

`LocalRuntime.materializeWorktree()` becomes:
```typescript
private async materializeWorktree(slug, jobId, plan, opts): Promise<WorkspaceContext> {
  if (plan.kind === "no-worktree") {
    return this.setupWorkspaceNoWorktree(slug, jobId, opts);
  }
  return this.materializer.materialize(slug, jobId, plan, opts);
}
```

**Rationale**: `no-worktree` never calls `manager.create`; it already has its own method (`setupWorkspaceNoWorktree`). Moving it to materializer adds no value to the structure gate assertion.

### D4: Structure gate as grep-in-test

A new test file `src/core/runtime/__tests__/workspace-materializer-structure.test.ts` reads both source files with `fs.readFileSync` and asserts:
1. `local.ts` contains 0 occurrences of `manager.create(`
2. `workspace-materializer.ts` contains ≥2 occurrences of `manager.create(` (resume-recreated + new-run arms)
3. `workspace-materializer.ts` contains ≥1 occurrence of `writeLivenessSidecar(`

**Rationale**: behavioral tests cannot distinguish "method is in local.ts" from "method is in workspace-materializer.ts". Only a structural assertion can enforce the ownership contract and catch the case where the implementation was copied (not moved).

## Risks / Trade-offs

- [Risk] `writeLivenessSidecar` becomes non-private on `LocalRuntime` to satisfy the interface. Mitigation: it's still only reachable through `MaterializerHost` in production code; the method name signals internal use.
- [Risk] Ordering invariants broken during the move. Mitigation: the three invariants are explicitly documented in WorkspaceMaterializer inline comments, mirroring the existing `local.ts` comments (`T-02`, `T-03`, `D2`).
- [Risk] `JobStateStore` import must be added to `workspace-materializer.ts`. Mitigation: straight import, same pattern already used throughout the codebase.

## Open Questions

None. Plan resolution, arm contents, and structure gate shape are fully specified in the user request and design decisions above.
