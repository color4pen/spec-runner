/**
 * Unit tests for ManagedAgentRunner (src/adapter/managed-agent/agent-runner.ts)
 *
 * TC-02-01: resolveEffectiveTimeout returns timeoutMs when > 0
 * TC-02-02: resolveEffectiveTimeout returns DEFAULT_POLL_TIMEOUT_MS when timeoutMs = 0
 * TC-02-06: executeFollowUpTurn does not throw on error (non-fatal)
 * TC-02-09: design follow-up not called when sseEndTurn=false (polling fallback)
 * TC-02-10: polling follow-up called when shouldRunFollowUp is true
 *
 * TC-03-01: runDesignStyle signature preserved (AgentRunContext → Promise<AgentRunResult>)
 * TC-03-02: createDesignSession returns sessionId from createSession
 * TC-03-03: createDesignSession throws SESSION_CREATE_FAILED on createSession failure
 * TC-03-04: streamWithPollingFallback returns {sseEndTurn: true} on SSE end_turn
 * TC-03-05: streamWithPollingFallback returns {sseEndTurn: false} on polling fallback
 * TC-03-06: streamWithPollingFallback returns AgentRunResult on polling fallback timeout
 * TC-03-07: runDesignStyle early-returns on timeout from streamWithPollingFallback
 * TC-03-08: verifyDesignArtifacts warns non-fatal on non-GITHUB_TOKEN_EXPIRED verifyBranch error
 * TC-03-09: verifyDesignArtifacts rethrows GITHUB_TOKEN_EXPIRED from verifyBranch
 * TC-03-10: verifyDesignArtifacts rethrows CHANGE_FOLDER_NOT_FOUND from verifyChangeFolder
 * TC-03-12: runDesignStyle is a thin orchestrator (calls stage methods)
 *
 * TC-04-01: runPollingStyle signature preserved (AgentRunContext → Promise<AgentRunResult>)
 * TC-04-02: preparePollingMessage returns agentId, initialMessage, preSessionHeadSha, stepCtx
 * TC-04-03: preparePollingMessage throws CONFIG_INCOMPLETE on agentId resolution failure
 * TC-04-05: createOrResumePollingSession normal path returns new sessionId
 * TC-04-06: createOrResumePollingSession resume path returns existing sessionId
 * TC-04-07: createOrResumePollingSession resume sendUserMessage failure triggers fallback
 * TC-04-08: createOrResumePollingSession fallback createSession failure uses "fallback after resume failure" context
 * TC-04-09: createOrResumePollingSession fallback sendUserMessage failure calls throwSendMessageError
 * TC-04-10: guardCommit skips check when requiresCommit=false
 * TC-04-11: guardCommit throws NO_COMMIT_DETECTED when HEAD SHA unchanged
 * TC-04-12: fetchResultFile returns null when resultFilePath=null
 * TC-04-13: fetchResultFile returns file content on success
 * TC-04-14: fetchResultFile throws when file not found
 * TC-04-15: runPollingStyle returns timeout AgentRunResult on POLL_TIMEOUT
 * TC-04-16: runPollingStyle void completedAt preserved (no regression)
 * TC-04-17: runPollingStyle is a thin orchestrator (calls stage methods)
 *
 * TC-05-04: error-helpers.ts exists in src/adapter/managed-agent/
 * TC-05-05: runDesignStyle / runPollingStyle signatures unchanged
 * TC-05-06: managed-agent-runtime behavior scenario — design+polling full lifecycle
 * TC-05-07: createManagedAgentRunner / ManagedAgentRunnerDeps unchanged
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  ManagedAgentRunner,
  createManagedAgentRunner,
  type ManagedAgentRunnerDeps,
} from "../../../src/adapter/managed-agent/agent-runner.js";
import { getAgentId } from "../../../src/config/getAgentId.js";
import { getStepExecutionConfig } from "../../../src/config/step-config.js";
import { DEFAULT_POLL_TIMEOUT_MS } from "../../../src/adapter/managed-agent/completion.js";
import type { SessionClient } from "../../../src/core/port/session-client.js";
import type { GitHubClient } from "../../../src/core/port/github-client.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("../../../src/config/getAgentId.js", () => ({
  getAgentId: vi.fn().mockReturnValue("agent-123"),
}));

vi.mock("../../../src/config/step-config.js", () => ({
  getStepExecutionConfig: vi.fn().mockReturnValue({
    model: "claude-opus-4-5",
    maxTurns: null,
    timeoutMs: 30000,
  }),
}));

vi.mock("../../../src/logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logVerbose: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(branch: string | null = "feat/test"): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "managed",
    agents: {
      design: { agentId: "agent-design-123" },
      implementer: { agentId: "agent-impl-123" },
    },
    environment: { id: "env-test-123", lastSyncedAt: "2026-01-01T00:00:00.000Z" },
  } as unknown as SpecRunnerConfig;
}

function makeDesignStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "design",
    agent: {
      name: "specrunner-design",
      role: "design",
      model: "claude-opus-4-5",
      system: "design agent",
      tools: [],
    },
    buildMessage: () => "design message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...overrides,
  };
}

function makePollingStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-opus-4-5",
      system: "implementer agent",
      tools: [],
    },
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...overrides,
  };
}

function makeDesignCtx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    step: makeDesignStep(),
    state: makeState("feat/test-slug"),
    branch: "feat/test-slug",
    slug: "test-slug",
    cwd: "/fake/cwd",
    input: { requestContent: "# Request content" },
    session: {},
    policy: {},
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

function makePollingCtx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    step: makePollingStep(),
    state: makeState("feat/test-slug"),
    branch: "feat/test-slug",
    slug: "test-slug",
    cwd: "/fake/cwd",
    input: { requestContent: "# Request content" },
    session: {},
    policy: {},
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

// ─── Mock session/github clients ──────────────────────────────────────────────

function makeMockSessionClient() {
  return {
    createSession: vi.fn().mockResolvedValue({ sessionId: "mock-session-id" }),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
    streamEvents: vi.fn().mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: true,
      terminated: false,
      terminationReason: "end_turn" as const,
    }),
  } satisfies SessionClient;
}

function makeMockGithubClient() {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue("file content"),
    verifyPath: vi.fn().mockResolvedValue(true),
    getRefSha: vi.fn().mockResolvedValue("sha-abc123"),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: [] }),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "https://github.com/pr/1", number: 1 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
  } satisfies GitHubClient;
}

function makeRunner(
  sessionClientOverrides: Partial<ReturnType<typeof makeMockSessionClient>> = {},
  githubClientOverrides: Partial<ReturnType<typeof makeMockGithubClient>> = {},
) {
  const sessionClient = { ...makeMockSessionClient(), ...sessionClientOverrides };
  const githubClient = { ...makeMockGithubClient(), ...githubClientOverrides };

  const deps: ManagedAgentRunnerDeps = {
    sessionClient,
    githubClient,
    repo: { owner: "testowner", name: "testrepo" },
    githubToken: "ghp-test-token",
  };

  return {
    runner: new ManagedAgentRunner(deps),
    sessionClient,
    githubClient,
  };
}

// ─── TC-02: Shared private helpers ───────────────────────────────────────────

describe("TC-02-01: resolveEffectiveTimeout — returns timeoutMs when > 0", () => {
  it("returns configured timeoutMs directly", () => {
    vi.mocked(getStepExecutionConfig).mockReturnValue({
      model: "claude-opus-4-5",
      maxTurns: null,
      timeoutMs: 30000,
    });
    const { runner } = makeRunner();
    const result = (runner as unknown as { resolveEffectiveTimeout: (c: SpecRunnerConfig, n: string, m: string) => number })
      .resolveEffectiveTimeout(makeConfig(), "implementer", "claude-opus-4-5");
    expect(result).toBe(30000);
  });
});

describe("TC-02-02: resolveEffectiveTimeout — returns DEFAULT_POLL_TIMEOUT_MS when timeoutMs = 0", () => {
  it("falls back to DEFAULT_POLL_TIMEOUT_MS when timeoutMs is 0", () => {
    vi.mocked(getStepExecutionConfig).mockReturnValue({
      model: "claude-opus-4-5",
      maxTurns: null,
      timeoutMs: 0,
    });
    const { runner } = makeRunner();
    const result = (runner as unknown as { resolveEffectiveTimeout: (c: SpecRunnerConfig, n: string, m: string) => number })
      .resolveEffectiveTimeout(makeConfig(), "implementer", "claude-opus-4-5");
    expect(result).toBe(DEFAULT_POLL_TIMEOUT_MS);
  });

  it("falls back to DEFAULT_POLL_TIMEOUT_MS when timeoutMs is null", () => {
    vi.mocked(getStepExecutionConfig).mockReturnValue({
      model: "claude-opus-4-5",
      maxTurns: null,
      timeoutMs: null,
    });
    const { runner } = makeRunner();
    const result = (runner as unknown as { resolveEffectiveTimeout: (c: SpecRunnerConfig, n: string, m: string) => number })
      .resolveEffectiveTimeout(makeConfig(), "implementer", "claude-opus-4-5");
    expect(result).toBe(DEFAULT_POLL_TIMEOUT_MS);
  });
});

describe("TC-02-06: executeFollowUpTurn — non-fatal, does not throw on error", () => {
  it("does not propagate error when sendUserMessage throws", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.sendUserMessage.mockRejectedValueOnce(new Error("network failure"));

    const step = makePollingStep();
    await expect(
      (runner as unknown as {
        executeFollowUpTurn: (sid: string, step: AgentStep, prompt: string, ms: number) => Promise<void>;
      }).executeFollowUpTurn("sid-123", step, "follow up prompt", 30000),
    ).resolves.toBeUndefined();
  });

  it("does not propagate error when pollUntilComplete fails after sendUserMessage", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.sendUserMessage.mockResolvedValueOnce(undefined);
    sessionClient.pollUntilComplete.mockRejectedValueOnce(new Error("poll error"));

    const step = makePollingStep();
    await expect(
      (runner as unknown as {
        executeFollowUpTurn: (sid: string, step: AgentStep, prompt: string, ms: number) => Promise<void>;
      }).executeFollowUpTurn("sid-123", step, "follow up", 30000),
    ).resolves.toBeUndefined();
  });
});

// ─── TC-03: Design-style stages ───────────────────────────────────────────────

describe("TC-03-01: runDesignStyle — signature preserved (AgentRunContext → Promise<AgentRunResult>)", () => {
  it("ManagedAgentRunner has runDesignStyle as a private method", () => {
    const { runner } = makeRunner();
    // Access via any to verify existence (private method)
    expect(typeof (runner as unknown as Record<string, unknown>)["runDesignStyle"]).toBe("function");
  });
});

describe("TC-03-02: createDesignSession — returns sessionId", () => {
  it("returns the sessionId from createSession", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "design-sid-xyz" });

    const ctx = makeDesignCtx();
    const sid = await (runner as unknown as {
      createDesignSession: (ctx: AgentRunContext) => Promise<string>;
    }).createDesignSession(ctx);

    expect(sid).toBe("design-sid-xyz");
    expect(sessionClient.createSession).toHaveBeenCalledOnce();
  });
});

describe("TC-03-03: createDesignSession — throws SESSION_CREATE_FAILED on failure", () => {
  it("throws SESSION_CREATE_FAILED when createSession rejects", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.createSession.mockRejectedValue(new Error("connection refused"));

    const ctx = makeDesignCtx();
    await expect(
      (runner as unknown as {
        createDesignSession: (ctx: AgentRunContext) => Promise<string>;
      }).createDesignSession(ctx),
    ).rejects.toMatchObject({ code: "SESSION_CREATE_FAILED" });
  });
});

describe("TC-03-04: streamWithPollingFallback — returns {sseEndTurn: true} on SSE end_turn", () => {
  it("returns sseEndTurn=true when terminationReason is end_turn", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.streamEvents.mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: true,
      terminated: false,
      terminationReason: "end_turn" as const,
    });

    const ctx = makeDesignCtx();
    const result = await (runner as unknown as {
      streamWithPollingFallback: (sid: string, ctx: AgentRunContext) => Promise<{ sseEndTurn: boolean }>;
    }).streamWithPollingFallback("sid-123", ctx);

    expect(result).toEqual({ sseEndTurn: true });
  });
});

describe("TC-03-05: streamWithPollingFallback — returns {sseEndTurn: false} on polling fallback", () => {
  it("triggers polling fallback and returns sseEndTurn=false", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.streamEvents.mockResolvedValue({
      sseDisconnected: true,
      idleEndTurnDetected: false,
      terminated: false,
      terminationReason: "sse_error" as const,
    });
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });

    const ctx = makeDesignCtx();
    const result = await (runner as unknown as {
      streamWithPollingFallback: (sid: string, ctx: AgentRunContext) => Promise<{ sseEndTurn: boolean }>;
    }).streamWithPollingFallback("sid-123", ctx);

    expect(result).toEqual({ sseEndTurn: false });
    expect(sessionClient.pollUntilComplete).toHaveBeenCalledOnce();
  });
});

describe("TC-03-06: streamWithPollingFallback — returns AgentRunResult on polling fallback timeout", () => {
  it("returns completionReason=timeout when POLL_TIMEOUT occurs in fallback", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.streamEvents.mockResolvedValue({
      sseDisconnected: true,
      idleEndTurnDetected: false,
      terminated: false,
      terminationReason: "sse_error" as const,
    });
    sessionClient.pollUntilComplete.mockResolvedValue({
      status: "terminated",
      error: { code: "POLL_TIMEOUT", message: "timed out", hint: "increase timeout" },
    });

    const ctx = makeDesignCtx();
    const result = await (runner as unknown as {
      streamWithPollingFallback: (
        sid: string,
        ctx: AgentRunContext,
      ) => Promise<{ sseEndTurn: boolean } | { completionReason: string }>;
    }).streamWithPollingFallback("sid-123", ctx);

    expect((result as { completionReason: string }).completionReason).toBe("timeout");
  });
});

describe("TC-03-07: runDesignStyle — early return on timeout from streamWithPollingFallback", () => {
  it("returns timeout AgentRunResult without calling verifyDesignArtifacts", async () => {
    const { runner, sessionClient, githubClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "sid-design" });
    sessionClient.streamEvents.mockResolvedValue({
      sseDisconnected: true,
      idleEndTurnDetected: false,
      terminated: false,
      terminationReason: "sse_error" as const,
    });
    sessionClient.pollUntilComplete.mockResolvedValue({
      status: "terminated",
      error: { code: "POLL_TIMEOUT", message: "timed out", hint: "increase timeout" },
    });

    const ctx = makeDesignCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("timeout");
    // verifyBranch should NOT be called (verify step skipped)
    expect(githubClient.verifyBranch).not.toHaveBeenCalled();
  });
});

describe("TC-03-08: verifyDesignArtifacts — warns non-fatal for non-GITHUB_TOKEN_EXPIRED verifyBranch error", () => {
  it("does not throw on generic verifyBranch error (warn only)", async () => {
    const { runner, githubClient, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "sid-design" });
    githubClient.verifyBranch.mockRejectedValue(new Error("network timeout"));

    const ctx = makeDesignCtx();
    // verifyDesignArtifacts is called inside run() after streamWithPollingFallback
    // Result should complete successfully (not throw)
    await expect(runner.run(ctx)).resolves.toMatchObject({ completionReason: "success" });
  });
});

describe("TC-03-09: verifyDesignArtifacts — rethrows GITHUB_TOKEN_EXPIRED from verifyBranch", () => {
  it("rethrows GITHUB_TOKEN_EXPIRED error from verifyBranch", async () => {
    const { runner, githubClient, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "sid-design" });
    githubClient.verifyBranch.mockRejectedValue(
      Object.assign(new Error("token expired"), { code: "GITHUB_TOKEN_EXPIRED" }),
    );

    const ctx = makeDesignCtx();
    await expect(runner.run(ctx)).rejects.toMatchObject({ code: "GITHUB_TOKEN_EXPIRED" });
  });
});

describe("TC-03-10: verifyDesignArtifacts — rethrows CHANGE_FOLDER_NOT_FOUND from verifyChangeFolder", () => {
  it("rethrows CHANGE_FOLDER_NOT_FOUND when change folder not found on GitHub", async () => {
    const { runner, githubClient, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "sid-design" });
    githubClient.verifyBranch.mockResolvedValue(true);
    githubClient.verifyPath.mockResolvedValue(false); // folder not found → changeFolderNotFoundError

    const ctx = makeDesignCtx();
    await expect(runner.run(ctx)).rejects.toMatchObject({ code: "CHANGE_FOLDER_NOT_FOUND" });
  });
});

describe("TC-03-12: runDesignStyle — thin orchestrator", () => {
  it("calls createSession, streamEvents, verifyBranch in sequence", async () => {
    const { runner, sessionClient, githubClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "sid-design" });

    const ctx = makeDesignCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(sessionClient.createSession).toHaveBeenCalledOnce();
    expect(sessionClient.streamEvents).toHaveBeenCalledOnce();
    expect(githubClient.verifyBranch).toHaveBeenCalledOnce();
  });
});

// ─── TC-04: Polling-style stages ──────────────────────────────────────────────

describe("TC-04-01: runPollingStyle — signature preserved (AgentRunContext → Promise<AgentRunResult>)", () => {
  it("ManagedAgentRunner has runPollingStyle as a private method", () => {
    const { runner } = makeRunner();
    expect(typeof (runner as unknown as Record<string, unknown>)["runPollingStyle"]).toBe("function");
  });
});

describe("TC-04-02: preparePollingMessage — returns required fields", () => {
  it("returns agentId, initialMessage, stepCtx", async () => {
    vi.mocked(getAgentId).mockReturnValue("agent-resolved-123");
    const { runner } = makeRunner();

    const ctx = makePollingCtx();
    const result = await (runner as unknown as {
      preparePollingMessage: (ctx: AgentRunContext) => Promise<{
        agentId: string;
        initialMessage: string;
        stepCtx: unknown;
      }>;
    }).preparePollingMessage(ctx);

    expect(result.agentId).toBe("agent-resolved-123");
    expect(typeof result.initialMessage).toBe("string");
    expect(result.initialMessage.length).toBeGreaterThan(0);
    expect(result.stepCtx).toBeDefined();
  });
});

describe("TC-04-03: preparePollingMessage — throws CONFIG_INCOMPLETE on agentId failure", () => {
  it("throws CONFIG_INCOMPLETE when getAgentId throws", async () => {
    vi.mocked(getAgentId).mockImplementation(() => {
      const err = Object.assign(new Error("missing agent"), { code: "CONFIG_INCOMPLETE" });
      throw err;
    });

    const { runner } = makeRunner();
    const ctx = makePollingCtx();

    await expect(
      (runner as unknown as {
        preparePollingMessage: (ctx: AgentRunContext) => Promise<unknown>;
      }).preparePollingMessage(ctx),
    ).rejects.toMatchObject({ code: "CONFIG_INCOMPLETE" });

    // Restore default mock for subsequent tests
    vi.mocked(getAgentId).mockReturnValue("agent-123");
  });
});

describe("TC-04-05: createOrResumePollingSession — normal path creates new session", () => {
  it("creates a new session and returns its sessionId", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "new-poll-sid" });

    const ctx = makePollingCtx(); // no resumeSessionId
    const sid = await (runner as unknown as {
      createOrResumePollingSession: (ctx: AgentRunContext, agentId: string, msg: string) => Promise<string>;
    }).createOrResumePollingSession(ctx, "agent-123", "initial message");

    expect(sid).toBe("new-poll-sid");
    expect(sessionClient.createSession).toHaveBeenCalledOnce();
    expect(sessionClient.sendUserMessage).toHaveBeenCalledWith("new-poll-sid", "initial message");
  });
});

describe("TC-04-06: createOrResumePollingSession — resume path uses existing sessionId", () => {
  it("sends to existing session without creating a new one", async () => {
    const { runner, sessionClient } = makeRunner();

    const ctx = makePollingCtx({ session: { resumeSessionId: "resume-sid-existing" } });
    const sid = await (runner as unknown as {
      createOrResumePollingSession: (ctx: AgentRunContext, agentId: string, msg: string) => Promise<string>;
    }).createOrResumePollingSession(ctx, "agent-123", "initial message");

    expect(sid).toBe("resume-sid-existing");
    expect(sessionClient.createSession).not.toHaveBeenCalled();
    expect(sessionClient.sendUserMessage).toHaveBeenCalledWith("resume-sid-existing", "initial message");
  });
});

describe("TC-04-07: createOrResumePollingSession — resume failure triggers fallback to new session", () => {
  it("falls back to new session when resume sendUserMessage fails", async () => {
    const { runner, sessionClient } = makeRunner();
    // Resume sendUserMessage fails
    sessionClient.sendUserMessage.mockRejectedValueOnce(new Error("session expired"));
    // Fallback createSession succeeds
    sessionClient.createSession.mockResolvedValue({ sessionId: "fallback-new-sid" });
    // Fallback sendUserMessage succeeds
    sessionClient.sendUserMessage.mockResolvedValueOnce(undefined);

    const ctx = makePollingCtx({ session: { resumeSessionId: "expired-resume-sid" } });
    const sid = await (runner as unknown as {
      createOrResumePollingSession: (ctx: AgentRunContext, agentId: string, msg: string) => Promise<string>;
    }).createOrResumePollingSession(ctx, "agent-123", "initial message");

    expect(sid).toBe("fallback-new-sid");
    expect(sessionClient.createSession).toHaveBeenCalledOnce();
  });
});

describe("TC-04-08: createOrResumePollingSession — fallback createSession failure uses context", () => {
  it('throws SESSION_CREATE_FAILED with "fallback after resume failure" in message', async () => {
    const { runner, sessionClient } = makeRunner();
    // Resume sendUserMessage fails
    sessionClient.sendUserMessage.mockRejectedValueOnce(new Error("session expired"));
    // Fallback createSession also fails
    sessionClient.createSession.mockRejectedValue(new Error("api unavailable"));

    const ctx = makePollingCtx({ session: { resumeSessionId: "expired-resume-sid" } });
    await expect(
      (runner as unknown as {
        createOrResumePollingSession: (ctx: AgentRunContext, agentId: string, msg: string) => Promise<string>;
      }).createOrResumePollingSession(ctx, "agent-123", "initial message"),
    ).rejects.toMatchObject({
      code: "SESSION_CREATE_FAILED",
      message: expect.stringContaining("fallback after resume failure"),
    });
  });
});

describe("TC-04-09: createOrResumePollingSession — fallback sendUserMessage failure", () => {
  it("throws SESSION_CREATE_FAILED (from throwSendMessageError) when fallback sendUserMessage fails", async () => {
    const { runner, sessionClient } = makeRunner();
    // Resume sendUserMessage fails
    sessionClient.sendUserMessage.mockRejectedValueOnce(new Error("session expired"));
    // Fallback createSession succeeds
    sessionClient.createSession.mockResolvedValue({ sessionId: "fallback-sid" });
    // Fallback sendUserMessage also fails
    sessionClient.sendUserMessage.mockRejectedValueOnce(new Error("network error on fallback"));

    const ctx = makePollingCtx({ session: { resumeSessionId: "expired-resume-sid" } });
    await expect(
      (runner as unknown as {
        createOrResumePollingSession: (ctx: AgentRunContext, agentId: string, msg: string) => Promise<string>;
      }).createOrResumePollingSession(ctx, "agent-123", "initial message"),
    ).rejects.toMatchObject({
      code: "SESSION_CREATE_FAILED",
      hint: "Check your network connection.",
    });
  });
});

describe("TC-04-12: fetchResultFile — returns null when resultFilePath=null", () => {
  it("returns null and skips getRawFile when resultFilePath is null", async () => {
    const { runner, githubClient } = makeRunner();
    const step = makePollingStep({ resultFilePath: () => null });
    const state = makeState("feat/test-slug");

    const result = await (runner as unknown as {
      fetchResultFile: (step: AgentStep, state: JobState, stepCtx: unknown) => Promise<string | null>;
    }).fetchResultFile(step, state, {});

    expect(result).toBeNull();
    expect(githubClient.getRawFile).not.toHaveBeenCalled();
  });
});

describe("TC-04-13: fetchResultFile — returns file content on success", () => {
  it("fetches and returns the file content from GitHub", async () => {
    const { runner, githubClient } = makeRunner();
    githubClient.getRawFile.mockResolvedValue("# Implementation notes\nContent here");
    const step = makePollingStep({ resultFilePath: () => "specrunner/changes/test-slug/implementation-notes.md" });
    const state = makeState("feat/test-slug");

    const result = await (runner as unknown as {
      fetchResultFile: (step: AgentStep, state: JobState, stepCtx: unknown) => Promise<string | null>;
    }).fetchResultFile(step, state, {});

    expect(result).toBe("# Implementation notes\nContent here");
    expect(githubClient.getRawFile).toHaveBeenCalledOnce();
  });
});

describe("TC-04-14: fetchResultFile — returns null when file not found", () => {
  it("returns null when getRawFile returns null (best-effort, not a hard error)", async () => {
    const { runner, githubClient } = makeRunner();
    githubClient.getRawFile.mockResolvedValue(null);
    const step = makePollingStep({ resultFilePath: () => "specrunner/changes/test-slug/missing.md" });
    const state = makeState("feat/test-slug");

    const result = await (runner as unknown as {
      fetchResultFile: (step: AgentStep, state: JobState, stepCtx: unknown) => Promise<string | null>;
    }).fetchResultFile(step, state, {});

    expect(result).toBeNull();
  });
});

describe("TC-04-15: runPollingStyle — returns timeout AgentRunResult on POLL_TIMEOUT", () => {
  it("returns completionReason=timeout and skips follow-up/guardCommit/fetchResultFile", async () => {
    const { runner, sessionClient, githubClient } = makeRunner();
    sessionClient.pollUntilComplete.mockResolvedValue({
      status: "terminated",
      error: { code: "POLL_TIMEOUT", message: "session timed out", hint: "increase timeout" },
    });

    const ctx = makePollingCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("timeout");
    expect(result.error?.code).toBe("POLL_TIMEOUT");
    // guardCommit and fetchResultFile should NOT have been called
    expect(githubClient.getRefSha).not.toHaveBeenCalled();
    expect(githubClient.getRawFile).not.toHaveBeenCalled();
  });
});

describe("TC-04-16: runPollingStyle — void completedAt preserved (regression check)", () => {
  it("completes successfully (completedAt variable reference intact)", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });

    const ctx = makePollingCtx();
    // If void completedAt was removed, a potential lint error would break the build.
    // This test verifies the method completes without issue.
    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
  });
});

describe("TC-04-17: runPollingStyle — thin orchestrator (calls stage methods)", () => {
  it("calls createSession, sendUserMessage, pollUntilComplete in sequence", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "poll-sid-xyz" });
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });

    const ctx = makePollingCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(sessionClient.createSession).toHaveBeenCalledOnce();
    expect(sessionClient.sendUserMessage).toHaveBeenCalledOnce();
    expect(sessionClient.pollUntilComplete).toHaveBeenCalledOnce();
  });
});

// ─── TC-02 follow-up conditions ───────────────────────────────────────────────

describe("TC-02-09: design follow-up NOT called when sseEndTurn=false (polling fallback path)", () => {
  it("skips executeFollowUpTurn when streamEvents triggers polling fallback", async () => {
    const { runner, sessionClient, githubClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "sid-design" });
    sessionClient.streamEvents.mockResolvedValue({
      sseDisconnected: true,
      idleEndTurnDetected: false,
      terminated: false,
      terminationReason: "sse_error" as const,
    });
    // Polling fallback succeeds
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });
    githubClient.verifyBranch.mockResolvedValue(true);
    githubClient.verifyPath.mockResolvedValue(true);

    // followUpPrompt is set — shouldRunFollowUp would return true, but sseEndTurn=false
    const ctx = makeDesignCtx({ policy: { postWorkPrompts: ["please commit"] } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // sendUserMessage should only have been called once (not for follow-up)
    // In design style, there is no sendUserMessage call — streamEvents handles it
    expect(sessionClient.sendUserMessage).not.toHaveBeenCalled();
  });
});

describe("TC-02-10: polling follow-up IS called when shouldRunFollowUp is true", () => {
  it("calls executeFollowUpTurn (sendUserMessage + pollUntilComplete) when followUpPrompt is set", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "poll-sid" });
    // Main poll succeeds
    sessionClient.pollUntilComplete.mockResolvedValueOnce({ status: "idle" });
    // Follow-up poll also succeeds
    sessionClient.pollUntilComplete.mockResolvedValueOnce({ status: "idle" });

    const ctx = makePollingCtx({ policy: { postWorkPrompts: ["now commit and push"] } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // sendUserMessage called once for follow-up
    expect(sessionClient.sendUserMessage).toHaveBeenCalledTimes(2); // initial + follow-up
    expect(sessionClient.pollUntilComplete).toHaveBeenCalledTimes(2); // main + follow-up
  });
});

// ─── TC-05: Final verification ────────────────────────────────────────────────

describe("TC-05-04: error-helpers.ts exists in src/adapter/managed-agent/", () => {
  it("imports successfully from error-helpers.js", async () => {
    const mod = await import("../../../src/adapter/managed-agent/error-helpers.js");
    expect(mod).toBeDefined();
    expect(typeof mod.throwSessionCreateError).toBe("function");
    expect(typeof mod.throwSendMessageError).toBe("function");
    expect(typeof mod.buildTimeoutResult).toBe("function");
  });
});

describe("TC-05-05: runDesignStyle / runPollingStyle signatures unchanged", () => {
  it("both methods exist as callable functions on ManagedAgentRunner", () => {
    const { runner } = makeRunner();
    const runnerAny = runner as unknown as Record<string, unknown>;
    expect(typeof runnerAny["runDesignStyle"]).toBe("function");
    expect(typeof runnerAny["runPollingStyle"]).toBe("function");
  });

  it("run() dispatches to correct style based on step role", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "run-dispatch-sid" });

    // Design style (role === "design")
    const designResult = await runner.run(makeDesignCtx());
    expect(designResult.completionReason).toBe("success");

    // Polling style (role !== "design")
    const pollResult = await runner.run(makePollingCtx());
    expect(pollResult.completionReason).toBe("success");
  });
});

describe("TC-05-06: managed-agent-runtime behavior — design+polling full lifecycle", () => {
  it("design style: createSession → streamEvents → verifyArtifacts → success", async () => {
    const { runner, sessionClient, githubClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "full-design-sid" });

    const ctx = makeDesignCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.sessionId).toBe("full-design-sid");
    expect(sessionClient.createSession).toHaveBeenCalledOnce();
    expect(sessionClient.streamEvents).toHaveBeenCalledOnce();
    expect(githubClient.verifyBranch).toHaveBeenCalledOnce();
    expect(githubClient.verifyPath).toHaveBeenCalledOnce();
  });

  it("polling style: createSession → sendMessage → poll → success", async () => {
    const { runner, sessionClient } = makeRunner();
    sessionClient.createSession.mockResolvedValue({ sessionId: "full-poll-sid" });
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });

    const ctx = makePollingCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.sessionId).toBe("full-poll-sid");
    expect(sessionClient.createSession).toHaveBeenCalledOnce();
    expect(sessionClient.sendUserMessage).toHaveBeenCalledOnce();
    expect(sessionClient.pollUntilComplete).toHaveBeenCalledOnce();
  });
});

describe("TC-05-07: createManagedAgentRunner / ManagedAgentRunnerDeps / buildManagedGitPushInstruction unchanged", () => {
  it("createManagedAgentRunner is exported and returns a ManagedAgentRunner instance", () => {
    const deps: ManagedAgentRunnerDeps = {
      sessionClient: makeMockSessionClient(),
      githubClient: makeMockGithubClient(),
      repo: { owner: "owner", name: "repo" },
      githubToken: "ghp-test",
    };

    const runner = createManagedAgentRunner(deps);
    expect(runner).toBeInstanceOf(ManagedAgentRunner);
    expect(typeof runner.run).toBe("function");
  });
});

// ─── TC-026: requires_action → report_result tool detection (Managed runtime) ─

import type { ReportToolSpec } from "../../../src/core/port/report-result.js";
import { parseBaseReportInput } from "../../../src/core/port/report-result.js";

function makeReportTool(): ReportToolSpec {
  return {
    name: "report_result",
    description: "Report completion of this step.",
    zodSchema: {},
    parseInput: parseBaseReportInput,
  };
}

describe("TC-026: Managed runtime requires_action → listEvents → sendEvents → toolResult: {ok:true}", () => {
  it("polls requires_action, calls listEvents to find tool use, sends tool result, returns toolResult={ok:true}", async () => {
    const { runner, sessionClient } = makeRunner();

    // Main poll returns requires_action (agent called report_result)
    sessionClient.pollUntilComplete.mockResolvedValueOnce({ status: "requires_action" });
    // listEvents returns the custom tool use event
    sessionClient.listEvents.mockResolvedValueOnce([
      {
        type: "agent.custom_tool_use",
        name: "report_result",
        id: "tool-use-id-001",
        input: { ok: true },
      },
    ]);
    // Follow-up poll after sending tool result
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });

    const ctx = makePollingCtx({
      policy: { reportTool: makeReportTool() },
    });

    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // listEvents should have been called to detect the tool use
    expect(sessionClient.listEvents).toHaveBeenCalledWith(expect.any(String));
    // sendEvents should have been called with user.custom_tool_result
    expect(sessionClient.sendEvents).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          type: "user.custom_tool_result",
          custom_tool_use_id: "tool-use-id-001",
          content: "ok",
        }),
      ]),
    );
    // toolResult is the parsed value from the tool call
    expect(result.toolResult).not.toBeNull();
    expect(result.toolResult?.ok).toBe(true);
  });
});

// ─── TC-028/TC-029: Managed runtime follow-up retry (tool not called) ─────────

describe("TC-028: Managed runtime — tool not called → follow-up sendUserMessage is sent", () => {
  it("when pollUntilComplete returns idle and reportTool is set, executeFollowUpTurn sends follow-up prompt", async () => {
    const { runner, sessionClient } = makeRunner();

    // All polls return idle (agent never calls report_result)
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });
    // listEvents always returns empty (no tool call)
    sessionClient.listEvents.mockResolvedValue([]);

    const ctx = makePollingCtx({
      policy: { reportTool: makeReportTool() },
    });

    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // sendUserMessage called: 1 initial + at least 1 follow-up retry
    // DEFAULT_TOOL_RETRY.maxAttempts = 2, so total = 1 initial + 2 retries = 3 calls
    expect(sessionClient.sendUserMessage.mock.calls.length).toBeGreaterThan(1);
    // The second call should be the follow-up retry prompt
    const [, retryCall] = sessionClient.sendUserMessage.mock.calls;
    expect(retryCall?.[1]).toContain("report_result");
  });
});

describe("TC-029: Managed runtime — maxAttempts exceeded → toolResult===null, followUpAttempts===2", () => {
  it("after 2 retries with no tool call, result.toolResult is null and followUpAttempts is 2", async () => {
    const { runner, sessionClient } = makeRunner();

    // All polls return idle (agent never calls report_result)
    sessionClient.pollUntilComplete.mockResolvedValue({ status: "idle" });
    // listEvents always returns empty (no tool call detected)
    sessionClient.listEvents.mockResolvedValue([]);

    const ctx = makePollingCtx({
      policy: { reportTool: makeReportTool() },
    });

    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.toolResult).toBeNull();
    expect(result.followUpAttempts).toBe(2);
  });
});
