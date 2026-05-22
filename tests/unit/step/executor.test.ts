/**
 * Unit tests for StepExecutor — agent ID resolution via step.agent.role
 * TC-030: StepExecutor uses step.agent.role not STEP_AGENT_ROLE
 * TC-031: spec-review does not use propose Agent ID
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { createManagedAgentRunner } from "../../../src/adapter/managed-agent/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentDefinition } from "../../../src/core/agent/definition.js";
import type { Step, CliStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { SpawnFn } from "../../../src/util/spawn.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

/**
 * Create a StepExecutor wired with a ManagedAgentRunner built from deps.
 * Design D1: executor delegates agent step logic to runner.
 */
function makeExecutor(events: EventBus, deps: PipelineDeps): StepExecutor {
  const runner = createManagedAgentRunner({
    sessionClient: deps.client!,
    githubClient: deps.githubClient,
    repo: { owner: "testowner", name: "testrepo" },
    githubToken: "ghp_test",
  });
  return new StepExecutor(events, runner);
}

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalState(jobId: string = "test-job-id"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    agents: {
      design: { agentId: "agent_01x", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01" },
      "spec-review": { agentId: "agent_02y", definitionHash: "sha256:def", lastSyncedAt: "2026-01-01" },
      "spec-fixer": { agentId: "agent_03z", definitionHash: "sha256:xyz", lastSyncedAt: "2026-01-01" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    ...overrides,
  };
}

function makeAgentDef(role: "design" | "spec-review" | "spec-fixer"): AgentDefinition {
  return {
    name: `specrunner-${role}`,
    role,
    model: "claude-sonnet-4-5",
    system: `system for ${role}`,
    tools: [],
  };
}

function makeMockSessionClient(): PipelineDeps["client"] {
  return {
    createSession: vi.fn().mockResolvedValue({ sessionId: "sess_mock" }),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
    streamEvents: vi.fn().mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: true,
      terminated: false,
      terminationReason: "end_turn" as const,
    }),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
  } as PipelineDeps["client"];
}

async function setupJobState(jobId: string): Promise<JobState> {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  const state = makeMinimalState(jobId);
  await fs.writeFile(
    path.join(jobsDir, `${jobId}.json`),
    JSON.stringify(state, null, 2),
  );
  return state;
}

// TC-030: StepExecutor uses step.agent.role not STEP_AGENT_ROLE
describe("TC-030: StepExecutor resolves agent ID via step.agent.role", () => {
  it("uses spec-review role to lookup config.agents['spec-review'].agentId", async () => {
    const events = new EventBus();

    const jobId = "tc030-job";
    const state = await setupJobState(jobId);

    const mockClient = makeMockSessionClient();
    const createSessionSpy = mockClient!.createSession as ReturnType<typeof vi.fn>;

    const specReviewStep: Step = {
      kind: "agent",
      name: "spec-review",
      agent: makeAgentDef("spec-review"),
      toolHandlers: undefined,
      buildMessage: () => "review this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      client: mockClient,
      config,

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "2026-01-01-test",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    await executor.execute(specReviewStep, state, deps);

    // createSession should have been called with "agent_02y" (spec-review ID)
    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent_02y" }),
    );
  });

  it("STEP_AGENT_ROLE constant does not exist in executor module", async () => {
    // Verify via dynamic import that STEP_AGENT_ROLE is not exported
    const executorModule = await import("../../../src/core/step/executor.js");
    expect((executorModule as Record<string, unknown>)["STEP_AGENT_ROLE"]).toBeUndefined();
  });
});

// TC-031: spec-review does NOT use propose Agent ID
describe("TC-031: spec-review Step does not use propose Agent ID", () => {
  it("resolves agent_02y for spec-review, not agent_01x (propose)", async () => {
    const events = new EventBus();

    const jobId = "tc031-job";
    const state = await setupJobState(jobId);

    const mockClient = makeMockSessionClient();
    const createSessionSpy = mockClient!.createSession as ReturnType<typeof vi.fn>;

    const specReviewStep: Step = {
      kind: "agent",
      name: "spec-review",
      agent: makeAgentDef("spec-review"),
      toolHandlers: undefined,
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      client: mockClient,
      config,

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "2026-01-01-test",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    await executor.execute(specReviewStep, state, deps);

    // Must use spec-review's agent ID, not propose's
    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent_02y" }),
    );
    expect(createSessionSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent_01x" }),
    );
  });
});

// Regression for workspace-mount-and-propose-boundary:
// polling-style steps must mount the branch propose pushed to, not main.
describe("StepExecutor — polling-style step propagates state.branch to createSession", () => {
  it("passes branch: state.branch to client.createSession", async () => {
    const events = new EventBus();

    const jobId = "branch-propagate-job";
    const state = await setupJobState(jobId);
    // setupJobState seeds state.branch = "feat/test"

    const mockClient = makeMockSessionClient();
    const createSessionSpy = mockClient!.createSession as ReturnType<typeof vi.fn>;

    const step: Step = {
      kind: "agent",
      name: "spec-review",
      agent: makeAgentDef("spec-review"),
      toolHandlers: undefined,
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const deps: PipelineDeps = {
      client: mockClient,
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    await executor.execute(step, state, deps);

    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "feat/test" }),
    );
  });

  it("fails fast with BRANCH_NOT_SET when state.branch is null", async () => {
    const events = new EventBus();

    const jobId = "branch-missing-job";
    const state = await setupJobState(jobId);
    state.branch = null;

    const mockClient = makeMockSessionClient();
    const createSessionSpy = mockClient!.createSession as ReturnType<typeof vi.fn>;

    const step: Step = {
      kind: "agent",
      name: "spec-review",
      agent: makeAgentDef("spec-review"),
      toolHandlers: undefined,
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const deps: PipelineDeps = {
      client: mockClient,
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: "BRANCH_NOT_SET",
    });
    expect(createSessionSpy).not.toHaveBeenCalled();
  });
});

// requiresCommit: branch HEAD must advance during the session
describe("StepExecutor — requiresCommit verifies branch HEAD advanced", () => {
  it("throws NO_COMMIT_DETECTED when pre and post HEAD SHAs match", async () => {
    const events = new EventBus();

    const state = await setupJobState("requires-commit-no-advance");
    const mockClient = makeMockSessionClient();

    const step: Step = {
      kind: "agent",
      name: "spec-fixer",
      agent: makeAgentDef("spec-fixer"),
      toolHandlers: undefined,
      requiresCommit: true,
      buildMessage: () => "fix",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const sameSha = "0123456789abcdef0123456789abcdef01234567";
    const getRefShaSpy = vi
      .fn<(owner: string, repo: string, branch: string) => Promise<string | null>>()
      .mockResolvedValue(sameSha);
    const deps: PipelineDeps = {
      client: mockClient,
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: getRefShaSpy,
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: "NO_COMMIT_DETECTED",
    });
    // Called once before the session and once after
    expect(getRefShaSpy).toHaveBeenCalledTimes(2);

    // Regression guard for review finding #1: when NO_COMMIT_DETECTED fires,
    // history must NOT contain a `${step.name}-verdict` ok event.
    // The HEAD verification runs BEFORE the verdict append so failed
    // steps never leave a misleading "verdict" marker for downstream
    // consumers (forensics, resume, status aggregation).
    const stateFile = path.join(tempDir, "specrunner", "jobs", "requires-commit-no-advance.json");
    const persistedState = JSON.parse(await fs.readFile(stateFile, "utf-8")) as JobState;
    const completedOkEvents = persistedState.history.filter(
      (h) => h.step === "spec-fixer-verdict" && h.status === "ok",
    );
    expect(completedOkEvents).toHaveLength(0);
    // Executor adds a ${step.name}-failed history entry on error for observability
    const noCommitEvents = persistedState.history.filter(
      (h) => h.step === "spec-fixer-failed" && h.status === "error",
    );
    expect(noCommitEvents).toHaveLength(1);
  });

  it("passes when pre and post HEAD SHAs differ (branch advanced)", async () => {
    const events = new EventBus();

    const state = await setupJobState("requires-commit-advanced");
    const mockClient = makeMockSessionClient();

    const step: Step = {
      kind: "agent",
      name: "spec-fixer",
      agent: makeAgentDef("spec-fixer"),
      toolHandlers: undefined,
      requiresCommit: true,
      buildMessage: () => "fix",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const getRefShaSpy = vi
      .fn<(owner: string, repo: string, branch: string) => Promise<string | null>>()
      .mockResolvedValueOnce("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
      .mockResolvedValueOnce("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const deps: PipelineDeps = {
      client: mockClient,
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: getRefShaSpy,
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    await expect(executor.execute(step, state, deps)).resolves.toBeDefined();
    expect(getRefShaSpy).toHaveBeenCalledTimes(2);
  });

  it("does not call getRefSha when requiresCommit is false / undefined", async () => {
    const events = new EventBus();

    const state = await setupJobState("requires-commit-disabled");
    const mockClient = makeMockSessionClient();

    const step: Step = {
      kind: "agent",
      name: "spec-review",
      agent: makeAgentDef("spec-review"),
      toolHandlers: undefined,
      // requiresCommit omitted (default falsy)
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const getRefShaSpy = vi
      .fn<(owner: string, repo: string, branch: string) => Promise<string | null>>()
      .mockResolvedValue("anything");
    const deps: PipelineDeps = {
      client: mockClient,
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: getRefShaSpy,
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    await executor.execute(step, state, deps);
    expect(getRefShaSpy).not.toHaveBeenCalled();
  });

  it("does not throw when post-session getRefSha returns null (transient / branch absent)", async () => {
    const events = new EventBus();

    const state = await setupJobState("requires-commit-transient");
    const mockClient = makeMockSessionClient();

    const step: Step = {
      kind: "agent",
      name: "spec-fixer",
      agent: makeAgentDef("spec-fixer"),
      toolHandlers: undefined,
      requiresCommit: true,
      buildMessage: () => "fix",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    // pre returns a SHA; post returns null (branch was removed or transient API miss)
    const getRefShaSpy = vi
      .fn<(owner: string, repo: string, branch: string) => Promise<string | null>>()
      .mockResolvedValueOnce("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
      .mockResolvedValueOnce(null);
    const deps: PipelineDeps = {
      client: mockClient,
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: getRefShaSpy,
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const executor = makeExecutor(events, deps);
    // Null post-SHA falls through (no NO_COMMIT_DETECTED) — only equal SHAs trigger
    await expect(executor.execute(step, state, deps)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-007 to TC-015: projectContext injection into AgentRunContext
// ---------------------------------------------------------------------------

describe("TC-007 to TC-010: allowlist steps set ctx.projectContext from specrunner/project.md", () => {
  let cwdWithProjectMd: string;
  const PROJECT_MD_CONTENT = "# Project Context\nStack: TypeScript\n";

  beforeEach(async () => {
    cwdWithProjectMd = await fs.mkdtemp(path.join(os.tmpdir(), "executor-project-ctx-"));
    await fs.mkdir(path.join(cwdWithProjectMd, "specrunner"), { recursive: true });
    await fs.writeFile(
      path.join(cwdWithProjectMd, "specrunner", "project.md"),
      PROJECT_MD_CONTENT,
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(cwdWithProjectMd, { recursive: true, force: true });
  });

  /** Minimal AgentRunner mock that captures ctx and returns success. */
  function makeCapturingRunner(): {
    runner: AgentRunner;
    captured: { ctx: AgentRunContext | undefined };
  } {
    const captured: { ctx: AgentRunContext | undefined } = { ctx: undefined };
    const runner: AgentRunner = {
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        captured.ctx = ctx;
        return { completionReason: "success", resultContent: null };
      },
    };
    return { runner, captured };
  }

  function makeStepNamed(name: string): Step {
    return {
      kind: "agent" as const,
      name,
      agent: {
        name: `specrunner-${name}`,
        role: name as "design",
        model: "claude-sonnet-4-5",
        system: `system for ${name}`,
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => `message for ${name}`,
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };
  }

  function makeDepsWithCwd(cwd: string): PipelineDeps {
    return {
      config: makeConfig(),

      request: {
        type: "feature",
        title: "Test",
        slug: "test-slug",
        baseBranch: "main",
        content: "content",
        enabled: [],
        adr: false,
      },
      slug: "test-slug",
      cwd,
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };
  }

  const ALLOWLIST_STEPS = ["design", "spec-review", "implementer", "code-review"] as const;

  ALLOWLIST_STEPS.forEach((stepName) => {
    it(`step '${stepName}' → ctx.projectContext is set from specrunner/project.md`, async () => {
      const { runner, captured } = makeCapturingRunner();
      const events = new EventBus();
      const executor = new StepExecutor(events, runner);
      const state = makeMinimalState(`tc-allowlist-${stepName}`);
      const deps = makeDepsWithCwd(cwdWithProjectMd);
      // needsProjectContext: true is required for executor to inject projectContext
      const step = { ...makeStepNamed(stepName), needsProjectContext: true as const };

      await executor.execute(step, state, deps);

      expect(captured.ctx).toBeDefined();
      expect(captured.ctx!.projectContext).toBe(PROJECT_MD_CONTENT);
    });
  });
});

describe("TC-011 to TC-014: non-allowlist steps — ctx.projectContext is undefined", () => {
  let cwdWithProjectMd: string;
  const PROJECT_MD_CONTENT = "# Project Context\nStack: TypeScript\n";

  beforeEach(async () => {
    cwdWithProjectMd = await fs.mkdtemp(path.join(os.tmpdir(), "executor-project-ctx-"));
    await fs.mkdir(path.join(cwdWithProjectMd, "specrunner"), { recursive: true });
    await fs.writeFile(
      path.join(cwdWithProjectMd, "specrunner", "project.md"),
      PROJECT_MD_CONTENT,
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(cwdWithProjectMd, { recursive: true, force: true });
  });

  function makeCapturingRunner(): {
    runner: AgentRunner;
    captured: { ctx: AgentRunContext | undefined };
  } {
    const captured: { ctx: AgentRunContext | undefined } = { ctx: undefined };
    const runner: AgentRunner = {
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        captured.ctx = ctx;
        return { completionReason: "success", resultContent: null };
      },
    };
    return { runner, captured };
  }

  function makeStepNamed(name: string): Step {
    return {
      kind: "agent" as const,
      name,
      agent: {
        name: `specrunner-${name}`,
        role: name as "design",
        model: "claude-sonnet-4-5",
        system: `system for ${name}`,
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => `message for ${name}`,
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };
  }

  function makeDepsWithCwd(cwd: string): PipelineDeps {
    return {
      config: makeConfig(),

      request: {
        type: "feature",
        title: "Test",
        slug: "test-slug",
        baseBranch: "main",
        content: "content",
        enabled: [],
        adr: false,
      },
      slug: "test-slug",
      cwd,
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };
  }

  const NON_ALLOWLIST_STEPS = ["spec-fixer", "build-fixer", "code-fixer", "test-case-gen"] as const;

  NON_ALLOWLIST_STEPS.forEach((stepName) => {
    it(`step '${stepName}' → ctx.projectContext is undefined (file exists but step excluded)`, async () => {
      const { runner, captured } = makeCapturingRunner();
      const events = new EventBus();
      const executor = new StepExecutor(events, runner);
      const state = makeMinimalState(`tc-nonlist-${stepName}`);
      const deps = makeDepsWithCwd(cwdWithProjectMd);
      const step = makeStepNamed(stepName);

      await executor.execute(step, state, deps);

      expect(captured.ctx).toBeDefined();
      expect(captured.ctx!.projectContext).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// TC-EX-01, TC-EX-02, TC-EX-03: resumeSessionId injection for fixer steps
// ---------------------------------------------------------------------------

describe("TC-EX: StepExecutor injects resumeSessionId for fixer steps", () => {
  function makeCapturingRunner(): {
    runner: AgentRunner;
    captured: { ctx: AgentRunContext | undefined };
  } {
    const captured: { ctx: AgentRunContext | undefined } = { ctx: undefined };
    const runner: AgentRunner = {
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        captured.ctx = ctx;
        return { completionReason: "success", resultContent: null };
      },
    };
    return { runner, captured };
  }

  function makeFixerLikeStep(name: string): Step {
    return {
      kind: "agent" as const,
      name,
      agent: {
        name: `specrunner-${name}`,
        role: name as "design",
        model: "claude-sonnet-4-5",
        system: `system for ${name}`,
        tools: [],
      },
      toolHandlers: undefined,
      completionVerdict: "approved" as const,
      buildMessage: () => `fix message for ${name}`,
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };
  }

  function makeFixerTestDeps(): PipelineDeps {
    return {
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };
  }

  // TC-EX-01: spec-fixer with previous sessionId → ctx.resumeSessionId is set
  it("TC-EX-01: spec-fixer with previous sessionId → ctx.resumeSessionId equals previous sessionId", async () => {
    const { runner, captured } = makeCapturingRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    const state = makeMinimalState("tc-ex-01");
    state.steps = {
      "spec-fixer": [
        {
          attempt: 1,
          sessionId: "sess-prev-001",
          outcome: { verdict: "approved", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const step = makeFixerLikeStep("spec-fixer");
    await executor.execute(step, state, makeFixerTestDeps());

    expect(captured.ctx).toBeDefined();
    expect(captured.ctx!.resumeSessionId).toBe("sess-prev-001");
  });

  // TC-EX-02: spec-fixer first run (no previous steps) → resumeSessionId is undefined
  it("TC-EX-02: spec-fixer first run (no previous steps) → ctx.resumeSessionId is undefined", async () => {
    const { runner, captured } = makeCapturingRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    const state = makeMinimalState("tc-ex-02");
    // steps is empty (default) — first run, no previous sessionId

    const step = makeFixerLikeStep("spec-fixer");
    await executor.execute(step, state, makeFixerTestDeps());

    expect(captured.ctx).toBeDefined();
    expect(captured.ctx!.resumeSessionId).toBeUndefined();
  });

  // TC-EX-03: non-fixer step → resumeSessionId is always undefined (scope boundary)
  it("TC-EX-03: non-fixer step (spec-review) → ctx.resumeSessionId is always undefined", async () => {
    const { runner, captured } = makeCapturingRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    const state = makeMinimalState("tc-ex-03");
    // spec-fixer has a previous session, but spec-review must NOT inherit it
    state.steps = {
      "spec-fixer": [
        {
          attempt: 1,
          sessionId: "sess-prev-001",
          outcome: { verdict: "approved", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const step = makeFixerLikeStep("spec-review");
    await executor.execute(step, state, makeFixerTestDeps());

    expect(captured.ctx).toBeDefined();
    expect(captured.ctx!.resumeSessionId).toBeUndefined();
  });
});

describe("TC-015: specrunner/project.md not found — no error, ctx.projectContext is undefined", () => {
  function makeCapturingRunner(): {
    runner: AgentRunner;
    captured: { ctx: AgentRunContext | undefined };
  } {
    const captured: { ctx: AgentRunContext | undefined } = { ctx: undefined };
    const runner: AgentRunner = {
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        captured.ctx = ctx;
        return { completionReason: "success", resultContent: null };
      },
    };
    return { runner, captured };
  }

  it("propose step with missing specrunner/project.md → no exception, projectContext undefined", async () => {
    const { runner, captured } = makeCapturingRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    // Use a temp dir without specrunner/project.md
    const cwdWithout = await fs.mkdtemp(path.join(os.tmpdir(), "executor-no-ctx-"));
    try {
      const state = makeMinimalState("tc015-no-project-md");
      const deps: PipelineDeps = {
        config: makeConfig(),
  
        request: {
          type: "feature",
          title: "Test",
          slug: "test-slug",
          baseBranch: "main",
          content: "content",
          enabled: [],
          adr: false,
        },
        slug: "test-slug",
        cwd: cwdWithout,
        githubClient: {
          verifyBranch: vi.fn().mockResolvedValue(true),
          getRawFile: vi.fn().mockResolvedValue(null),
          verifyPath: vi.fn().mockResolvedValue(true),
          verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
          getRefSha: vi.fn().mockResolvedValue(null),
          listPullRequests: vi.fn().mockResolvedValue([]),
          createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
          getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
          mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
        },
        owner: "user",
        repo: "repo",
        spawn: noopSpawn,
      };

      const step: Step = {
        kind: "agent" as const,
        name: "design",
        agent: { name: "specrunner-design", role: "design", model: "claude-sonnet-4-5", system: "design", tools: [] },
        toolHandlers: undefined,
        buildMessage: () => "design message",
        resultFilePath: () => null,
        parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
      };

      // Must not throw even when specrunner/project.md is absent
      await expect(executor.execute(step, state, deps)).resolves.toBeDefined();

      expect(captured.ctx).toBeDefined();
      expect(captured.ctx!.projectContext).toBeUndefined();
    } finally {
      await fs.rm(cwdWithout, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// TC-05: runAgentStep — startedAt captured before runner.run(), endedAt after
// TC-06: runCliStep — startedAt captured before step.run(), endedAt after
// ---------------------------------------------------------------------------

describe("TC-05: runAgentStep — StepRun.startedAt < StepRun.endedAt (success path)", () => {
  it("records startedAt strictly before endedAt when runner.run() has non-zero duration", async () => {
    const events = new EventBus();

    // Runner that introduces a real delay so the two Date.toISOString() calls differ
    const delayMs = 15;
    const delayedRunner: AgentRunner = {
      async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        return { completionReason: "success", resultContent: null };
      },
    };
    const executor = new StepExecutor(events, delayedRunner);

    const jobId = "tc05-agent-timestamp-job";
    const state = await setupJobState(jobId);

    const step: Step = {
      kind: "agent" as const,
      name: "spec-review",
      agent: makeAgentDef("spec-review"),
      toolHandlers: undefined,
      completionVerdict: "approved" as const,
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const deps: PipelineDeps = {
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "tc05-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "tc05-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["spec-review"];
    expect(stepRuns).toBeDefined();
    expect(stepRuns!.length).toBeGreaterThan(0);

    const lastRun = stepRuns![stepRuns!.length - 1]!;
    expect(lastRun.startedAt).toBeDefined();
    expect(lastRun.endedAt).toBeDefined();
    // Core invariant: startedAt must be strictly before endedAt
    expect(lastRun.startedAt < lastRun.endedAt).toBe(true);
  });
});

describe("TC-06: runCliStep — StepRun.startedAt < StepRun.endedAt (success path)", () => {
  it("records startedAt strictly before endedAt when step.run() has non-zero duration", async () => {
    const events = new EventBus();

    // CLI step does not use the runner, but StepExecutor requires one
    const noopRunner: AgentRunner = {
      async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
        return { completionReason: "success", resultContent: null };
      },
    };
    const executor = new StepExecutor(events, noopRunner);

    const jobId = "tc06-cli-timestamp-job";
    const state = await setupJobState(jobId);

    const delayMs = 15;
    const cliStep: CliStep = {
      kind: "cli" as const,
      name: "verification",
      async run(_state, _deps): Promise<void> {
        // Simulate work so the before/after timestamps differ
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      },
      resultFilePath(_state, _deps): string {
        return "specrunner/changes/tc06-slug/verification-result.md";
      },
      parseResult(_content, _deps) {
        return { verdict: "passed" as const, findingsPath: null };
      },
    };

    const deps: PipelineDeps = {
      config: makeConfig(),

      request: { type: "feature", title: "Test", slug: "tc06-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "tc06-slug",
      cwd: tempDir,
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };

    const resultState = await executor.execute(cliStep, state, deps);

    const stepRuns = resultState.steps?.["verification"];
    expect(stepRuns).toBeDefined();
    expect(stepRuns!.length).toBeGreaterThan(0);

    const lastRun = stepRuns![stepRuns!.length - 1]!;
    expect(lastRun.startedAt).toBeDefined();
    expect(lastRun.endedAt).toBeDefined();
    // Core invariant: startedAt must be strictly before endedAt
    expect(lastRun.startedAt < lastRun.endedAt).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-05 / TC-06: executor が step.followUpPrompt を ctx.followUpPrompt に転記する
// ---------------------------------------------------------------------------

describe("TC-05 / TC-06: executor が step.followUpPrompt を ctx.followUpPrompt に転記する", () => {
  function makeCapturingFollowUpRunner(): {
    runner: AgentRunner;
    captured: { ctx: AgentRunContext | undefined };
  } {
    const captured: { ctx: AgentRunContext | undefined } = { ctx: undefined };
    const runner: AgentRunner = {
      run: vi.fn().mockImplementation((ctx: AgentRunContext) => {
        captured.ctx = ctx;
        return Promise.resolve({ completionReason: "success" as const, resultContent: null });
      }),
    };
    return { runner, captured };
  }

  function makeFollowUpDeps(): PipelineDeps {
    return {
      config: makeConfig(),
      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
      slug: "test-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
        getRefSha: vi.fn().mockResolvedValue(null),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      },
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
    };
  }

  it("TC-05: step.followUpPrompt が ctx.followUpPrompt に転記される", async () => {
    const { runner, captured } = makeCapturingFollowUpRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    const step: Step = {
      kind: "agent" as const,
      name: "design",
      agent: makeAgentDef("design"),
      toolHandlers: undefined,
      followUpPrompt: "fix format violations",
      buildMessage: () => "design message",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const state = makeMinimalState("tc-followup-05");
    await executor.execute(step, state, makeFollowUpDeps());

    expect(captured.ctx).toBeDefined();
    expect(captured.ctx!.followUpPrompt).toBe("fix format violations");
  });

  it("TC-06: followUpPrompt 未設定の step では ctx.followUpPrompt が undefined", async () => {
    const { runner, captured } = makeCapturingFollowUpRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    const step: Step = {
      kind: "agent" as const,
      name: "design",
      agent: makeAgentDef("design"),
      toolHandlers: undefined,
      // followUpPrompt intentionally absent
      buildMessage: () => "design message",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const state = makeMinimalState("tc-followup-06");
    await executor.execute(step, state, makeFollowUpDeps());

    expect(captured.ctx).toBeDefined();
    expect(captured.ctx!.followUpPrompt).toBeUndefined();
  });

  it("TC-06-new: getFollowUpPrompt が定義されている場合、静的 followUpPrompt より優先される", async () => {
    const { runner, captured } = makeCapturingFollowUpRunner();
    const executor = new StepExecutor(new EventBus(), runner);

    const step: Step = {
      kind: "agent" as const,
      name: "design",
      agent: makeAgentDef("design"),
      toolHandlers: undefined,
      followUpPrompt: "static-value",           // 静的も設定
      getFollowUpPrompt: () => "dynamic-value", // 動的が優先されるべき
      buildMessage: () => "msg",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const state = makeMinimalState("tc-06-new");
    await executor.execute(step, state, makeFollowUpDeps());

    expect(captured.ctx).toBeDefined();
    expect(captured.ctx!.followUpPrompt).toBe("dynamic-value");
  });

  it("TC-07: getFollowUpPrompt が undefined を返すと静的 followUpPrompt にフォールバックする", async () => {
    const { runner, captured } = makeCapturingFollowUpRunner();
    const executor = new StepExecutor(new EventBus(), runner);

    const step: Step = {
      kind: "agent" as const,
      name: "design",
      agent: makeAgentDef("design"),
      toolHandlers: undefined,
      followUpPrompt: "static-value",      // 静的が設定されている
      getFollowUpPrompt: () => undefined,  // 動的が undefined を返す → フォールバック
      buildMessage: () => "msg",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const state = makeMinimalState("tc-07");
    await executor.execute(step, state, makeFollowUpDeps());

    expect(captured.ctx).toBeDefined();
    expect(captured.ctx!.followUpPrompt).toBe("static-value");
  });
});
