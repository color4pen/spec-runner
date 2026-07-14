# Tasks: WorkspaceMaterializer Extraction

## T-01: Define MaterializerHost interface and WorkspaceMaterializer skeleton in workspace-materializer.ts

Add the `MaterializerHost` interface and a `WorkspaceMaterializer` class stub to `src/core/runtime/workspace-materializer.ts`. At this stage `materialize()` can throw `"not implemented"` — T-02 fills in the body.

Required imports to add at the top of `workspace-materializer.ts`:
- `WorktreeManager` from `"../worktree/manager.js"`
- `SpawnFn` from `"../../util/spawn.js"`
- `WorkspaceSetupPlan` from `"../worktree/setup.js"`
- `WorkspaceContext`, `WorkspaceOptions` from `"../port/runtime-strategy.js"`
- `JobState` from `"../../state/schema.js"`

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

export class WorkspaceMaterializer {
  constructor(private readonly host: MaterializerHost) {}

  async materialize(
    slug: string,
    jobId: string,
    plan: Exclude<WorktreeMaterializationPlan, { kind: "no-worktree" }>,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    throw new Error("not implemented");
  }
}
```

- [ ] Add `MaterializerHost` interface to `workspace-materializer.ts` with the 7 members listed above
- [ ] Add `WorkspaceMaterializer` class with constructor and stub `materialize()` method
- [ ] Add all required imports
- [ ] Confirm `bun run typecheck` reports no type errors in `workspace-materializer.ts`

**Acceptance Criteria**:
- `workspace-materializer.ts` exports `MaterializerHost` interface and `WorkspaceMaterializer` class
- `bun run typecheck` passes (may not compile the full project yet if T-03 is incomplete, but this file itself should be clean)

---

## T-02: Implement WorkspaceMaterializer.materialize() with all four active arms

Move the body of `LocalRuntime.materializeWorktree()` for the four active arms into `WorkspaceMaterializer.materialize()`. Replace all `this.*` references with `host.*` equivalents. Do not remove anything from `local.ts` yet — T-03 handles that.

Arm-by-arm translation guide (source: `local.ts:499–626`):

**resume-existing** (`local.ts:503–514`):
- `this.workspace = workspace` → `this.host.registerWorkspace(workspace)`
- `this.writeLivenessSidecar(slug, jobId, plan.worktreePath)` → `this.host.writeLivenessSidecar(slug, jobId, plan.worktreePath)`
- `recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn)` → `recopyDraftToChangeFolder(this.host.cwd, workspace.cwd, slug, this.host.spawnFn)`

**resume-recreated / resume-without-recorded-worktree** (`local.ts:516–539`):
- `this.resolveSetupPlan()` → `this.host.resolveSetupPlan()`
- `this.manager.create(this.cwd, slug, jobId, plan.remoteBaseRef, undefined, setupPlan)` → `this.host.manager.create(this.host.cwd, slug, jobId, plan.remoteBaseRef, undefined, setupPlan)`
- `this.workspace = workspace` → `this.host.registerWorkspace(workspace)` (BEFORE `updateJobState`)
- `new JobStateStore(jobId, this.cwd, slugOpts).persist(opts.bootstrapState)` → `new JobStateStore(jobId, this.host.cwd, slugOpts).persist(opts.bootstrapState)` (BEFORE `updateJobState`, T-02 invariant)
- `this.updateJobState(...)` → `this.host.updateJobState(...)`
- `this.writeLivenessSidecar(...)` → `this.host.writeLivenessSidecar(...)`
- `recopyDraftToChangeFolder(this.cwd, ...)` → `recopyDraftToChangeFolder(this.host.cwd, ...)`

**new-run** (`local.ts:541–626`):
- `this.resolveSetupPlan()` → `this.host.resolveSetupPlan()`
- `this.manager.create(this.cwd, slug, jobId, plan.remoteBaseRef, plan.branchName, setupPlan)` → `this.host.manager.create(...)`
- `this.workspace = workspaceCtx` → `this.host.registerWorkspace(workspaceCtx)` (BEFORE `updateJobState`)
- `new JobStateStore(jobId, this.cwd, slugOpts).persist(opts.bootstrapState)` (BEFORE `updateJobState`)
- `this.updateJobState(...)` → `this.host.updateJobState(...)`
- `this.writeLivenessSidecar(...)` → `this.host.writeLivenessSidecar(...)`
- `this.spawnFn(...)` → `this.host.spawnFn(...)`
- Failure cleanup: `this.manager.remove(worktreePath, this.cwd)` → `this.host.manager.remove(worktreePath, this.host.cwd)`, same for `prune`
- All path operations (`path.join`, `fs.mkdir`, etc.) use `this.host.cwd` or worktreePath as before

Required additional imports in `workspace-materializer.ts`:
- `* as fs from "node:fs/promises"`
- `* as path from "node:path"`
- `JobStateStore` from `"../../store/job-state-store.js"`
- `changeFolderPath` from `"../../util/paths.js"`
- `copyRulesToChangeFolder`, `copyDraftUsageToChangeFolder`, `recopyDraftToChangeFolder`, `rejectSymlink` from `"../artifact/copy-artifacts.js"`

- [ ] Implement `resume-existing` arm in `WorkspaceMaterializer.materialize()` using host seam
- [ ] Implement `resume-recreated` / `resume-without-recorded-worktree` arm; ensure `registerWorkspace` precedes `updateJobState` and `bootstrapState` persist precedes `updateJobState`
- [ ] Implement `new-run` arm; ensure `registerWorkspace` precedes `updateJobState`, `bootstrapState` persist precedes `updateJobState`, and failure-path cleanup (`manager.remove` + `manager.prune`) precedes throw
- [ ] Add inline comments preserving the `T-02`, `T-03`, `D2` markers from local.ts to document ordering rationale
- [ ] Add all required imports to `workspace-materializer.ts`

**Acceptance Criteria**:
- `WorkspaceMaterializer.materialize()` handles all four arms with correct host-seam substitutions
- Three ordering invariants are preserved (workspace-before-updateJobState, seed-before-updateJobState, failure remove+prune before throw)
- No compilation errors in `workspace-materializer.ts`

---

## T-03: Adapt LocalRuntime to implement MaterializerHost and delegate materializeWorktree

Wire `LocalRuntime` to implement `MaterializerHost` and delegate to `WorkspaceMaterializer`. This is the step that removes `manager.create` from `local.ts`.

Sub-tasks:
- [ ] Add `import { WorkspaceMaterializer, type MaterializerHost } from "./workspace-materializer.js"` to `local.ts`
- [ ] Change `writeLivenessSidecar` visibility from `private` to no access modifier (or keep as `private` and add a thin `writeLivenessSidecar`-implementing method that satisfies `MaterializerHost`)

  Concrete approach: rename or alias the private method so that `LocalRuntime` can satisfy the interface. Simplest: remove `private` keyword from `writeLivenessSidecar`. This is an internal class; the only callers are LocalRuntime itself and the materializer (via seam).

- [ ] Add `registerWorkspace(workspace: WorkspaceContext): void` method to `LocalRuntime`:
  ```typescript
  registerWorkspace(workspace: WorkspaceContext): void {
    this.workspace = workspace;
  }
  ```

- [ ] Add `readonly materializer: WorkspaceMaterializer` to `LocalRuntime` (initialized in constructor):
  ```typescript
  this.materializer = new WorkspaceMaterializer(this);
  ```

- [ ] Add `implements MaterializerHost` to `LocalRuntime` class declaration to get compiler enforcement

- [ ] Replace the body of `LocalRuntime.materializeWorktree()` with delegation:
  ```typescript
  private async materializeWorktree(
    slug: string,
    jobId: string,
    plan: WorktreeMaterializationPlan,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    if (plan.kind === "no-worktree") {
      return this.setupWorkspaceNoWorktree(slug, jobId, opts);
    }
    return this.materializer.materialize(slug, jobId, plan, opts);
  }
  ```

- [ ] Remove all four arm case blocks from `LocalRuntime.materializeWorktree()` (after verifying T-02 is complete and tests pass)

- [ ] Confirm `local.ts` contains zero occurrences of `manager.create(`

- [ ] Confirm `workspace-materializer.ts` contains the two `manager.create(` call sites

**Acceptance Criteria**:
- `LocalRuntime` class declaration includes `implements MaterializerHost`
- `local.ts` contains zero occurrences of `manager.create(`
- `workspace-materializer.ts` contains ≥2 occurrences of `manager.create(`
- `bun run typecheck` passes
- `bun test` passes (all pre-existing tests remain green)

---

## T-04: Add structure gate test

Create a new test file `src/core/runtime/__tests__/workspace-materializer-structure.test.ts` that reads both source files and asserts the structural ownership contract.

File location: `src/core/runtime/__tests__/workspace-materializer-structure.test.ts`

```typescript
/**
 * Structure gate: asserts that manager.create() calls reside in
 * workspace-materializer.ts and NOT in local.ts.
 *
 * This catches the failure mode where the implementation was copied rather
 * than moved, or where manager.create() was accidentally re-added to local.ts.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(__dirname, "..");

function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = source.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

const localSrc = fs.readFileSync(path.join(runtimeDir, "local.ts"), "utf-8");
const materializerSrc = fs.readFileSync(
  path.join(runtimeDir, "workspace-materializer.ts"),
  "utf-8",
);

describe("Structural ownership: manager.create", () => {
  it("local.ts contains 0 occurrences of manager.create(", () => {
    expect(countOccurrences(localSrc, "manager.create(")).toBe(0);
  });

  it("workspace-materializer.ts contains ≥2 occurrences of manager.create(", () => {
    expect(countOccurrences(materializerSrc, "manager.create(")).toBeGreaterThanOrEqual(2);
  });
});

describe("Structural ownership: liveness sidecar", () => {
  it("workspace-materializer.ts contains ≥1 occurrence of writeLivenessSidecar(", () => {
    expect(countOccurrences(materializerSrc, "writeLivenessSidecar(")).toBeGreaterThanOrEqual(1);
  });
});

describe("Structural ownership: registerWorkspace", () => {
  it("workspace-materializer.ts contains ≥1 occurrence of registerWorkspace(", () => {
    expect(countOccurrences(materializerSrc, "registerWorkspace(")).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] Create `src/core/runtime/__tests__/workspace-materializer-structure.test.ts` with the content above
- [ ] Confirm `bun test workspace-materializer-structure` runs and passes

**Acceptance Criteria**:
- The structure gate test file exists at the path above
- All four `it()` blocks pass green
- `bun test` (full suite) passes with the structure gate test included
