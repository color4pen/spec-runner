/**
 * Tests for WorkspaceMaterializer attach-from-checkpoint arm (T-05).
 *
 * TC-MA-001: attach-from-checkpoint arm calls manager.create with checkpointRef as 4th arg
 * TC-MA-002: attach-from-checkpoint arm calls writeLivenessSidecar with pid=null
 * TC-MA-003: attach-from-checkpoint arm does NOT call updateJobState or bootstrap seed
 * TC-MA-004: existing resume-recreated arm is unchanged (regression)
 */
import { describe, it, expect, vi } from "vitest";
import { WorkspaceMaterializer } from "../../src/core/runtime/workspace-materializer.js";
import type { MaterializerHost } from "../../src/core/runtime/workspace-materializer.js";
import type { WorkspaceSetupPlan } from "../../src/core/worktree/setup.js";

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makeStubHost(overrides: Partial<MaterializerHost> = {}): MaterializerHost {
  const worktreePath = "/repo/.git/specrunner-worktrees/my-feature-12345678";

  return {
    cwd: "/repo",
    manager: {
      create: vi.fn().mockResolvedValue(worktreePath),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    },
    spawnFn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
    resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
    registerWorkspace: vi.fn(),
    updateJobState: vi.fn().mockResolvedValue(undefined),
    writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const SLUG = "my-feature";
const JOB_ID = "12345678-1234-1234-1234-123456789012";
const CHECKPOINT_REF = "origin/feat/my-feature-12345678";
const BRANCH_NAME = "feat/my-feature-12345678";

// ---------------------------------------------------------------------------
// TC-MA-001: manager.create called with checkpointRef and branchName
// ---------------------------------------------------------------------------
describe("TC-MA-001: attach-from-checkpoint → manager.create with checkpointRef", () => {
  it("calls manager.create with (cwd, slug, jobId, checkpointRef, branchName, setupPlan)", async () => {
    const host = makeStubHost();
    const materializer = new WorkspaceMaterializer(host);

    await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: CHECKPOINT_REF,
      branchName: BRANCH_NAME,
    });

    expect(host.manager.create).toHaveBeenCalledWith(
      "/repo",
      SLUG,
      JOB_ID,
      CHECKPOINT_REF,
      BRANCH_NAME,
      { kind: "skip" },
      true, // preserveBranchOnFailure=true: attach cannot prove ownership, never deletes branch
    );
  });
});

// ---------------------------------------------------------------------------
// TC-MA-002: writeLivenessSidecar called with pid=null
// ---------------------------------------------------------------------------
describe("TC-MA-002: attach-from-checkpoint → writeLivenessSidecar with pid=null", () => {
  it("calls writeLivenessSidecar with null as 4th argument", async () => {
    const host = makeStubHost();
    const materializer = new WorkspaceMaterializer(host);

    await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: CHECKPOINT_REF,
      branchName: BRANCH_NAME,
    });

    expect(host.writeLivenessSidecar).toHaveBeenCalledWith(
      SLUG,
      JOB_ID,
      expect.any(String), // worktreePath
      null,               // pid = null
    );
  });
});

// ---------------------------------------------------------------------------
// TC-MA-003: updateJobState and bootstrapState NOT called
// ---------------------------------------------------------------------------
describe("TC-MA-003: attach-from-checkpoint → updateJobState/bootstrap not called", () => {
  it("does not call updateJobState", async () => {
    const host = makeStubHost();
    const materializer = new WorkspaceMaterializer(host);

    await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: CHECKPOINT_REF,
      branchName: BRANCH_NAME,
    });

    expect(host.updateJobState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MA-005: attach arm does NOT call rev-parse (ownership proof via pre-check removed)
// ---------------------------------------------------------------------------
describe("TC-MA-005: attach-from-checkpoint → no ownership-proof rev-parse", () => {
  it("does not call spawnFn with rev-parse args for the branch before create", async () => {
    const host = makeStubHost();
    const materializer = new WorkspaceMaterializer(host);

    await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: CHECKPOINT_REF,
      branchName: BRANCH_NAME,
    });

    // spawnFn must NOT have been called with rev-parse (ownership proof via pre-check is removed)
    const spawnCalls = vi.mocked(host.spawnFn).mock.calls;
    const revParseCall = spawnCalls.find(
      ([_cmd, args]) => Array.isArray(args) && args.some((a: string) => a.includes("rev-parse")),
    );
    expect(revParseCall).toBeUndefined();
  });

  it("passes preserveBranchOnFailure=true as 7th arg to manager.create unconditionally", async () => {
    // Even if spawnFn returns exitCode 1 (branch does not exist), preserveBranchOnFailure is still true.
    const hostNoBranch = makeStubHost({
      spawnFn: vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" }),
    });
    const materializer = new WorkspaceMaterializer(hostNoBranch);

    await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: CHECKPOINT_REF,
      branchName: BRANCH_NAME,
    });

    // 7th arg must be true regardless of any rev-parse outcome
    expect(hostNoBranch.manager.create).toHaveBeenCalledWith(
      expect.any(String), // repoRoot
      SLUG,
      JOB_ID,
      CHECKPOINT_REF,
      BRANCH_NAME,
      expect.any(Object), // setupPlan
      true, // preserveBranchOnFailure — always true for attach
    );
  });
});

// ---------------------------------------------------------------------------
// TC-MA-004: existing resume-recreated arm is unchanged (regression)
// ---------------------------------------------------------------------------
describe("TC-MA-004: resume-recreated arm unchanged (regression)", () => {
  it("still calls manager.create with remoteBaseRef and undefined branchName", async () => {
    const host = makeStubHost();
    const materializer = new WorkspaceMaterializer(host);

    await materializer.materialize(SLUG, JOB_ID, {
      kind: "resume-recreated",
      remoteBaseRef: "origin/main",
    }, {
      bootstrapState: undefined,
    });

    expect(host.manager.create).toHaveBeenCalledWith(
      "/repo",
      SLUG,
      JOB_ID,
      "origin/main",
      undefined,
      { kind: "skip" },
    );
    // resume-recreated calls writeLivenessSidecar without pid (uses default process.pid)
    expect(host.writeLivenessSidecar).toHaveBeenCalled();
    const sidecarCall = vi.mocked(host.writeLivenessSidecar).mock.calls[0];
    // 4th arg should be undefined (not null) — uses default
    expect(sidecarCall?.[3]).toBeUndefined();
  });
});
