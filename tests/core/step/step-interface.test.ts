/**
 * Unit tests for Step interface implementations and StepExecutor.
 *
 * TC-009: Step implementation is stateless across invocations
 * TC-010: Step exposes agent definition without consulting global registry
 * TC-011: register_branch handler owned exclusively by ProposeStep
 * TC-012: register_branch input_schema is unchanged after refactor
 * TC-013: StepExecutor lifecycle events fire in correct order on success
 * TC-014: StepExecutor error path emits step:error and decorates exception
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ProposeStep } from "../../../src/core/step/propose.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";

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
  pollStatus?: "idle" | "timeout" | "terminated";
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
  } as PipelineDeps["client"];
}

function makeMinimalDeps(clientOpts?: Parameters<typeof makeMockSessionClient>[0]): PipelineDeps {
  return {
    client: makeMockSessionClient(clientOpts),
    config: {
      version: 1 as const,
      anthropic: { apiKey: "sk-ant-test" },
      agents: {
        propose: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
        "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
        "spec-fixer": { agentId: "agent_002", definitionHash: "sha256:xyz", lastSyncedAt: new Date().toISOString() },
      },
      environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
      github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "new-feature", title: "Test", content: "Test request content", enabled: [] },
    slug: "2026-01-01-test",
  };
}

// ---------------------------------------------------------------------------
// TC-009: Step implementation is stateless across invocations
// ---------------------------------------------------------------------------
describe("TC-009: Step implementation is stateless across invocations", () => {
  it("ProposeStep.buildMessage produces identical output on two identical calls", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const msg1 = ProposeStep.buildMessage(state, deps);
    const msg2 = ProposeStep.buildMessage(state, deps);
    expect(msg1).toBe(msg2);
  });

  it("SpecFixerStep.buildMessage produces identical output on two identical calls", () => {
    const state = { ...makeMinimalState(), steps: { "spec-review": [{ attempt: 1, sessionId: null, outcome: { verdict: "needs-fix" as const, findingsPath: "openspec/changes/test/spec-review-result-001.md", error: null }, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:00.000Z" }] } };
    const deps = makeMinimalDeps();
    const msg1 = SpecFixerStep.buildMessage(state, deps);
    const msg2 = SpecFixerStep.buildMessage(state, deps);
    expect(msg1).toBe(msg2);
  });

  it("ProposeStep.parseResult produces identical output on two identical calls", () => {
    const deps = makeMinimalDeps();
    const r1 = ProposeStep.parseResult("some content", deps);
    const r2 = ProposeStep.parseResult("some content", deps);
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// TC-010: Step exposes agent definition without consulting global registry
// ---------------------------------------------------------------------------
describe("TC-010: Step exposes agent definition directly", () => {
  it("ProposeStep.agent is accessible without global registry", () => {
    // agent object is accessible directly on the Step
    expect(ProposeStep.agent).toBeDefined();
    expect(typeof ProposeStep.agent).toBe("object");
  });

  it("SpecReviewStep.agent is accessible directly", () => {
    expect(SpecReviewStep.agent).toBeDefined();
  });

  it("SpecFixerStep.agent is accessible directly", () => {
    expect(SpecFixerStep.agent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-011: register_branch handler owned exclusively by ProposeStep
// ---------------------------------------------------------------------------
describe("TC-011: register_branch handler owned exclusively by ProposeStep", () => {
  it("ProposeStep.toolHandlers.get('register_branch') returns a handler function", () => {
    const handler = ProposeStep.toolHandlers?.get("register_branch");
    expect(typeof handler).toBe("function");
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
// TC-012: register_branch input_schema is unchanged after refactor
// ---------------------------------------------------------------------------
describe("TC-012: register_branch input_schema is unchanged after refactor", () => {
  it("input_schema matches pre-refactor definition exactly", async () => {
    const { registerBranchTool } = await import("../../../src/core/tools/register-branch.js");
    const definition = registerBranchTool.definition;

    expect(definition.name).toBe("register_branch");
    expect(definition.input_schema).toEqual({
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "The proposed branch name, e.g. feat/2026-04-27-my-feature. Must be non-empty.",
        },
      },
      required: ["branch"],
    });
  });

  it("ProposeStep.toolHandlers handler for register_branch returns the same definition as registerBranchTool", async () => {
    const { registerBranchTool } = await import("../../../src/core/tools/register-branch.js");
    // The handler in ProposeStep is exactly the registerBranchTool.handler
    const handler = ProposeStep.toolHandlers?.get("register_branch");
    expect(handler).toBe(registerBranchTool.handler);
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

    const executor = new StepExecutor(events);

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

    const executor = new StepExecutor(events);

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

    // deps with a mock SessionClient that returns timeout
    const deps = makeMinimalDeps({
      pollStatus: "timeout",
      pollError: { code: "SESSION_TIMEOUT", message: "Timed out", hint: "" },
    });

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
