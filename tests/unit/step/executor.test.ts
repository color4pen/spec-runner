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
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentDefinition } from "../../../src/core/agent/definition.js";
import type { Step } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

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
    anthropic: { apiKey: "sk-test" },
    agents: {
      propose: { agentId: "agent_01x", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01" },
      "spec-review": { agentId: "agent_02y", definitionHash: "sha256:def", lastSyncedAt: "2026-01-01" },
      "spec-fixer": { agentId: "agent_03z", definitionHash: "sha256:xyz", lastSyncedAt: "2026-01-01" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    ...overrides,
  };
}

function makeAgentDef(role: "propose" | "spec-review" | "spec-fixer"): AgentDefinition {
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
    const executor = new StepExecutor(events);

    const jobId = "tc030-job";
    const state = await setupJobState(jobId);

    const mockClient = makeMockSessionClient();
    const createSessionSpy = mockClient.createSession as ReturnType<typeof vi.fn>;

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
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", content: "content", enabled: [] },
      slug: "2026-01-01-test",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
      },
    };

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
    const executor = new StepExecutor(events);

    const jobId = "tc031-job";
    const state = await setupJobState(jobId);

    const mockClient = makeMockSessionClient();
    const createSessionSpy = mockClient.createSession as ReturnType<typeof vi.fn>;

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
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", content: "content", enabled: [] },
      slug: "2026-01-01-test",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
      },
    };

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
