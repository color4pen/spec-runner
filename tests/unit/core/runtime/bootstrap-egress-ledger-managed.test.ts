/**
 * Tests for bootstrap-commit-egress-ledger: managed.ts path
 *
 * TC-003: managed.ts run path records bootstrap OID in synthesizedCommits
 * TC-006: managed.ts rev-parse failure aborts bootstrap (setupWorkspace throws)
 *
 * RED before fix (T-03): ManagedRuntime.setupWorkspace does not capture the bootstrap
 * commit OID. TC-003 fails because synthesizedCommits is absent in managed local state.
 * TC-006 fails because setupWorkspace does not throw on rev-parse failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";
import { buildInitialJobState, JobStateStore } from "../../../../src/store/job-state-store.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { localSidecarDir } from "../../../../src/util/paths.js";

const SLUG = "bootstrap-managed-egress-test";
const BRANCH_NAME = "feat/bootstrap-managed-egress-test-abcd1234";
const MANAGED_BOOTSTRAP_OID = "cafebabe1234cafebabe1234cafebabe12345678";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-managed-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function buildMockSessionClient() {
  return {
    createSession: vi.fn(),
    sendUserMessage: vi.fn(),
    pollUntilComplete: vi.fn(),
    streamEvents: vi.fn(),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
  };
}

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

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

/**
 * Build a spawnFn stub for managed runtime bootstrap recording.
 * Returns a known OID for `git rev-parse HEAD`; success for all other calls.
 */
function buildManagedBootstrapSpawnFn(bootstrapOid: string): SpawnFn {
  return vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
      return { exitCode: 0, stdout: `${bootstrapOid}\n`, stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

/**
 * Build a spawnFn stub where git commit succeeds but rev-parse HEAD fails.
 */
function buildManagedRevParseFailSpawnFn(): SpawnFn {
  return vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
      return { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

// ---------------------------------------------------------------------------
// TC-003: managed.ts run path records bootstrap OID in synthesizedCommits
// ---------------------------------------------------------------------------
describe("TC-003: managed.ts run path records bootstrap OID in synthesizedCommits", () => {
  it(
    "managed local state synthesizedCommits contains bootstrap OID after setupWorkspace with requestFilePath",
    async () => {
      // Arrange: create a real request.md for setupWorkspace to copy
      const requestFilePath = path.join(tempDir, "source-request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Managed Egress Test\n", "utf-8");

      const sessionClient = buildMockSessionClient();
      const githubClient = buildMockGitHubClient();
      const spawnFn = buildManagedBootstrapSpawnFn(MANAGED_BOOTSTRAP_OID);

      const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), spawnFn, "");

      const jobState = buildInitialJobState({
        request: { path: requestFilePath, title: "Bootstrap Managed Egress Test", type: "bug-fix", slug: SLUG },
        repository: { owner: "test", name: "repo" },
      });

      // Act: run managed setup with branchName + requestFilePath
      await runtime.setupWorkspace(SLUG, jobState.jobId, {
        branchName: BRANCH_NAME,
        requestFilePath,
        bootstrapState: jobState,
      });

      // Assert: TC-003
      // Load the persisted managed local state from .specrunner/local/<slug>/
      const managedStore = new JobStateStore(jobState.jobId, tempDir, {
        changeDir: path.join(tempDir, localSidecarDir(SLUG)),
      });
      const persistedState = await managedStore.load();

      // RED before T-03 fix: synthesizedCommits is absent/empty because setupWorkspace
      // does not call git rev-parse HEAD or appendSynthesizedCommit.
      expect(
        persistedState.synthesizedCommits,
        "synthesizedCommits must contain the managed bootstrap OID after T-03 fix " +
        "(RED: current setupWorkspace does not capture OID via git rev-parse HEAD)",
      ).toContain(MANAGED_BOOTSTRAP_OID);
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-006: managed.ts rev-parse failure aborts bootstrap
// ---------------------------------------------------------------------------
describe("TC-006: managed.ts rev-parse failure aborts bootstrap (setupWorkspace throws)", () => {
  it(
    "setupWorkspace throws when git rev-parse HEAD returns non-zero after bootstrap commit",
    async () => {
      // Arrange
      const requestFilePath = path.join(tempDir, "source-request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Managed Egress Test\n", "utf-8");

      const sessionClient = buildMockSessionClient();
      const githubClient = buildMockGitHubClient();
      const spawnFn = buildManagedRevParseFailSpawnFn();

      const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), spawnFn, "");

      const jobState = buildInitialJobState({
        request: { path: requestFilePath, title: "Bootstrap Managed Egress Test", type: "bug-fix", slug: SLUG },
        repository: { owner: "test", name: "repo" },
      });

      // Act + Assert: TC-006
      // RED before T-03 fix: current setupWorkspace never calls git rev-parse HEAD,
      // so it does NOT throw. The test fails here (expects rejection, gets resolution).
      // Additionally: after fix, the git push that follows the commit must NOT be reached
      // when rev-parse fails (fail-closed).
      await expect(
        runtime.setupWorkspace(SLUG, jobState.jobId, {
          branchName: BRANCH_NAME,
          requestFilePath,
          bootstrapState: jobState,
        }),
      ).rejects.toThrow();
    },
    20000,
  );
});
