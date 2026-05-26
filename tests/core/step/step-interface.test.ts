/**
 * Unit tests for Step interface implementations and StepExecutor.
 *
 * TC-009: Step implementation is stateless across invocations
 * TC-010: Step exposes agent definition without consulting global registry
 * TC-011: register_branch tool removed (D4); DesignStep toolHandlers undefined
 * TC-012: register-branch.ts is fully removed (D4)
 * TC-013: StepExecutor lifecycle events fire in correct order on success
 * TC-014: StepExecutor error path emits step:error and decorates exception
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { DesignStep } from "../../../src/core/step/design.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { createManagedAgentRunner } from "../../../src/adapter/managed-agent/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { specReviewResultPath } from "../../../src/util/paths.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "step-interface-test-"));
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

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
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

/**
 * Build a mock SessionClient that returns idle for polling steps.
 * Used by TC-013 (success path) and TC-014 (timeout path).
 */
function makeMockSessionClient(opts: {
  pollStatus?: "idle" | "terminated";
  pollError?: { code: string; message: string; hint: string };
} = {}): PipelineDeps["client"] {
  const pollStatus = opts.pollStatus ?? "idle";
  return {
    createSession: vi.fn().mockResolvedValue({ sessionId: "sess_mock" }),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({
      status: pollStatus,
      error: opts.pollError,
    }),
    streamEvents: vi.fn().mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: true,
      terminated: false,
      terminationReason: "end_turn" as const,
    }),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
  } as PipelineDeps["client"];
}

function makeMinimalDeps(clientOpts?: Parameters<typeof makeMockSessionClient>[0]): PipelineDeps {
  return {
    client: makeMockSessionClient(clientOpts),
    config: {
      version: 1 as const,
      agents: {
        design: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
        "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
        "spec-fixer": { agentId: "agent_002", definitionHash: "sha256:xyz", lastSyncedAt: new Date().toISOString() },
      },
      environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    },
    request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "Test request content", adr: false },
    slug: "2026-01-01-test",
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue("- **verdict**: approved"),
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
    storeFactory: makeStoreFactory(tempDir),
  };
}

// ---------------------------------------------------------------------------
// TC-009: Step implementation is stateless across invocations
// ---------------------------------------------------------------------------
describe("TC-009: Step implementation is stateless across invocations", () => {
  it("DesignStep.buildMessage produces identical output on two identical calls", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const msg1 = DesignStep.buildMessage(state, deps);
    const msg2 = DesignStep.buildMessage(state, deps);
    expect(msg1).toBe(msg2);
  });

  it("SpecFixerStep.buildMessage produces identical output on two identical calls", () => {
    const state = { ...makeMinimalState(), steps: { "spec-review": [{ attempt: 1, sessionId: null, outcome: { verdict: "needs-fix" as const, findingsPath: specReviewResultPath("test", 1), error: null }, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:00.000Z" }] } };
    const deps = makeMinimalDeps();
    const msg1 = SpecFixerStep.buildMessage(state, deps);
    const msg2 = SpecFixerStep.buildMessage(state, deps);
    expect(msg1).toBe(msg2);
  });

  it("DesignStep.parseResult produces identical output on two identical calls", () => {
    const deps = makeMinimalDeps();
    const r1 = DesignStep.parseResult("some content", deps);
    const r2 = DesignStep.parseResult("some content", deps);
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// TC-010: Step exposes agent definition without consulting global registry
// ---------------------------------------------------------------------------
describe("TC-010: Step exposes agent definition directly", () => {
  it("DesignStep.agent is accessible without global registry", () => {
    // agent object is accessible directly on the Step
    expect(DesignStep.agent).toBeDefined();
    expect(typeof DesignStep.agent).toBe("object");
  });

  it("SpecReviewStep.agent is accessible directly", () => {
    expect(SpecReviewStep.agent).toBeDefined();
  });

  it("SpecFixerStep.agent is accessible directly", () => {
    expect(SpecFixerStep.agent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-011: register_branch tool removed (D4); DesignStep toolHandlers undefined
// ---------------------------------------------------------------------------
describe("TC-011: register_branch tool removed (D4); DesignStep toolHandlers undefined", () => {
  it("DesignStep.toolHandlers is undefined (no tool injection needed — D4)", () => {
    expect(DesignStep.toolHandlers).toBeUndefined();
  });

  it("SpecReviewStep.toolHandlers does not contain register_branch", () => {
    const handler = SpecReviewStep.toolHandlers?.get("register_branch");
    expect(handler).toBeUndefined();
  });

  it("SpecFixerStep.toolHandlers does not contain register_branch", () => {
    const handler = SpecFixerStep.toolHandlers?.get("register_branch");
    expect(handler).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-012: register_branch tool removed — no source file imports register-branch
// ---------------------------------------------------------------------------
describe("TC-012: register-branch.ts is fully removed (D4)", () => {
  it("register-branch.ts does not exist in managed-agent adapter tools dir", async () => {
    const toolsDir = new URL("../../../src/adapter/managed-agent/tools", import.meta.url);
    const { readdir, access } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const dirPath = fileURLToPath(toolsDir);
    try {
      await access(dirPath);
    } catch {
      return; // directory doesn't exist → register-branch.ts can't exist
    }
    const files = await readdir(dirPath);
    expect(files.some((f) => f.includes("register-branch"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-013: StepExecutor lifecycle events fire in correct order on success
// ---------------------------------------------------------------------------
describe("TC-013: StepExecutor lifecycle events fire in correct order on success", () => {
  it("emits step:start → verdict:parsed → step:complete and NOT step:error on success", async () => {
    const events = new EventBus();
    const emittedEvents: string[] = [];

    events.on("step:start", () => emittedEvents.push("step:start"));
    events.on("verdict:parsed", () => emittedEvents.push("verdict:parsed"));
    events.on("step:complete", () => emittedEvents.push("step:complete"));
    events.on("step:error", () => emittedEvents.push("step:error"));

    // Create a minimal state on disk
    const jobId = "tc013-job";
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    const state = makeMinimalState();
    (state as unknown as Record<string, unknown>)["jobId"] = jobId;
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(state, null, 2),
    );
    state.jobId = jobId;

    // Mock a step that succeeds without any I/O
    const mockStep = {
      kind: "agent" as const,
      name: "spec-review",
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review" as const,
        model: "claude-sonnet-4-5",
        system: "spec-review system",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "test message",
      resultFilePath: () => null, // no result file — skips file fetch
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null, fileContent: null }),
    };

    // deps with a mock SessionClient that returns idle
    const deps = makeMinimalDeps({ pollStatus: "idle" });
    const runner = createManagedAgentRunner({
      sessionClient: deps.client!,
      githubClient: deps.githubClient,
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
    });
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    try {
      await executor.execute(mockStep, state, deps);
    } finally {
      vi.restoreAllMocks();
    }

    expect(emittedEvents).toContain("step:start");
    expect(emittedEvents).toContain("verdict:parsed");
    expect(emittedEvents).toContain("step:complete");
    expect(emittedEvents).not.toContain("step:error");

    // Order: step:start before step:complete
    const startIdx = emittedEvents.indexOf("step:start");
    const completeIdx = emittedEvents.indexOf("step:complete");
    expect(startIdx).toBeLessThan(completeIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-014: StepExecutor error path emits step:error and decorates exception
// ---------------------------------------------------------------------------
describe("TC-014: StepExecutor error path emits step:error and decorates exception", () => {
  it("emits step:error and throws with err.state when session fails", async () => {
    const events = new EventBus();
    const emittedEvents: string[] = [];

    events.on("step:start", () => emittedEvents.push("step:start"));
    events.on("step:error", () => emittedEvents.push("step:error"));
    events.on("step:complete", () => emittedEvents.push("step:complete"));

    // Create a minimal state on disk
    const jobId = "tc014-job";
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    const state = makeMinimalState();
    (state as unknown as Record<string, unknown>)["jobId"] = jobId;
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(state, null, 2),
    );
    state.jobId = jobId;

    const mockStep = {
      kind: "agent" as const,
      name: "spec-fixer",
      agent: {
        name: "specrunner-spec-fixer",
        role: "spec-fixer" as const,
        model: "claude-sonnet-4-5",
        system: "spec-fixer system",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "test message",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null, fileContent: null }),
    };

    // deps with a mock SessionClient that returns terminated (timeout removed in remove-session-timeout)
    const deps = makeMinimalDeps({
      pollStatus: "terminated",
      pollError: { code: "SESSION_TERMINATED", message: "Session terminated", hint: "" },
    });
    const runner = createManagedAgentRunner({
      sessionClient: deps.client!,
      githubClient: deps.githubClient,
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
    });
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    let thrownErr: unknown;
    try {
      await executor.execute(mockStep, state, deps);
    } catch (err) {
      thrownErr = err;
    } finally {
      vi.restoreAllMocks();
    }

    // step:error must be emitted
    expect(emittedEvents).toContain("step:error");
    expect(emittedEvents).not.toContain("step:complete");

    // Error must have .state attached
    expect(thrownErr).toBeDefined();
    expect((thrownErr as Record<string, unknown>)["state"]).toBeDefined();
  });
});
