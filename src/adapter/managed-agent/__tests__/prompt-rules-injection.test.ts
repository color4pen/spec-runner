/**
 * TC-017: managed adapter — promptRules を git push instruction の直前に注入する
 * TC-019: managed adapter SSE path — promptRules を streamEvents requestContent に注入する
 *
 * Verifies that ctx.policy.promptRules is injected:
 *   - TC-017: after resume-context and before buildManagedGitPushInstruction() (polling/implementer path)
 *   - TC-019: after resume-context in streamEvents requestContent (SSE/design path)
 */
import { describe, it, expect, vi } from "vitest";
import { ManagedAgentRunner } from "../agent-runner.js";
import type { SessionClient } from "../../../core/port/session-client.js";
import type { GitHubClient } from "../../../kernel/github-client.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_ID = "test-agent-id";
const ENV_ID = "test-env-id";
const SESSION_ID = "test-session-id";
const BRANCH = "feat/test";

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "managed",
    agents: { implementer: { agentId: AGENT_ID, definitionHash: "h", lastSyncedAt: "2026-01-01" } },
    environment: { id: ENV_ID, lastSyncedAt: "2026-01-01" },
  } as SpecRunnerConfig;
}

function makeDesignConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "managed",
    agents: { design: { agentId: AGENT_ID, definitionHash: "h", lastSyncedAt: "2026-01-01" } },
    environment: { id: ENV_ID, lastSyncedAt: "2026-01-01" },
  } as SpecRunnerConfig;
}

function makeJobState(): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
  };
}

function makeAgentStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: { name: "specrunner-implementer", role: "implementer", model: "claude-sonnet-4-6", system: "implement", tools: [] },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeDesignAgentStep(): AgentStep {
  return {
    kind: "agent",
    name: "design",
    agent: { name: "specrunner-design", role: "design", model: "claude-sonnet-4-6", system: "design", tools: [] },
    toolHandlers: undefined,
    buildMessage: () => "design this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

/** Build a mock SessionClient that captures sendUserMessage calls. */
function makeMockSessionClient(): { client: SessionClient; capturedMessages: { sessionId: string; text: string }[] } {
  const capturedMessages: { sessionId: string; text: string }[] = [];
  const client: SessionClient = {
    createSession: vi.fn().mockResolvedValue({ sessionId: SESSION_ID }),
    sendUserMessage: vi.fn().mockImplementation(async (sessionId: string, text: string) => {
      capturedMessages.push({ sessionId, text });
    }),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    streamEvents: vi.fn().mockResolvedValue({ sseDisconnected: false, idleEndTurnDetected: true, terminated: false, terminationReason: "end_turn" }),
  };
  return { client, capturedMessages };
}

/** Build a mock SessionClient that captures streamEvents requestContent (SSE/design path). */
function makeMockSessionClientCapturingSse(): { client: SessionClient; capturedRequestContents: string[] } {
  const capturedRequestContents: string[] = [];
  const client: SessionClient = {
    createSession: vi.fn().mockResolvedValue({ sessionId: SESSION_ID }),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    streamEvents: vi.fn().mockImplementation(async (_sessionId: string, opts: { requestContent: string }) => {
      capturedRequestContents.push(opts.requestContent);
      return { sseDisconnected: false, idleEndTurnDetected: true, terminated: false, terminationReason: "end_turn" as const };
    }),
  };
  return { client, capturedRequestContents };
}

function makeMockGitHubClient(): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    createPullRequest: vi.fn(),
    updatePullRequest: vi.fn(),
    getPullRequest: vi.fn(),
    listPullRequests: vi.fn(),
    mergePullRequest: vi.fn(),
    addPullRequestReviewComment: vi.fn(),
    addIssueComment: vi.fn(),
    getFileContent: vi.fn(),
    createBranch: vi.fn(),
  } as unknown as GitHubClient;
}

function makeCtx(extraPolicy: Partial<AgentRunContext["policy"]> = {}, session: AgentRunContext["session"] = {}): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: BRANCH,
    slug: "test-slug",
    cwd: "/tmp/test",
    input: { requestContent: "test request", requestAdr: false },
    session,
    policy: { ...extraPolicy },
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  } as AgentRunContext;
}

function makeDesignCtx(extraPolicy: Partial<AgentRunContext["policy"]> = {}, session: AgentRunContext["session"] = {}): AgentRunContext {
  return {
    step: makeDesignAgentStep(),
    state: { ...makeJobState(), step: "design" },
    branch: BRANCH,
    slug: "test-slug",
    cwd: "/tmp/test",
    input: { requestContent: "test request", requestAdr: false },
    session,
    policy: { ...extraPolicy },
    requestType: "spec-change",
    config: makeDesignConfig(),
    emit: () => {},
  } as AgentRunContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: promptRules が resume-context より後・git push instruction より前
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_PROMPT_RULES = "<project-rules>\nrule-content\n</project-rules>";
const RESUME_PROMPT = "resume context content";
// Partial text from buildManagedGitPushInstruction
const GIT_PUSH_MARKER = `git push origin ${BRANCH}`;

describe("TC-017: managed adapter — promptRules を git push instruction の直前に注入する", () => {
  it("promptRules は resume context より後・git push instruction より前に現れる", async () => {
    const { client, capturedMessages } = makeMockSessionClient();
    const runner = new ManagedAgentRunner({
      sessionClient: client,
      githubClient: makeMockGitHubClient(),
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "test-token",
    });

    const ctx = makeCtx(
      { promptRules: SAMPLE_PROMPT_RULES },
      { resumePrompt: RESUME_PROMPT },
    );

    await runner.run(ctx);

    // The initial message is passed via sendUserMessage
    expect(capturedMessages.length).toBeGreaterThanOrEqual(1);
    const initialMessage = capturedMessages[0]!.text;

    const resumeIdx = initialMessage.indexOf(RESUME_PROMPT);
    const rulesIdx = initialMessage.indexOf(SAMPLE_PROMPT_RULES);
    const gitPushIdx = initialMessage.indexOf(GIT_PUSH_MARKER);

    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(resumeIdx);
    expect(gitPushIdx).toBeGreaterThan(rulesIdx);
  });

  it("promptRules 未設定のとき initialMessage に <project-rules> が含まれない", async () => {
    const { client, capturedMessages } = makeMockSessionClient();
    const runner = new ManagedAgentRunner({
      sessionClient: client,
      githubClient: makeMockGitHubClient(),
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "test-token",
    });

    const ctx = makeCtx();
    await runner.run(ctx);

    expect(capturedMessages.length).toBeGreaterThanOrEqual(1);
    expect(capturedMessages[0]!.text).not.toContain("<project-rules>");
    expect(capturedMessages[0]!.text).toContain(GIT_PUSH_MARKER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-019: promptRules が SSE path (design role) の streamEvents requestContent に注入される
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-019: managed adapter SSE path — promptRules を streamEvents requestContent に注入する", () => {
  it("promptRules は resume context より後に streamEvents requestContent へ現れる", async () => {
    const { client, capturedRequestContents } = makeMockSessionClientCapturingSse();
    const runner = new ManagedAgentRunner({
      sessionClient: client,
      githubClient: makeMockGitHubClient(),
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "test-token",
    });

    const ctx = makeDesignCtx(
      { promptRules: SAMPLE_PROMPT_RULES },
      { resumePrompt: RESUME_PROMPT },
    );

    await runner.run(ctx);

    expect(capturedRequestContents.length).toBeGreaterThanOrEqual(1);
    const requestContent = capturedRequestContents[0]!;

    const resumeIdx = requestContent.indexOf(RESUME_PROMPT);
    const rulesIdx = requestContent.indexOf(SAMPLE_PROMPT_RULES);

    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(resumeIdx);
  });

  it("promptRules 未設定のとき streamEvents requestContent に <project-rules> が含まれない", async () => {
    const { client, capturedRequestContents } = makeMockSessionClientCapturingSse();
    const runner = new ManagedAgentRunner({
      sessionClient: client,
      githubClient: makeMockGitHubClient(),
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "test-token",
    });

    const ctx = makeDesignCtx();
    await runner.run(ctx);

    expect(capturedRequestContents.length).toBeGreaterThanOrEqual(1);
    expect(capturedRequestContents[0]!).not.toContain("<project-rules>");
  });
});
