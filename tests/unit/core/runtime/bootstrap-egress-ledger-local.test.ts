/**
 * Tests for bootstrap-commit-egress-ledger: local.ts no-worktree path
 *
 * TC-002: local.ts no-worktree run path records bootstrap OID in synthesizedCommits
 * TC-005: local.ts rev-parse failure aborts bootstrap (setupWorkspaceNoWorktree throws)
 *
 * RED before fix (T-02): setupWorkspaceNoWorktree does not capture the bootstrap commit OID.
 * TC-002 fails because synthesizedCommits is absent in persisted state.
 * TC-005 fails because setupWorkspaceNoWorktree does not throw on rev-parse failure.
 */

// Config store mock must be hoisted before any import that transitively loads it.
vi.mock("../../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    runtime: "local",
    pipeline: { maxRetries: 2 },
    agents: {},
  }),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { buildInitialJobState, JobStateStore } from "../../../../src/store/job-state-store.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

const SLUG = "bootstrap-local-egress-test";
const BRANCH_NAME = "feat/bootstrap-local-egress-test-abcd1234";
const BOOTSTRAP_OID = "deadbeef1234deadbeef1234deadbeef12345678";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-local-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function buildMockGitHubClient() {
  return {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      headRefName: "",
      mergeable: "MERGEABLE",
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}

function buildMockManager() {
  return {
    create: vi.fn().mockResolvedValue(path.join(tempDir, "worktree")),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a spawnFn stub for no-worktree mode bootstrap recording.
 * Returns a known OID for `git rev-parse HEAD`; success for all other calls.
 */
function buildBootstrapSpawnFn(bootstrapOid: string): SpawnFn {
  return vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "status" && args[1] === "--porcelain") {
      return { exitCode: 0, stdout: "", stderr: "" }; // clean working tree
    }
    if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
      return { exitCode: 0, stdout: `${bootstrapOid}\n`, stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

/**
 * Build a spawnFn stub where git commit succeeds but rev-parse HEAD fails.
 */
function buildRevParseFailSpawnFn(): SpawnFn {
  return vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "status" && args[1] === "--porcelain") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
      return { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

// ---------------------------------------------------------------------------
// TC-002: local.ts no-worktree run path records bootstrap OID in synthesizedCommits
// ---------------------------------------------------------------------------
describe("TC-002: local.ts no-worktree run path records bootstrap OID in synthesizedCommits", () => {
  it(
    "persisted state.synthesizedCommits contains bootstrap OID after setupWorkspace with requestFilePath",
    async () => {
      // Arrange: create a real request.md for setupWorkspaceNoWorktree to copy
      const requestFilePath = path.join(tempDir, "source-request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Local Egress Test\n", "utf-8");

      const githubClient = buildMockGitHubClient();
      const manager = buildMockManager();
      const spawnFn = buildBootstrapSpawnFn(BOOTSTRAP_OID);

      const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

      const jobState = buildInitialJobState({
        request: { path: requestFilePath, title: "Bootstrap Local Egress Test", type: "bug-fix", slug: SLUG },
        repository: { owner: "test", name: "repo" },
      });

      // Act: run no-worktree setup with requestFilePath set
      await runtime.setupWorkspace(SLUG, jobState.jobId, {
        noWorktree: true,
        branchName: BRANCH_NAME,
        requestFilePath,
        bootstrapState: jobState,
      });

      // Assert: TC-002
      // Load the persisted state from the slug store (stateRoot = tempDir for no-worktree)
      const store = new JobStateStore(jobState.jobId, tempDir, { slug: SLUG, stateRoot: tempDir });
      const persistedState = await store.load();

      // RED before T-02 fix: synthesizedCommits is absent/empty because setupWorkspaceNoWorktree
      // does not call git rev-parse HEAD or appendSynthesizedCommit.
      expect(
        persistedState.synthesizedCommits,
        "synthesizedCommits must contain the bootstrap OID after T-02 fix " +
        "(RED: current setupWorkspaceNoWorktree does not capture OID via git rev-parse HEAD)",
      ).toContain(BOOTSTRAP_OID);
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-005: local.ts rev-parse failure aborts bootstrap
// ---------------------------------------------------------------------------
describe("TC-005: local.ts rev-parse failure aborts bootstrap (setupWorkspaceNoWorktree throws)", () => {
  it(
    "setupWorkspace throws when git rev-parse HEAD returns non-zero after bootstrap commit",
    async () => {
      // Arrange
      const requestFilePath = path.join(tempDir, "source-request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Local Egress Test\n", "utf-8");

      const githubClient = buildMockGitHubClient();
      const manager = buildMockManager();
      const spawnFn = buildRevParseFailSpawnFn();

      const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

      const jobState = buildInitialJobState({
        request: { path: requestFilePath, title: "Bootstrap Local Egress Test", type: "bug-fix", slug: SLUG },
        repository: { owner: "test", name: "repo" },
      });

      // Act + Assert: TC-005
      // RED before T-02 fix: current setupWorkspaceNoWorktree never calls git rev-parse HEAD,
      // so it does NOT throw. The test fails here (expects rejection, gets resolution).
      await expect(
        runtime.setupWorkspace(SLUG, jobState.jobId, {
          noWorktree: true,
          branchName: BRANCH_NAME,
          requestFilePath,
          bootstrapState: jobState,
        }),
      ).rejects.toThrow();
    },
    20000,
  );
});
