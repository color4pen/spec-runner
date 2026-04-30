import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import type { SessionClient } from "../src/core/port/session-client.js";
import type { GitHubClient } from "../src/core/port/github-client.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-review-step-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

async function makeJobState() {
  const { createJobState } = await import("../src/state/store.js");
  const state = await createJobState({
    request: { path: "/test/request.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
  // Simulate propose step completed with a branch
  const { JobStateStore } = await import("../src/store/job-state-store.js");
  const store = new JobStateStore(state.jobId);
  return store.update(state, {
    branch: "feat/test-branch",
    status: "success",
    session: { id: "sess_propose", agentId: "agent_001", environmentId: "env_001" },
  });
}

function buildConfig(overrides?: { specReview?: { timeoutMs?: number; pollIntervalMs?: number } }) {
  return {
    version: 1 as const,
    anthropic: { apiKey: "sk-ant-test" },
    agents: {
      propose: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:ghi", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
    },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
    specReview: overrides?.specReview ?? { pollIntervalMs: 100, timeoutMs: 600000 },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "feature", title: "Test", slug: "test", content: "Do something", enabled: ["security-reviewer"] };
}

/**
 * Build a mock SessionClient for spec-review step testing.
 *
 * - createSession: returns the given sessionId
 * - sendUserMessage: no-op
 * - pollUntilComplete: returns idle by default (simulating successful completion)
 * - streamEvents: not used by spec-review (polling style step)
 */
function buildMockSessionClient(opts: {
  sessionId?: string;
  pollResult?: { status: "idle" | "terminated" | "timeout"; error?: { code: string; message: string; hint: string } };
  pollTimeoutMs?: number;
} = {}): {
  client: SessionClient;
  createSessionMock: ReturnType<typeof vi.fn>;
  pollUntilCompleteMock: ReturnType<typeof vi.fn>;
} {
  const sessionId = opts.sessionId ?? "sess_spec_review_001";
  const pollResult = opts.pollResult ?? { status: "idle" as const };

  const createSessionMock = vi.fn().mockResolvedValue({ sessionId });
  const pollUntilCompleteMock = vi.fn().mockResolvedValue(pollResult);

  const client: SessionClient = {
    createSession: createSessionMock,
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: pollUntilCompleteMock,
    streamEvents: vi.fn().mockRejectedValue(new Error("streamEvents not used by spec-review")),
  };

  return { client, createSessionMock, pollUntilCompleteMock };
}

/**
 * Build a mock GitHubClient for spec-review step tests.
 * getRawFile returns the given fileContent (or null to simulate 404).
 */
function buildMockGithubClient(fileContent: string | null): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(fileContent),
    verifyPath: vi.fn().mockResolvedValue(true),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
  };
}

/**
 * Build and run StepExecutor with SpecReviewStep.
 * Returns the result state.
 */
async function runSpecReviewViaExecutor(
  jobState: import("../src/state/schema.js").JobState,
  deps: Omit<import("../src/core/types.js").PipelineDeps, "client"> & { client: SessionClient },
) {
  const { EventBus } = await import("../src/core/event/event-bus.js");
  const { StepExecutor } = await import("../src/core/step/executor.js");
  const { SpecReviewStep } = await import("../src/core/step/spec-review.js");

  const events = new EventBus();
  const executor = new StepExecutor(events);
  return executor.execute(SpecReviewStep, jobState, deps);
}

// TC-016: pollUntilComplete 再利用 — spec-review に specReview.timeoutMs を渡す
describe("TC-016: runSpecReviewStep — uses specReview.timeoutMs from config", () => {
  it("calls pollUntilComplete with timeoutMs from config.specReview", async () => {
    const jobState = await makeJobState();

    const fileContent = "- **verdict**: approved\n";
    const config = buildConfig({ specReview: { timeoutMs: 600000, pollIntervalMs: 100 } });
    const { client, pollUntilCompleteMock } = buildMockSessionClient();

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config,
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient(fileContent),
    });

    // pollUntilComplete should have been called with the timeoutMs from config
    expect(pollUntilCompleteMock).toHaveBeenCalledTimes(1);
    const pollCallArgs = pollUntilCompleteMock.mock.calls[0]![1] as { timeoutMs?: number } | undefined;
    expect(pollCallArgs?.timeoutMs).toBe(600000);

    // Verify step completed and recorded a verdict (array format)
    const lastResult = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastResult ? toLegacyStepResult(lastResult).verdict : undefined).toBe("approved");
  });
});

// TC-017: pollUntilComplete — status === "idle" で完了と判定する
describe("TC-017: runSpecReviewStep — treats status='idle' as complete", () => {
  it("proceeds to verdict fetch phase when polling returns idle", async () => {
    const jobState = await makeJobState();

    const { client } = buildMockSessionClient({ pollResult: { status: "idle" } });
    const fileContent = "- **verdict**: approved\n";

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient(fileContent),
    });

    const lastSpecReview = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");
    expect(result.status).toBe("success");
  });
});

// TC-018: SESSION_TERMINATED — error.code = "SESSION_TERMINATED"
describe("TC-018: runSpecReviewStep — SESSION_TERMINATED error handling", () => {
  it("fails with SESSION_TERMINATED code when session terminates", async () => {
    const jobState = await makeJobState();

    const { client } = buildMockSessionClient({
      pollResult: {
        status: "terminated",
        error: { code: "SESSION_TERMINATED", message: "Session terminated", hint: "" },
      },
    });

    await expect(
      runSpecReviewViaExecutor(jobState, {
        client,
        config: buildConfig(),
        repo: buildRepo(),
        request: buildRequest(),
        slug: "test-slug",
        sleepFn: vi.fn().mockResolvedValue(undefined),
        githubClient: buildMockGithubClient(""),
      }),
    ).rejects.toMatchObject({ code: "SESSION_TERMINATED" });
  });
});

// TC-019: SESSION_TIMEOUT — error.code = "SESSION_TIMEOUT"
describe("TC-019: runSpecReviewStep — SESSION_TIMEOUT error handling", () => {
  it("fails with SESSION_TIMEOUT code when session times out", async () => {
    const jobState = await makeJobState();

    const { client } = buildMockSessionClient({
      pollResult: {
        status: "timeout",
        error: { code: "SESSION_TIMEOUT", message: "Session timed out after 10 minutes", hint: "" },
      },
    });

    await expect(
      runSpecReviewViaExecutor(jobState, {
        client,
        config: { ...buildConfig(), specReview: { timeoutMs: 1, pollIntervalMs: 100 } },
        repo: buildRepo(),
        request: buildRequest(),
        slug: "test-slug",
        sleepFn: vi.fn().mockResolvedValue(undefined),
        githubClient: buildMockGithubClient(""),
      }),
    ).rejects.toMatchObject({ code: "SESSION_TIMEOUT" });
  });
});

// TC-020: SPEC_REVIEW_RESULT_NOT_FOUND — githubClient.getRawFile が null を返した場合
describe("TC-020: runSpecReviewStep — SPEC_REVIEW_RESULT_NOT_FOUND when file not found", () => {
  it("fails with SPEC_REVIEW_RESULT_NOT_FOUND when result file is never found after retries", async () => {
    const jobState = await makeJobState();

    const { client } = buildMockSessionClient();
    // null simulates 404 — file not found after retries

    await expect(
      runSpecReviewViaExecutor(jobState, {
        client,
        config: buildConfig(),
        repo: buildRepo(),
        request: buildRequest(),
        slug: "test-slug",
        sleepFn: vi.fn().mockResolvedValue(undefined),
        githubClient: buildMockGithubClient(null),
      }),
    ).rejects.toMatchObject({ code: "SPEC_REVIEW_RESULT_NOT_FOUND" });
  });
});

// TC-021: verdict 行なし — escalation フェイルセーフ
describe("TC-021: runSpecReviewStep — escalation failsafe when verdict line absent", () => {
  it("sets verdict='escalation' when file has no verdict line", async () => {
    const jobState = await makeJobState();

    const { client } = buildMockSessionClient();
    // File exists but has no verdict line

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient("## Findings\n\nNo findings."),
    });

    // SpecReviewStep.parseResult maps null verdict → "escalation" (failsafe)
    const lastSpecReview2 = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastSpecReview2 ? toLegacyStepResult(lastSpecReview2).verdict : undefined).toBe("escalation");
    expect(result.status).toBe("success");
  });
});

// TC-041: spec-review step — records session, verdict, findingsPath, completedAt
describe("TC-041: runSpecReviewStep — records session, verdict, findingsPath, completedAt", () => {
  it("records all required step result fields on normal completion", async () => {
    const jobState = await makeJobState();

    const sessionId = "sess_spec_001";
    const { client } = buildMockSessionClient({ sessionId });
    const fileContent = "- **verdict**: approved\n";

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient(fileContent),
    });

    const stepResultArr = result.steps?.["spec-review"];
    expect(stepResultArr).toBeDefined();
    expect(Array.isArray(stepResultArr)).toBe(true);
    const stepResult = stepResultArr?.[stepResultArr.length - 1];
    const stepResultConverted = stepResult ? toLegacyStepResult(stepResult) : undefined;
    expect(stepResultConverted?.session?.id).toBe(sessionId);
    expect(stepResultConverted?.verdict).toBe("approved");
    // findingsPath now uses iteration-based naming: spec-review-result-001.md
    expect(stepResultConverted?.findingsPath).toBe("openspec/changes/test-slug/spec-review-result-001.md");
    expect(stepResultConverted?.completedAt).toBeDefined();
    expect(stepResultConverted?.error).toBeNull();
  });
});

// TC-042: spec-review セッション作成パラメータ — createSession called without custom tools
describe("TC-042: runSpecReviewStep — session created without custom tools", () => {
  it("creates session with agentId/environmentId/repoUrl/githubToken (no custom tools in deps)", async () => {
    const jobState = await makeJobState();

    const { client, createSessionMock } = buildMockSessionClient();

    await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient("- **verdict**: approved"),
    });

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const createParams = createSessionMock.mock.calls[0]![0] as {
      agentId: string;
      environmentId: string;
      repoUrl: string;
      githubToken: string;
    };

    // Must be called via SessionClient port (no SDK-specific params)
    expect(createParams.agentId).toBeDefined();
    expect(createParams.environmentId).toBe("env_001");
    expect(createParams.repoUrl).toContain("github.com/testowner/testrepo");
    expect(createParams.githubToken).toBe("ghp_test");
  });
});

// TC-049: runSpecReviewStep — findingsPath format
describe("TC-049: runSpecReviewStep — findingsPath has correct format", () => {
  it("records findingsPath as openspec/changes/<slug>/spec-review-result-001.md for iter=1", async () => {
    const jobState = await makeJobState();
    const slug = "2026-04-29-my-feature";

    const { client } = buildMockSessionClient();

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient("- **verdict**: needs-fix"),
    });

    const lastStepResult = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastStepResult ? toLegacyStepResult(lastStepResult).findingsPath : undefined).toBe(
      `openspec/changes/${slug}/spec-review-result-001.md`,
    );
  });
});
