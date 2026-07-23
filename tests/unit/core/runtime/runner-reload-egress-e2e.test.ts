/**
 * Integration/E2E tests: setupWorkspace 後の in-memory state を store から reload
 *
 * TC-001 (spec): Bootstrap OID reaches pipeline in-memory state
 * TC-005 (spec): Halt persist after reload preserves ledger
 * TC-013: E2E — bootstrap → reload → in-memory synthesizedCommits → egress passes
 * TC-014 (TC-013b): Runner 経路の封鎖 — pipeline に渡る state が reload 由来
 * TC-015: Halt-path persist does not revert synthesizedCommits
 *
 * TC-013 and TC-015 use real git repos in $TMPDIR.
 * TC-014 uses a fake RuntimeStrategy to confirm the runner forwards reload-derived state.
 *
 * RED state: TC-013, TC-014, TC-015 all fail until T-02 and T-04 are implemented.
 *   TC-013: fails because LocalRuntime.reloadJobState does not exist (T-02)
 *   TC-014: fails because runner.ts does not call reloadJobState (T-04)
 *   TC-015: extends TC-013 setup; fails until T-02 is implemented
 *
 * Test timeout: ≥ 30 000ms (real git operations)
 */

// Config store mock must be hoisted before LocalRuntime import
vi.mock("../../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    runtime: "local",
    pipeline: { maxRetries: 2 },
    agents: {},
  }),
}));

// Pipeline module mock (for TC-014 runner path sealing test)
vi.mock("../../../../src/core/pipeline/index.js", () => ({
  buildPipelineForJob: vi.fn().mockReturnValue({
    run: vi.fn().mockResolvedValue({
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "pr-create",
      status: "awaiting-archive",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {},
    }),
  }),
  createStandardPipeline: vi.fn(),
}));

// log-retention mock
vi.mock("../../../../src/logger/log-retention.js", () => ({
  pruneOldLogs: vi.fn().mockResolvedValue(undefined),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { JobStateStore, buildInitialJobState } from "../../../../src/store/job-state-store.js";
import { CommandRunner } from "../../../../src/core/command/runner.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import type { RuntimeStrategy, WorkspaceContext, CleanupHandle } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { JobState } from "../../../../src/state/schema.js";
import { verifyEgressLedger } from "../../../../src/core/step/commit-push.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { spawnCommand } from "../../../../src/util/spawn.js";
import { buildPipelineForJob } from "../../../../src/core/pipeline/index.js";

const E2E_SLUG = "reload-egress-e2e-test";
const E2E_BRANCH = "feat/reload-egress-e2e-test";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reload-egress-e2e-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Real git helpers (synchronous, for test setup)
// ---------------------------------------------------------------------------

function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

async function createGitRepo(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  gitSync(["init"], dir);
  gitSync(["config", "user.email", "reload-egress-e2e@spec-runner.local"], dir);
  gitSync(["config", "user.name", "Reload Egress E2E Test"], dir);
}

async function createBareRemote(repoDir: string, bareDir: string): Promise<void> {
  gitSync(["init", "--bare", bareDir], repoDir);
  gitSync(["remote", "add", "origin", bareDir], repoDir);
}

async function makeInitialCommitAndPush(repoDir: string): Promise<string> {
  const readmePath = path.join(repoDir, "README.md");
  await fs.writeFile(readmePath, "# Reload Egress E2E Test\n", "utf-8");
  gitSync(["add", "README.md"], repoDir);
  gitSync(["commit", "-m", "initial: test repo setup"], repoDir);
  gitSync(["push", "origin", "HEAD:main"], repoDir);
  return gitSync(["rev-parse", "HEAD"], repoDir);
}

/** SpawnFn that delegates to real git (used for verifyEgressLedger). */
function makeRealSpawnFn(cwd: string): SpawnFn {
  return async (cmd: string, args: string[], _opts?: { cwd?: string }) => {
    const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
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

// ---------------------------------------------------------------------------
// TC-013 / TC-001: E2E — bootstrap → reload → in-memory synthesizedCommits → egress passes
// ---------------------------------------------------------------------------

describe("TC-013 / TC-001: E2E — bootstrap → reload → in-memory synthesizedCommits → egress passes", () => {
  it(
    "reloadJobState returns state with bootstrap OID; verifyEgressLedger passes",
    async () => {
      // Step 1: Create real git repo + bare remote
      const repoDir = path.join(tempDir, "repo");
      const bareDir = path.join(tempDir, "bare.git");
      await createGitRepo(repoDir);
      await createBareRemote(repoDir, bareDir);
      await makeInitialCommitAndPush(repoDir);

      // Step 2: Create LocalRuntime with real spawnFn
      const runtime = new LocalRuntime({
        cwd: repoDir,
        githubClient: buildMockGitHubClient(),
        // Use real spawnFn for actual git operations
        spawnFn: spawnCommand,
      });

      // Step 3: Build bootstrapState
      const bootstrapState = buildInitialJobState({
        request: {
          path: path.join(repoDir, "specrunner", "changes", E2E_SLUG, "request.md"),
          title: "Reload Egress E2E Test",
          type: "bug-fix",
          slug: E2E_SLUG,
        },
        repository: { owner: "test", name: "repo" },
        reviewers: [],
      });

      // Create a request.md file for setupWorkspace to copy
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Reload Egress E2E Test\n\n## Background\nTest request.\n", "utf-8");

      // Step 4: Call setupWorkspace — no manual seed
      const workspace = await runtime.setupWorkspace(E2E_SLUG, bootstrapState.jobId, {
        requestFilePath,
        branchName: E2E_BRANCH,
        bootstrapState,
        noWorktree: false, // use real worktree
      });

      // RED before T-02: reloadJobState does not exist on LocalRuntime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtimeAny = runtime as any;
      expect(
        typeof runtimeAny.reloadJobState,
        "reloadJobState must be implemented on LocalRuntime (T-02)",
      ).toBe("function");

      // Step 5: Call reloadJobState — captures in-memory reloaded state
      const reloadedState = await runtimeAny.reloadJobState(
        bootstrapState.jobId,
        E2E_SLUG,
        workspace,
      ) as JobState;

      // Step 6: Assert — synthesizedCommits contains bootstrap OID (in-memory path, NOT store read)
      expect(
        reloadedState.synthesizedCommits,
        "synthesizedCommits must be non-empty after reload (T-02)",
      ).toBeDefined();
      expect(
        (reloadedState.synthesizedCommits ?? []).length,
        "synthesizedCommits must contain at least one OID (bootstrap commit)",
      ).toBeGreaterThan(0);

      const bootstrapOid = (reloadedState.synthesizedCommits ?? [])[0];
      expect(bootstrapOid, "bootstrap OID must be a non-empty string").toBeTruthy();

      // Step 7: Add a step commit and push it to origin (so it's excluded from rev-list)
      const worktreeCwd = workspace.cwd;
      const stepFile = path.join(worktreeCwd, "src", "impl.ts");
      await fs.mkdir(path.dirname(stepFile), { recursive: true });
      await fs.writeFile(stepFile, "// step implementation\n", "utf-8");
      gitSync(["add", path.join("src", "impl.ts")], worktreeCwd);
      gitSync(["commit", "-m", "step: implementer"], worktreeCwd);
      // Push the step commit so it's on origin (excluded from rev-list HEAD --not --remotes=origin)
      gitSync(["push", "origin", E2E_BRANCH], worktreeCwd);

      // Step 8: Assert — verifyEgressLedger passes
      // After pushing the step commit, only the bootstrap commit remains in the "unpushed" set.
      // The ledger (synthesizedCommits) contains the bootstrap OID → egress passes.
      const spawnFn = makeRealSpawnFn(worktreeCwd);
      await expect(
        verifyEgressLedger({
          cwd: worktreeCwd,
          ledger: reloadedState.synthesizedCommits!,
          spawnFn,
        }),
        "verifyEgressLedger must not throw EGRESS_UNKNOWN_COMMIT (bootstrap OID is in ledger)",
      ).resolves.toBeUndefined();
    },
    60000,
  );
});

// ---------------------------------------------------------------------------
// TC-014 (TC-013b): Runner 経路の封鎖 — pipeline に渡る state が reload 由来
// ---------------------------------------------------------------------------

/**
 * TestCommand subclass for TC-014 (captures pipeline state).
 */
class TestCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    private readonly prepareResult: PrepareResult,
  ) {
    super(runtime, new EventBus());
  }

  protected async prepare(): Promise<PrepareResult> {
    return this.prepareResult;
  }
}

function buildPrepareResultForTC014(overrides: Partial<PrepareResult> = {}): PrepareResult {
  const jobState: JobState = {
    version: 1,
    jobId: "test-job-id",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design" as const,
    status: "running" as const,
    branch: "feat/test",
    history: [],
    error: null,
  };
  return {
    jobState,
    startStep: "design",
    request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "test", adr: false },
    config: { version: 1, runtime: "local", agents: {} },
    slug: "test-slug",
    logLevel: "default",
    workspaceOpts: {},
    repoRoot: tempDir,
    ...overrides,
  };
}

describe("TC-014 / TC-013b: Runner 経路の封鎖 — pipeline に渡る state が reload 由来", () => {
  it(
    "pipeline receives state with sentinel synthesizedCommits from reloadJobState",
    async () => {
      // Arrange: fake RuntimeStrategy with reloadJobState returning sentinel state
      const SENTINEL_OID = "sentinel-oid-123";
      const NOOP_HANDLE = {} as unknown as CleanupHandle;

      const sentinelState: JobState = {
        version: 1,
        jobId: "test-job-id",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
        repository: { owner: "testowner", name: "testrepo" },
        session: null,
        step: "design" as const,
        status: "running" as const,
        branch: "feat/test",
        history: [],
        error: null,
        synthesizedCommits: [SENTINEL_OID],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime: any = {
        query: vi.fn(),
        createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
        setupWorkspace: vi.fn().mockResolvedValue({ cwd: "/worktree", branch: "feat/test" }),
        // TC-014: reloadJobState returns sentinel state
        reloadJobState: vi.fn().mockResolvedValue(sentinelState),
        buildDeps: vi.fn().mockReturnValue({
          client: undefined,
          request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "test", adr: false },
          slug: "test-slug",
          githubClient: {},
          cwd: "/worktree",
          runner: { run: vi.fn().mockResolvedValue({ completionReason: "success", resultContent: null }) },
        }),
        registerCleanup: vi.fn().mockReturnValue(NOOP_HANDLE),
        teardown: vi.fn().mockResolvedValue(undefined),
        captureHeadSha: vi.fn().mockResolvedValue(null),
        prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
        finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
        validateStepInputs: vi.fn().mockResolvedValue(undefined),
        commitFinalState: vi.fn().mockResolvedValue(undefined),
        bootstrapJob: vi.fn().mockResolvedValue(sentinelState),
        persistJobState: vi.fn().mockResolvedValue(undefined),
        verifyFindingRefs: vi.fn().mockResolvedValue([]),
        digestArtifacts: vi.fn().mockResolvedValue([]),
        listChangedFiles: vi.fn().mockResolvedValue({ kind: "success" as const, files: [] }),
        validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
      } as RuntimeStrategy;

      const command = new TestCommand(runtime as RuntimeStrategy, buildPrepareResultForTC014());

      // Capture the state passed to pipeline.run()
      let capturedJobState: JobState | undefined;
      const pipelineRunSpy = vi.fn().mockImplementation(
        async (_startStep: unknown, jobState: JobState) => {
          capturedJobState = jobState;
          return {
            ...sentinelState,
            status: "awaiting-archive" as const,
            step: "pr-create" as const,
          };
        },
      );
      (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        run: pipelineRunSpy,
      });

      // Act
      await command.execute();

      // Assert: pipeline received the reload-derived state
      // RED before T-04: capturedJobState will NOT contain sentinel OID
      // (runner.ts doesn't call reloadJobState, so pipeline gets original in-memory state)
      expect(
        pipelineRunSpy,
        "pipeline.run() must have been called",
      ).toHaveBeenCalled();

      expect(
        capturedJobState,
        "capturedJobState must be defined",
      ).toBeDefined();

      expect(
        capturedJobState?.synthesizedCommits,
        `pipeline state must contain sentinel OID '${SENTINEL_OID}' (from reloadJobState, not in-memory mirror) — T-04`,
      ).toContain(SENTINEL_OID);
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-015 / TC-005: Halt-path persist does not revert synthesizedCommits
// ---------------------------------------------------------------------------

describe("TC-015 / TC-005: Halt-path persist does not revert synthesizedCommits", () => {
  it(
    "synthesizedCommits in store survives a halt-path persist (no reversion to null)",
    async () => {
      // Step 1: Create real git repo + bare remote
      const repoDir = path.join(tempDir, "repo");
      const bareDir = path.join(tempDir, "bare.git");
      await createGitRepo(repoDir);
      await createBareRemote(repoDir, bareDir);
      await makeInitialCommitAndPush(repoDir);

      // Step 2: Create LocalRuntime with real spawnFn
      const runtime = new LocalRuntime({
        cwd: repoDir,
        githubClient: buildMockGitHubClient(),
        spawnFn: spawnCommand,
      });

      // Step 3: Build bootstrapState and request file
      const bootstrapState = buildInitialJobState({
        request: {
          path: path.join(repoDir, "specrunner", "changes", E2E_SLUG, "request.md"),
          title: "Halt Path E2E Test",
          type: "bug-fix",
          slug: E2E_SLUG,
        },
        repository: { owner: "test", name: "repo" },
      });

      const requestFilePath = path.join(tempDir, "request-halt.md");
      await fs.writeFile(requestFilePath, "# Halt Path E2E Test\n", "utf-8");

      // Step 4: setupWorkspace to populate the store with bootstrap OID
      const workspace = await runtime.setupWorkspace(E2E_SLUG, bootstrapState.jobId, {
        requestFilePath,
        branchName: E2E_BRANCH,
        bootstrapState,
        noWorktree: false,
      });

      // Step 5: reloadJobState to get state with synthesizedCommits (RED: T-02 required)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtimeAny = runtime as any;
      expect(
        typeof runtimeAny.reloadJobState,
        "reloadJobState must be implemented (T-02)",
      ).toBe("function");

      const reloadedState = await runtimeAny.reloadJobState(
        bootstrapState.jobId,
        E2E_SLUG,
        workspace,
      ) as JobState;

      expect(
        reloadedState.synthesizedCommits,
        "reloaded state must have synthesizedCommits",
      ).toBeDefined();
      expect(
        (reloadedState.synthesizedCommits ?? []).length,
        "synthesizedCommits must be non-empty",
      ).toBeGreaterThan(0);

      const bootstrapOid = (reloadedState.synthesizedCommits ?? [])[0];

      // Step 6: Simulate halt-path persist
      // Halt happens when pipeline's safety net transitions state to awaiting-resume
      // and then the runner persists the in-memory state back to the store.
      const stateRoot = workspace.worktreePath ?? repoDir;
      const store = new JobStateStore(bootstrapState.jobId, repoDir, { slug: E2E_SLUG, stateRoot });
      await store.persist(reloadedState);

      // Step 7: Reload from store again and assert synthesizedCommits is intact
      const reloadedAgain = await runtimeAny.reloadJobState(
        bootstrapState.jobId,
        E2E_SLUG,
        workspace,
      ) as JobState;

      expect(
        reloadedAgain.synthesizedCommits,
        "synthesizedCommits must not revert to null after halt-path persist",
      ).toBeDefined();
      expect(
        reloadedAgain.synthesizedCommits,
        `bootstrapOid '${bootstrapOid}' must survive halt-path persist (no reversion to null)`,
      ).toContain(bootstrapOid);
    },
    60000,
  );
});
