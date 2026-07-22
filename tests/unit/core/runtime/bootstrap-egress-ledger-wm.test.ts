/**
 * Tests for bootstrap-commit-egress-ledger: workspace-materializer paths
 *
 * TC-001: workspace-materializer new-run path records bootstrap OID in synthesizedCommits
 * TC-004: workspace-materializer rev-parse failure aborts bootstrap and cleans up worktree
 *
 * RED before fix (T-01): the materializer does not capture the bootstrap commit OID
 * and does not call appendSynthesizedCommit. TC-001 fails because synthesizedCommits
 * is absent. TC-004 fails because materialize() does not reject on rev-parse failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { WorkspaceMaterializer } from "../../../../src/core/runtime/workspace-materializer.js";
import type { MaterializerHost } from "../../../../src/core/runtime/workspace-materializer.js";
import type { JobState } from "../../../../src/state/schema.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { WorkspaceSetupPlan } from "../../../../src/core/worktree/setup.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

const SLUG = "bootstrap-wm-egress-test";
const JOB_ID = "aaaabbbb-cccc-dddd-eeee-000000000001";
const BOOTSTRAP_OID = "abc123def456abc123def456abc123def456abc1";

let tempDir: string;
let worktreeDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-wm-"));
  worktreeDir = path.join(tempDir, "worktree");
  await fs.mkdir(worktreeDir, { recursive: true });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeInitialState(): JobState {
  return buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Bootstrap Egress Test",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: "test", name: "repo" },
  });
}

// ---------------------------------------------------------------------------
// TC-001: workspace-materializer new-run path records bootstrap OID in synthesizedCommits
// ---------------------------------------------------------------------------
describe("TC-001: workspace-materializer new-run path records bootstrap OID in synthesizedCommits", () => {
  it(
    "synthesizedCommits contains bootstrap OID after materialize() with requestFilePath set",
    async () => {
      // Arrange: create a real request.md file (materialize() does fs.cp)
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Egress Test\n", "utf-8");

      const initialState = makeInitialState();
      let trackedState: JobState = { ...initialState };

      const host: MaterializerHost = {
        cwd: tempDir,
        manager: {
          create: vi.fn().mockResolvedValue(worktreeDir),
          remove: vi.fn().mockResolvedValue(undefined),
          prune: vi.fn().mockResolvedValue(undefined),
        },
        // spawnFn: returns known OID for rev-parse HEAD; success for all other git calls
        spawnFn: vi.fn().mockImplementation(
          async (_cmd: string, args: string[]) => {
            if (args[0] === "rev-parse" && args[1] === "HEAD") {
              return { exitCode: 0, stdout: `${BOOTSTRAP_OID}\n`, stderr: "" };
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        ) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        // updateJobState: applies each mutator to trackedState so we can inspect the result
        updateJobState: vi.fn().mockImplementation(
          async (_jobId: string, mutator: (s: JobState) => JobState) => {
            trackedState = mutator(trackedState);
          },
        ),
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);

      // Act
      await materializer.materialize(
        SLUG,
        JOB_ID,
        { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/bootstrap-wm-egress-test" },
        { requestFilePath, bootstrapState: initialState },
      );

      // Assert: TC-001
      // RED before T-01 fix: updateJobState is never called with appendSynthesizedCommit,
      // so synthesizedCommits remains undefined / empty. The test fails here.
      expect(
        trackedState.synthesizedCommits,
        "synthesizedCommits must contain the bootstrap OID after T-01 fix " +
        "(RED: current code does not capture OID via git rev-parse HEAD)",
      ).toContain(BOOTSTRAP_OID);
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-004: workspace-materializer rev-parse failure aborts bootstrap and cleans up worktree
// ---------------------------------------------------------------------------
describe("TC-004: workspace-materializer rev-parse failure aborts bootstrap and cleans up worktree", () => {
  it(
    "materialize() rejects and calls manager.remove + manager.prune when rev-parse fails",
    async () => {
      // Arrange
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Egress Test\n", "utf-8");

      const initialState = makeInitialState();
      const removeStub = vi.fn().mockResolvedValue(undefined);
      const pruneStub = vi.fn().mockResolvedValue(undefined);

      const host: MaterializerHost = {
        cwd: tempDir,
        manager: {
          create: vi.fn().mockResolvedValue(worktreeDir),
          remove: removeStub,
          prune: pruneStub,
        },
        // spawnFn: git commit succeeds, git rev-parse HEAD fails with exitCode 128
        spawnFn: vi.fn().mockImplementation(
          async (_cmd: string, args: string[]) => {
            if (args[0] === "rev-parse" && args[1] === "HEAD") {
              return { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        ) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        updateJobState: vi.fn().mockResolvedValue(undefined),
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);

      // Act + Assert: TC-004
      // RED before T-01 fix: current code never calls git rev-parse HEAD, so materialize()
      // does NOT reject. The test fails here (expects rejection, gets resolution).
      await expect(
        materializer.materialize(
          SLUG,
          JOB_ID,
          { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/bootstrap-wm-egress-test" },
          { requestFilePath, bootstrapState: initialState },
        ),
      ).rejects.toThrow();

      // After T-01 fix: cleanup must be called before propagating the error.
      expect(
        removeStub,
        "manager.remove must be called on rev-parse failure (worktree cleanup, invariant 3)",
      ).toHaveBeenCalled();
      expect(
        pruneStub,
        "manager.prune must be called on rev-parse failure (worktree cleanup, invariant 3)",
      ).toHaveBeenCalled();
    },
    20000,
  );
});
