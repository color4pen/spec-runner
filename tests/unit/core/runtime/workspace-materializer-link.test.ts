/**
 * Unit tests for WorkspaceMaterializer — onFeatureBranchCreated callback ordering and best-effort.
 *
 * TC-008: base OID resolved once and shared (plan.baseOid → manager.create AND callback)
 * TC-009: worktree failure skips link registration
 * TC-010: registration failure does not stop start
 * TC-011: registration precedes bootstrap commit (ordering)
 * TC-013: construction sites converge on buildFeatureBranchName (grep assertion)
 * TC-014: linked branch name equals local branch name
 * TC-019: buildFeatureBranchName("bug-fix", ...) returns fix/ prefix
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  WorkspaceMaterializer,
  type MaterializerHost,
  type WorktreeMaterializationPlan,
} from "../../../../src/core/runtime/workspace-materializer.js";
import type { WorkspaceSetupPlan } from "../../../../src/core/worktree/setup.js";
import { buildFeatureBranchName } from "../../../../src/config/type-config.js";

// ---------------------------------------------------------------------------
// Minimal MockHost
// ---------------------------------------------------------------------------

const WORKTREE_PATH = "/tmp/test-worktrees/abc";

function makeMockHost(overrides: Partial<MaterializerHost> = {}): MaterializerHost {
  return {
    cwd: "/repo",
    manager: {
      create: vi.fn().mockResolvedValue(WORKTREE_PATH),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    } as unknown as MaterializerHost["manager"],
    spawnFn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
    resolveSetupPlan: vi.fn().mockReturnValue({} as WorkspaceSetupPlan),
    registerWorkspace: vi.fn(),
    updateJobState: vi.fn().mockResolvedValue(undefined),
    writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const BASE_OID = "deadbeefdeadbeefdeadbeefdeadbeef00000001";
const BRANCH_NAME = "feat/my-slug-abcdef01";

function makeNewRunPlan(overrides: Partial<Extract<WorktreeMaterializationPlan, { kind: "new-run" }>> = {}): Extract<WorktreeMaterializationPlan, { kind: "new-run" }> {
  return {
    kind: "new-run",
    remoteBaseRef: "origin/main",
    branchName: BRANCH_NAME,
    baseOid: BASE_OID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-008: base OID resolved once and shared
// ---------------------------------------------------------------------------

describe("TC-008: base OID resolved once and shared", () => {
  it("TC-008: manager.create receives plan.baseOid as base ref", async () => {
    const host = makeMockHost();
    const materializer = new WorkspaceMaterializer(host);
    const plan = makeNewRunPlan();

    await materializer.materialize("my-slug", "job-id-123", plan);

    expect(host.manager.create).toHaveBeenCalledWith(
      host.cwd,
      "my-slug",
      "job-id-123",
      BASE_OID,   // baseOid, not remoteBaseRef
      BRANCH_NAME,
      expect.anything(),
    );
  });

  it("TC-008: onFeatureBranchCreated receives plan.baseOid as first arg", async () => {
    const host = makeMockHost();
    const materializer = new WorkspaceMaterializer(host);
    const plan = makeNewRunPlan();
    const onFeatureBranchCreated = vi.fn().mockResolvedValue(undefined);

    await materializer.materialize("my-slug", "job-id-123", plan, { onFeatureBranchCreated });

    expect(onFeatureBranchCreated).toHaveBeenCalledWith(BASE_OID, BRANCH_NAME);
  });

  it("TC-008: manager.create and callback both use the same OID (baseOid)", async () => {
    const host = makeMockHost();
    const materializer = new WorkspaceMaterializer(host);
    const plan = makeNewRunPlan();
    const capturedArgs: string[] = [];

    const onFeatureBranchCreated = vi.fn().mockImplementation(async (oid: string) => {
      capturedArgs.push(oid);
    });

    await materializer.materialize("my-slug", "job-id-123", plan, { onFeatureBranchCreated });

    const createArgs = vi.mocked(host.manager.create).mock.calls[0];
    const createBaseRef = createArgs![3];   // 4th arg is baseRef
    expect(createBaseRef).toBe(BASE_OID);
    expect(capturedArgs[0]).toBe(BASE_OID);
    expect(createBaseRef).toBe(capturedArgs[0]!);
  });
});

// ---------------------------------------------------------------------------
// TC-009: worktree failure skips link registration
// ---------------------------------------------------------------------------

describe("TC-009: worktree failure skips link registration", () => {
  it("TC-009: onFeatureBranchCreated is NOT called when manager.create throws", async () => {
    const host = makeMockHost({
      manager: {
        create: vi.fn().mockRejectedValue(new Error("git worktree add failed")),
        remove: vi.fn().mockResolvedValue(undefined),
        prune: vi.fn().mockResolvedValue(undefined),
      } as unknown as MaterializerHost["manager"],
    });
    const materializer = new WorkspaceMaterializer(host);
    const plan = makeNewRunPlan();
    const onFeatureBranchCreated = vi.fn().mockResolvedValue(undefined);

    await expect(
      materializer.materialize("my-slug", "job-id-123", plan, { onFeatureBranchCreated }),
    ).rejects.toThrow("git worktree add failed");

    expect(onFeatureBranchCreated).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-010: registration failure does not stop start
// ---------------------------------------------------------------------------

describe("TC-010: registration failure does not stop start", () => {
  it("TC-010: materialize resolves when onFeatureBranchCreated rejects", async () => {
    const host = makeMockHost();
    const materializer = new WorkspaceMaterializer(host);
    const plan = makeNewRunPlan();
    const onFeatureBranchCreated = vi.fn().mockRejectedValue(new Error("link failed"));

    // Should NOT throw — best-effort callback
    await expect(
      materializer.materialize("my-slug", "job-id-123", plan, { onFeatureBranchCreated }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-011: registration precedes bootstrap commit
// ---------------------------------------------------------------------------

describe("TC-011: registration precedes bootstrap commit", () => {
  // Real temp dirs for this test — needed so fs.cp/mkdir work inside the materializer
  let tmpWorktree: string;
  let tmpRequestFile: string;

  afterEach(async () => {
    if (tmpWorktree) await fsp.rm(tmpWorktree, { recursive: true, force: true }).catch(() => {});
    if (tmpRequestFile) await fsp.rm(tmpRequestFile, { force: true }).catch(() => {});
  });

  it("TC-011: onFeatureBranchCreated is called before git-commit (ordering invariant)", async () => {
    const order: string[] = [];

    // Real temp dirs so fs.cp, fs.mkdir, copyRulesToChangeFolder work
    tmpWorktree = await fsp.mkdtemp(path.join(os.tmpdir(), "tc011-worktree-"));
    tmpRequestFile = path.join(os.tmpdir(), `tc011-request-${Date.now()}.md`);
    await fsp.writeFile(tmpRequestFile, "# TC-011 Test\n");

    const mockSpawnFn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes("add")) order.push("git-add");
      if (args.includes("commit")) order.push("git-commit");
      if (args.includes("rev-parse")) return { exitCode: 0, stdout: "abc123\n", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const host = makeMockHost({
      spawnFn: mockSpawnFn,
      manager: {
        create: vi.fn().mockResolvedValue(tmpWorktree),
        remove: vi.fn().mockResolvedValue(undefined),
        prune: vi.fn().mockResolvedValue(undefined),
      } as unknown as MaterializerHost["manager"],
    });
    const materializer = new WorkspaceMaterializer(host);
    const plan = makeNewRunPlan();
    const onFeatureBranchCreated = vi.fn().mockImplementation(async () => {
      order.push("callback");
    });

    await materializer.materialize("my-slug", "job-id-123", plan, {
      onFeatureBranchCreated,
      requestFilePath: tmpRequestFile,
    });

    // Both callback and commit must have fired
    expect(order).toContain("callback");
    expect(order).toContain("git-commit");

    // Callback must precede the bootstrap commit
    expect(order.indexOf("callback")).toBeLessThan(order.indexOf("git-commit"));
  });
});

// ---------------------------------------------------------------------------
// TC-013/TC-014: branch name builder convergence and equals
// ---------------------------------------------------------------------------

describe("TC-013: construction sites converge on buildFeatureBranchName", () => {
  it("TC-013: buildFeatureBranchName is importable and returns the correct format", () => {
    const result = buildFeatureBranchName("new-feature", "my-slug", "abcdef0123456789");
    expect(result).toBe("feat/my-slug-abcdef01");
  });

  it("TC-013: pipeline-run.ts / design.ts / commit-orchestrator.ts all call buildFeatureBranchName", () => {
    const sites = [
      "src/core/command/pipeline-run.ts",
      "src/core/step/design.ts",
      "src/core/step/commit-orchestrator.ts",
    ];
    for (const relPath of sites) {
      const content = fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
      expect(content, `${relPath} should reference buildFeatureBranchName`).toContain("buildFeatureBranchName");
    }
  });
});

describe("TC-014: linked branch name equals local branch name", () => {
  it("TC-014: onFeatureBranchCreated receives the same branch name as passed to manager.create", async () => {
    const host = makeMockHost();
    const materializer = new WorkspaceMaterializer(host);
    const branchName = buildFeatureBranchName("new-feature", "my-slug", "abcdef0123456789");
    const plan = makeNewRunPlan({ branchName });
    const capturedBranch: string[] = [];

    const onFeatureBranchCreated = vi.fn().mockImplementation(async (_oid: string, name: string) => {
      capturedBranch.push(name);
    });

    await materializer.materialize("my-slug", "job-id-123", plan, { onFeatureBranchCreated });

    const createArgs = vi.mocked(host.manager.create).mock.calls[0];
    const createBranchName = createArgs![4];   // 5th arg is branchName
    expect(capturedBranch[0]).toBe(branchName);
    expect(capturedBranch[0]).toBe(createBranchName);
  });
});

// ---------------------------------------------------------------------------
// TC-019: buildFeatureBranchName correctness
// ---------------------------------------------------------------------------

describe("TC-019: buildFeatureBranchName returns correct branch name for each type", () => {
  it('TC-019: bug-fix → "fix/" prefix (not "feat/")', () => {
    expect(buildFeatureBranchName("bug-fix", "my-slug", "abcdef0123")).toBe("fix/my-slug-abcdef01");
  });

  it('TC-019: new-feature → "feat/" prefix', () => {
    expect(buildFeatureBranchName("new-feature", "my-slug", "abcdef0123")).toBe("feat/my-slug-abcdef01");
  });

  it("TC-019: only first 8 chars of jobId are used", () => {
    const result = buildFeatureBranchName("bug-fix", "slug", "1234567890abcdef");
    expect(result.endsWith("-12345678")).toBe(true);
  });
});
