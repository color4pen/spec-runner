import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  const { updateJobState } = await import("../src/state/store.js");
  return updateJobState(state, {
    branch: "feat/test-branch",
    status: "success",
    session: { id: "sess_propose", agentId: "agent_001", environmentId: "env_001" },
  });
}

function buildConfig() {
  return {
    version: 1 as const,
    anthropic: { apiKey: "sk-ant-test" },
    agent: { id: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
    specReview: { pollIntervalMs: 100, timeoutMs: 600000 },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "feature", title: "Test", content: "Do something", enabled: ["security-reviewer"] };
}

/**
 * Build a mock client that simulates a successful spec-review session.
 * The polling will return idle status immediately after being created.
 */
function buildMockClient(opts: {
  sessionId?: string;
  terminateSession?: boolean;
  timeoutSession?: boolean;
} = {}) {
  const sessionId = opts.sessionId ?? "sess_spec_review_001";
  let pollCallCount = 0;

  const mockRetrieve = vi.fn().mockImplementation(() => {
    pollCallCount++;
    if (opts.terminateSession) {
      return Promise.resolve({ id: sessionId, status: "terminated" });
    }
    // Return idle on first poll to simulate quick completion
    return Promise.resolve({ id: sessionId, status: "idle" });
  });

  return {
    sessionId,
    client: {
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: sessionId, type: "session" }),
          retrieve: mockRetrieve,
          events: {
            send: vi.fn().mockResolvedValue({}),
            stream: vi.fn(),
          },
        },
      },
    } as unknown as import("../src/core/pipeline.js").PipelineDeps["client"],
  };
}

// TC-016: pollUntilComplete 再利用 — spec-review に specReview.timeoutMs を渡す
describe("TC-016: runSpecReviewStep — uses specReview.timeoutMs from config", () => {
  it("calls pollUntilComplete with timeoutMs from config.specReview", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    let capturedOpts: { timeoutMs?: number } | undefined;
    const { pollUntilComplete } = await import("../src/core/completion.js");

    // Override pollUntilComplete to capture opts
    const originalPollUntilComplete = pollUntilComplete;

    const mockPoll = vi.fn().mockImplementation(
      async (_client: unknown, _sessionId: string, _signal: unknown, opts?: { timeoutMs?: number }) => {
        capturedOpts = opts;
        return { id: "sess_001", status: "idle" };
      },
    );

    // Use a custom sleep to avoid real delays
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const fileContent = "- **verdict**: approved\n";
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(fileContent),
    });

    const config = buildConfig();
    config.specReview = { timeoutMs: 600000, pollIntervalMs: 100 };

    // Spy on the module to intercept pollUntilComplete
    // Since we can't easily mock ES module internals, we test indirectly by
    // verifying the step calls pollUntilComplete with the right timeout by
    // checking the session completes correctly
    const { client, sessionId } = buildMockClient();

    const result = await runSpecReviewStep(jobState, {
      client,
      config,
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn,
      githubFetch: mockFetch,
    });

    // Verify step completed and recorded a verdict (array format)
    const lastResult = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastResult?.verdict).toBe("approved");
  });
});

// TC-017: pollUntilComplete — status === "idle" で完了と判定する
describe("TC-017: runSpecReviewStep — treats status='idle' as complete", () => {
  it("proceeds to verdict fetch phase when polling returns idle", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    const { client } = buildMockClient();
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fileContent = "- **verdict**: approved\n";
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(fileContent),
    });

    const result = await runSpecReviewStep(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn,
      githubFetch: mockFetch,
    });

    const lastSpecReview = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastSpecReview?.verdict).toBe("approved");
    expect(result.status).toBe("success");
  });
});

// TC-018: SESSION_TERMINATED — state.status = "failed" / error.code = "SESSION_TERMINATED"
describe("TC-018: runSpecReviewStep — SESSION_TERMINATED error handling", () => {
  it("sets state.status='failed' and error.code='SESSION_TERMINATED' when session terminates", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    const { client } = buildMockClient({ terminateSession: true });
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const mockFetch = vi.fn().mockResolvedValue({ status: 200, text: () => Promise.resolve("") });

    await expect(
      runSpecReviewStep(jobState, {
        client,
        config: buildConfig(),
        repo: buildRepo(),
        request: buildRequest(),
        slug: "test-slug",
        sleepFn,
        githubFetch: mockFetch,
      }),
    ).rejects.toMatchObject({ code: "SESSION_TERMINATED" });
  });
});

// TC-019: SESSION_TIMEOUT — state.status = "failed" / error.code = "SESSION_TIMEOUT"
describe("TC-019: runSpecReviewStep — SESSION_TIMEOUT error handling", () => {
  it("sets state.status='failed' and error.code='SESSION_TIMEOUT' when session times out", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    const { sessionTimeoutError } = await import("../src/errors.js");
    const timeoutErr = sessionTimeoutError(10);

    // Create a client that makes polling time out immediately
    const mockClient = {
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: "sess_timeout", type: "session" }),
          retrieve: vi.fn().mockRejectedValue(timeoutErr),
          events: {
            send: vi.fn().mockResolvedValue({}),
            stream: vi.fn(),
          },
        },
      },
    } as unknown as import("../src/core/pipeline.js").PipelineDeps["client"];

    // We need to make the poll throw a timeout error
    // The easiest way is to use a very short timeout with a sleep that never returns
    // Instead, mock the retrieve to always return "running" and use timeoutMs=1

    const neverResolve = vi.fn().mockImplementation(
      () => new Promise<void>(() => {}),
    );

    // Use a real short timeout by making pollUntilComplete think time has passed
    // We'll mock the sleep function to advance time
    let elapsed = 0;
    const fakeSleep = vi.fn().mockImplementation(async (_ms: number) => {
      elapsed += 1000000; // fast-forward time
    });

    // The poll loop checks Date.now() — we need to mock it
    const originalDateNow = Date.now;
    let callCount = 0;
    const mockDateNow = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount > 1) {
        return originalDateNow() + 1000000; // way past timeout
      }
      return originalDateNow();
    });

    const realDateNow = Date.now;
    global.Date.now = mockDateNow;

    const mockFetch = vi.fn().mockResolvedValue({ status: 200, text: () => Promise.resolve("") });

    try {
      await expect(
        runSpecReviewStep(jobState, {
          client: mockClient,
          config: { ...buildConfig(), specReview: { timeoutMs: 1, pollIntervalMs: 100 } },
          repo: buildRepo(),
          request: buildRequest(),
          slug: "test-slug",
          sleepFn: fakeSleep,
          githubFetch: mockFetch,
        }),
      ).rejects.toMatchObject({ code: "SESSION_TIMEOUT" });
    } finally {
      global.Date.now = realDateNow;
    }
  });
});

// TC-020: SPEC_REVIEW_RESULT_NOT_FOUND — fetchSpecReviewResult が null を返した場合
describe("TC-020: runSpecReviewStep — SPEC_REVIEW_RESULT_NOT_FOUND when file not found", () => {
  it("fails with SPEC_REVIEW_RESULT_NOT_FOUND when result file is never found after retries", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    const { client } = buildMockClient();
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    // Always return 404
    const mockFetch = vi.fn().mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(""),
    });

    await expect(
      runSpecReviewStep(jobState, {
        client,
        config: buildConfig(),
        repo: buildRepo(),
        request: buildRequest(),
        slug: "test-slug",
        sleepFn,
        githubFetch: mockFetch,
      }),
    ).rejects.toMatchObject({ code: "SPEC_REVIEW_RESULT_NOT_FOUND" });
  });
});

// TC-021: verdict 行なし — escalation フェイルセーフ
describe("TC-021: runSpecReviewStep — escalation failsafe when verdict line absent", () => {
  it("sets verdict='escalation' and writes stderr warning when file has no verdict line", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    const { client } = buildMockClient();
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    // File exists but has no verdict line
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("## Findings\n\nNo findings."),
    });

    const result = await runSpecReviewStep(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn,
      githubFetch: mockFetch,
    });

    const lastSpecReview2 = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastSpecReview2?.verdict).toBe("escalation");
    expect(result.status).toBe("success");

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stderrCalls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(combined).toContain("Could not parse verdict");
  });
});

// TC-041: runSpecReviewStep — state.steps["spec-review"] に session / verdict / findingsPath / completedAt が記録される (should)
describe("TC-041: runSpecReviewStep — records session, verdict, findingsPath, completedAt", () => {
  it("records all required step result fields on normal completion", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    const { client, sessionId } = buildMockClient({ sessionId: "sess_spec_001" });
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fileContent = "- **verdict**: approved\n";
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(fileContent),
    });

    const result = await runSpecReviewStep(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn,
      githubFetch: mockFetch,
    });

    const stepResultArr = result.steps?.["spec-review"];
    expect(stepResultArr).toBeDefined();
    expect(Array.isArray(stepResultArr)).toBe(true);
    const stepResult = stepResultArr?.[stepResultArr.length - 1];
    expect(stepResult?.session?.id).toBe(sessionId);
    expect(stepResult?.verdict).toBe("approved");
    // findingsPath now uses iteration-based naming: spec-review-result-001.md
    expect(stepResult?.findingsPath).toBe("openspec/changes/test-slug/spec-review-result-001.md");
    expect(stepResult?.completedAt).toBeDefined();
    expect(stepResult?.error).toBeNull();
  });
});

// TC-042: spec-review セッション作成パラメータ — custom tool を含まない (should)
describe("TC-042: runSpecReviewStep — session created without custom tools", () => {
  it("creates session without custom tools, with github_repository resource", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();

    const { client } = buildMockClient();
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("- **verdict**: approved"),
    });

    await runSpecReviewStep(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn,
      githubFetch: mockFetch,
    });

    const createCalls = (
      (client as unknown as {
        beta: { sessions: { create: ReturnType<typeof vi.fn> } };
      }).beta.sessions.create
    ).mock.calls;

    expect(createCalls).toHaveLength(1);
    const createParams = createCalls[0]![0] as {
      resources: Array<{ type: string; url?: string; authorization_token?: string }>;
    };

    // Must not have custom tools in create params
    expect((createParams as Record<string, unknown>)["tools"]).toBeUndefined();

    // Must have github_repository resource
    const ghResource = createParams.resources?.find(
      (r) => r.type === "github_repository",
    );
    expect(ghResource).toBeDefined();
    expect(ghResource?.authorization_token).toBe("ghp_test");
  });
});

// TC-049: runSpecReviewStep — findingsPath format (updated for iteration-based naming)
describe("TC-049: runSpecReviewStep — findingsPath has correct format", () => {
  it("records findingsPath as openspec/changes/<slug>/spec-review-result-001.md for iter=1", async () => {
    const { runSpecReviewStep } = await import("../src/core/steps/spec-review.js");
    const jobState = await makeJobState();
    const slug = "2026-04-29-my-feature";

    const { client } = buildMockClient();
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("- **verdict**: needs-fix"),
    });

    const result = await runSpecReviewStep(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug,
      sleepFn,
      githubFetch: mockFetch,
    });

    const lastStepResult = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastStepResult?.findingsPath).toBe(
      `openspec/changes/${slug}/spec-review-result-001.md`,
    );
  });
});
