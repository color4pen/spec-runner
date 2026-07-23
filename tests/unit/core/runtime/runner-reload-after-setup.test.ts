/**
 * Tests: setupWorkspace 後の in-memory state を store から reload し、field 手動 mirror を廃止する
 *
 * TC-010: LocalRuntime.reloadJobState returns state with synthesizedCommits from store
 * TC-011: Reload fail-closed — runner does not start pipeline when reloadJobState rejects
 * TC-012: Field preservation — reviewers/noWorktree/issueNumber survive reload
 * TC-020: LocalRuntime — worktree mode uses worktreePath as stateRoot
 * TC-022: ManagedRuntime.reloadJobState is fail-closed (throws)
 *
 * RED state: all tests fail until T-01 through T-04 are implemented.
 *   TC-010, TC-012, TC-020: fail because LocalRuntime.reloadJobState does not exist (T-02)
 *   TC-011: fails because runner.ts does not call reloadJobState (T-04)
 *   TC-022: fails because ManagedRuntime.reloadJobState does not exist (T-03)
 */

// Config store mock must be hoisted before LocalRuntime / ManagedRuntime imports
vi.mock("../../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    runtime: "local",
    pipeline: { maxRetries: 2 },
    agents: {},
  }),
}));

// Pipeline module mock (for TC-011 and TC-023 runner tests)
vi.mock("../../../../src/core/pipeline/index.js", () => {
  return {
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
  };
});

// log-retention mock (prevents real filesystem ops)
vi.mock("../../../../src/logger/log-retention.js", () => ({
  pruneOldLogs: vi.fn().mockResolvedValue(undefined),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";
import { JobStateStore, buildInitialJobState } from "../../../../src/store/job-state-store.js";
import { CommandRunner } from "../../../../src/core/command/runner.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import type { RuntimeStrategy, WorkspaceContext, CleanupHandle } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { JobState } from "../../../../src/state/schema.js";
import { appendSynthesizedCommit } from "../../../../src/state/schema.js";
import { buildPipelineForJob } from "../../../../src/core/pipeline/index.js";
import type { ReviewerSnapshot } from "../../../../src/kernel/reviewer-snapshot.js";

const SLUG = "runner-reload-after-setup-test";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reload-after-setup-"));
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
// Helpers
// ---------------------------------------------------------------------------

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

function buildMockSpawnFn() {
  return vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }) as unknown as import("../../../../src/util/spawn.js").SpawnFn;
}

function buildInitialState(overrides: Partial<JobState> = {}): JobState {
  const base = buildInitialJobState({
    request: { path: path.join(tempDir, "request.md"), title: "Reload Test", type: "bug-fix", slug: SLUG },
    repository: { owner: "test", name: "repo" },
  });
  return { ...base, ...overrides };
}

/** Build a full RuntimeStrategy mock with reloadJobState that rejects. */
function buildRuntimeWithRejectingReload(reloadError = new Error("store unreadable")) {
  const NOOP_HANDLE = {} as unknown as CleanupHandle;
  const workspace: WorkspaceContext = { cwd: "/worktree" };
  const finalJobState: JobState = {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create" as const,
    status: "awaiting-archive" as const,
    branch: "feat/test",
    history: [],
    error: null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtime: any = {
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockResolvedValue(workspace),
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
    bootstrapJob: vi.fn().mockResolvedValue(finalJobState),
    persistJobState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "success" as const, files: [] }),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    // TC-011: reloadJobState rejects — fail-closed path
    reloadJobState: vi.fn().mockRejectedValue(reloadError),
  };
  return runtime as RuntimeStrategy;
}

/** Build a full RuntimeStrategy mock with reloadJobState returning a sentinel state. */
function buildRuntimeWithSentinelReload(sentinelState: Partial<JobState> = {}) {
  const base = buildRuntimeWithRejectingReload(new Error("unused"));
  const sentinelJobState: JobState = {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create" as const,
    status: "awaiting-archive" as const,
    branch: "feat/test",
    history: [],
    error: null,
    ...sentinelState,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (base as any).reloadJobState = vi.fn().mockResolvedValue(sentinelJobState);
  return base;
}

/** Minimal CommandRunner subclass for testing. */
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

function buildPrepareResult(overrides: Partial<PrepareResult> = {}): PrepareResult {
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

// ---------------------------------------------------------------------------
// TC-010: LocalRuntime.reloadJobState — returns synthesizedCommits from store
// ---------------------------------------------------------------------------

describe("TC-010: LocalRuntime.reloadJobState returns synthesizedCommits from store", () => {
  it(
    "returns state with synthesizedCommits containing seeded OID",
    async () => {
      // Arrange: create a real slug store and seed it with synthesizedCommits
      const JOB_ID = buildInitialState().jobId;
      const seedState = buildInitialState({ jobId: JOB_ID });
      const stateWithCommit = appendSynthesizedCommit(seedState, "abc123");

      const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir });
      await store.persist(stateWithCommit);

      const runtime = new LocalRuntime({
        cwd: tempDir,
        githubClient: buildMockGitHubClient(),
        manager: buildMockManager(),
        spawnFn: buildMockSpawnFn(),
      });

      // workspace without worktreePath → stateRoot = this.cwd = tempDir
      const workspace: WorkspaceContext = { cwd: tempDir };

      // Act: call reloadJobState (RED: method does not exist until T-02 is implemented)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtimeAny = runtime as any;
      expect(typeof runtimeAny.reloadJobState, "reloadJobState must be implemented (T-02)").toBe("function");
      const reloaded = await runtimeAny.reloadJobState(JOB_ID, SLUG, workspace) as JobState;

      // Assert: synthesizedCommits from store is present in the reloaded state
      expect(
        reloaded.synthesizedCommits,
        "synthesizedCommits must contain 'abc123' — reloaded from store (T-02)",
      ).toContain("abc123");
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-011: Reload fail-closed — runner does not start pipeline
// ---------------------------------------------------------------------------

describe("TC-011: Reload fail-closed — runner does not start pipeline when reloadJobState rejects", () => {
  it(
    "execute() returns 1 and pipeline.run() is not called when reloadJobState rejects",
    async () => {
      // Arrange: runtime with reloadJobState that rejects
      const runtime = buildRuntimeWithRejectingReload(new Error("state file unreadable"));
      const command = new TestCommand(runtime, buildPrepareResult());

      // Track whether pipeline.run() is called
      const pipelineRunSpy = vi.fn().mockResolvedValue({
        version: 1,
        jobId: "test-job-id",
        createdAt: "",
        updatedAt: "",
        request: { path: "/req.md", title: "T", type: "new-feature", slug: "test-slug" },
        repository: { owner: "o", name: "r" },
        session: null,
        step: "pr-create" as const,
        status: "awaiting-archive" as const,
        branch: "feat/test",
        history: [],
        error: null,
        steps: {},
      });
      (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        run: pipelineRunSpy,
      });

      // Act
      const exitCode = await command.execute();

      // Assert: fail-closed behavior (RED before T-04)
      expect(
        exitCode,
        "execute() must return 1 when reload fails (T-04 fail-closed path)",
      ).toBe(1);
      expect(
        pipelineRunSpy,
        "pipeline.run() must not be called when reload fails (T-04 fail-closed path)",
      ).not.toHaveBeenCalled();
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-012: Field preservation — reviewers/noWorktree/issueNumber survive reload
// ---------------------------------------------------------------------------

describe("TC-012: Field preservation — reviewers/noWorktree/issueNumber survive reload", () => {
  it(
    "reloaded state retains reviewers, noWorktree, issueNumber, synthesizedCommits, and branch",
    async () => {
      // Arrange: build a bootstrapState with in-memory-only fields
      const mockReviewer: ReviewerSnapshot = {
        name: "security",
        maxIterations: 3,
        purpose: "Security review",
        criteria: "No XSS, CSRF",
        judgment: "approve if clean",
        freeText: "",
      };

      const JOB_ID = buildInitialState().jobId;
      const bootstrapState: JobState = {
        ...buildInitialState({ jobId: JOB_ID }),
        reviewers: [mockReviewer],
        noWorktree: true,
        issueNumber: 42,
      };

      // Seed the slug store with bootstrapState
      const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir });
      await store.persist(bootstrapState);

      // Simulate what setupWorkspace() updateJobState calls do:
      // add synthesizedCommits and branch via a second persist
      const stateAfterSetup: JobState = {
        ...bootstrapState,
        synthesizedCommits: ["bootstrap-oid-abc"],
        branch: "feat/runner-reload-test",
      };
      await store.persist(stateAfterSetup);

      const runtime = new LocalRuntime({
        cwd: tempDir,
        githubClient: buildMockGitHubClient(),
        manager: buildMockManager(),
        spawnFn: buildMockSpawnFn(),
      });

      const workspace: WorkspaceContext = { cwd: tempDir };

      // Act: reload from store (RED: method does not exist until T-02)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtimeAny = runtime as any;
      expect(typeof runtimeAny.reloadJobState, "reloadJobState must be implemented (T-02)").toBe("function");
      const reloaded = await runtimeAny.reloadJobState(JOB_ID, SLUG, workspace) as JobState;

      // Assert: all fields present after reload
      expect(reloaded.reviewers, "reviewers must survive reload").toEqual([mockReviewer]);
      expect(reloaded.noWorktree, "noWorktree must survive reload").toBe(true);
      expect(reloaded.issueNumber, "issueNumber must survive reload").toBe(42);
      expect(reloaded.synthesizedCommits, "synthesizedCommits must be reloaded from store").toContain("bootstrap-oid-abc");
      expect(reloaded.branch, "branch must be reloaded from store").toBe("feat/runner-reload-test");
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-020: LocalRuntime — worktree mode uses worktreePath as stateRoot
// ---------------------------------------------------------------------------

describe("TC-020: LocalRuntime — worktree mode uses worktreePath as stateRoot", () => {
  it(
    "reloadJobState loads from worktreePath when workspace.worktreePath is set",
    async () => {
      // Arrange: create a separate worktreeDir and seed state there
      const worktreeDir = path.join(tempDir, "worktree");
      await fs.mkdir(worktreeDir, { recursive: true });

      const JOB_ID = buildInitialState().jobId;
      const stateInWorktree = appendSynthesizedCommit(
        buildInitialState({ jobId: JOB_ID }),
        "worktree-oid-xyz",
      );

      // Seed at worktreeDir stateRoot (NOT at tempDir)
      const storeAtWorktree = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: worktreeDir });
      await storeAtWorktree.persist(stateInWorktree);

      // Also seed different state at tempDir (to confirm worktreePath takes precedence)
      const stateAtCwd = buildInitialState({ jobId: JOB_ID });
      const storeAtCwd = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir });
      await storeAtCwd.persist(stateAtCwd);

      const runtime = new LocalRuntime({
        cwd: tempDir, // this.cwd = tempDir
        githubClient: buildMockGitHubClient(),
        manager: buildMockManager(),
        spawnFn: buildMockSpawnFn(),
      });

      // workspace with worktreePath → stateRoot = worktreeDir (not this.cwd)
      const workspace: WorkspaceContext = { cwd: worktreeDir, worktreePath: worktreeDir };

      // Act: reload (RED: method does not exist until T-02)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtimeAny = runtime as any;
      expect(typeof runtimeAny.reloadJobState, "reloadJobState must be implemented (T-02)").toBe("function");
      const reloaded = await runtimeAny.reloadJobState(JOB_ID, SLUG, workspace) as JobState;

      // Assert: state comes from worktreeDir, not tempDir
      expect(
        reloaded.synthesizedCommits,
        "must load from worktreePath (workspace.worktreePath), not from cwd (T-02)",
      ).toContain("worktree-oid-xyz");
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-022: ManagedRuntime.reloadJobState is fail-closed (throws)
// ---------------------------------------------------------------------------

describe("TC-022: ManagedRuntime.reloadJobState is fail-closed (throws)", () => {
  it(
    "reloadJobState throws an Error for ManagedRuntime (managed store topology not verified)",
    async () => {
      // Build a ManagedRuntime with minimal mocks
      const sessionClient = {
        createSession: vi.fn(),
        sendUserMessage: vi.fn(),
        pollUntilComplete: vi.fn(),
        streamEvents: vi.fn(),
        getSessionUsage: vi.fn().mockResolvedValue(undefined),
        listEvents: vi.fn().mockResolvedValue([]),
        sendEvents: vi.fn().mockResolvedValue(undefined),
      };
      const githubClient = buildMockGitHubClient();
      const managed = new ManagedRuntime("/repo", sessionClient, githubClient, { owner: "o", name: "r" }, undefined, "");

      // Act: call reloadJobState (RED: method does not exist until T-03)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const managedAny = managed as any;
      expect(typeof managedAny.reloadJobState, "reloadJobState must be implemented on ManagedRuntime (T-03)").toBe("function");

      const workspace: WorkspaceContext = { cwd: "/repo" };

      // Assert: throws (managed runtime is fail-closed until store topology is verified)
      await expect(
        managedAny.reloadJobState("job-id", "some-slug", workspace),
      ).rejects.toThrow();
    },
    10000,
  );
});
