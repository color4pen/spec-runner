import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import type { SessionClient } from "../src/core/port/session-client.js";
import type { GitHubClient } from "../src/core/port/github-client.js";
import type { SpawnFn } from "../src/util/spawn.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { specReviewResultPath } from "../src/util/paths.js";
import { buildInitialJobState } from "../src/store/job-state-store.js";
import { makeStoreFactory } from "./helpers/store-factory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-review-step-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJobState() {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
  // Simulate propose step completed with a branch
  const store = makeStoreFactory(tempDir)(state.jobId);
  await store.persist(state);
  return store.update(state, {
    branch: "feat/test-branch",
    status: "running",
    session: { id: "sess_propose", agentId: "agent_001", environmentId: "env_001" },
  });
}

function buildConfig(overrides?: { specReview?: { pollIntervalMs?: number } }) {
  return {
    version: 1 as const,
    agents: {
      design: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:ghi", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
    },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    specReview: overrides?.specReview ?? { pollIntervalMs: 100 },
  };
}

function buildRequest() {
  return { type: "feature", title: "Test", slug: "test", baseBranch: "main", content: "Do something", adr: false };
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
  pollResult?: { status: "idle" | "terminated"; error?: { code: string; message: string; hint: string } };
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
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([
      // R3 cutover: include approved:true so spec-review (judge) returns "approved" verdict
      { type: "agent.custom_tool_use", name: "report_result", id: "mock-report-id", input: { ok: true, approved: true } },
    ]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
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
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
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
  const { createManagedAgentRunner } = await import("../src/adapter/managed-agent/agent-runner.js");

  const events = new EventBus();
  const runner = createManagedAgentRunner({
    sessionClient: deps.client,
    githubClient: deps.githubClient,
    repo: { owner: "testowner", name: "testrepo" },
    githubToken: "ghp_test",
  });
  const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
  return executor.execute(SpecReviewStep, jobState, deps);
}

// TC-006: pollUntilComplete が timeoutMs（デフォルト 15 分）付きで呼び出される
describe("TC-006: runSpecReviewStep — pollUntilComplete is called with default timeoutMs", () => {
  it("calls pollUntilComplete with default timeoutMs (900000ms = 15 minutes)", async () => {
    const jobState = await makeJobState();

    const fileContent = "- **verdict**: approved\n";
    const config = buildConfig({ specReview: { pollIntervalMs: 100 } });
    const { client, pollUntilCompleteMock } = buildMockSessionClient();

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config,
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient(fileContent),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // pollUntilComplete should be called with the default timeoutMs (900000ms) on first call
    const pollCallArgs = pollUntilCompleteMock.mock.calls[0]![1] as { timeoutMs?: number } | undefined;
    expect(pollCallArgs?.timeoutMs).toBe(900_000);

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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient(fileContent),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    const lastSpecReview = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");
    // PR #72: spec-review is mid-pipeline; job-level status remains "running" after step completion.
    expect(result.status).toBe("running");
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
        request: buildRequest(),
        slug: "test-slug",
        sleepFn: vi.fn().mockResolvedValue(undefined),
        githubClient: buildMockGithubClient(""),
        owner: "testowner",
        repo: "testrepo",
        spawn: noopSpawn,
        storeFactory: makeStoreFactory(tempDir),
      }),
    ).rejects.toMatchObject({ code: "SESSION_TERMINATED" });
  });
});

// TC-019 (removed): SESSION_TIMEOUT handling removed in remove-session-timeout.
// SESSION_TIMEOUT error code no longer exists. SESSION_TERMINATED is the only terminal error.

// TC-020 (updated R3): result file not found — toolResult.approved determines verdict now.
// R3 cutover: file content is no longer used for verdict determination in judge steps.
// When toolResult.approved is undefined (conservative), verdict is "needs-fix" (not "escalation").
describe("TC-020: runSpecReviewStep — conservative failsafe when result file not found (R3)", () => {
  it("sets verdict='needs-fix' when result file is never found (toolResult.approved undefined → needs-fix)", async () => {
    const jobState = await makeJobState();

    // Use default listEvents which has approved:true, but override with no approved to test conservative path
    const { client } = buildMockSessionClient();
    // Override listEvents to return no approved field (simulates toolResult without approved)
    (client.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: "agent.custom_tool_use", name: "report_result", id: "mock-report-id", input: { ok: true } },
    ]);

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient(null), // file not found — irrelevant for verdict in R3
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // R3: toolResult.approved undefined → judge step → "needs-fix" (conservative failsafe)
    const lastSpecReview = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("needs-fix");
  });
});

// TC-021 (updated R3): verdict 行なし — toolResult.approved で判定 (R3 cutover)
// R3 cutover: SpecReviewStep.parseResult is no longer used for verdict determination.
// When toolResult.approved is undefined (conservative), verdict is "needs-fix".
describe("TC-021: runSpecReviewStep — needs-fix when approved not set (R3 conservative fallback)", () => {
  it("sets verdict='needs-fix' when toolResult.approved is absent (R3: no prose fallback for judge)", async () => {
    const jobState = await makeJobState();

    const { client } = buildMockSessionClient();
    // Override listEvents to return no approved field (simulates agent not setting approved)
    (client.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: "agent.custom_tool_use", name: "report_result", id: "mock-report-id", input: { ok: true } },
    ]);

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient("## Findings\n\nNo findings."), // file content irrelevant in R3
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // R3: toolResult.approved undefined → judge step → "needs-fix"
    const lastSpecReview2 = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastSpecReview2 ? toLegacyStepResult(lastSpecReview2).verdict : undefined).toBe("needs-fix");
    // PR #72: spec-review is mid-pipeline; job-level status remains "running" after step completion.
    expect(result.status).toBe("running");
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient(fileContent),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    const stepResultArr = result.steps?.["spec-review"];
    expect(stepResultArr).toBeDefined();
    expect(Array.isArray(stepResultArr)).toBe(true);
    const stepResult = stepResultArr?.[stepResultArr.length - 1];
    const stepResultConverted = stepResult ? toLegacyStepResult(stepResult) : undefined;
    expect(stepResultConverted?.session?.id).toBe(sessionId);
    expect(stepResultConverted?.verdict).toBe("approved");
    // findingsPath now uses iteration-based naming: spec-review-result-001.md
    expect(stepResultConverted?.findingsPath).toBe(specReviewResultPath("test-slug", 1));
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient("- **verdict**: approved"),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
  it("records findingsPath as specReviewResultPath(slug, 1) for iter=1", async () => {
    const jobState = await makeJobState();
    const slug = "2026-04-29-my-feature";

    const { client } = buildMockSessionClient();

    const result = await runSpecReviewViaExecutor(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: buildMockGithubClient("- **verdict**: needs-fix"),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    const lastStepResult = result.steps?.["spec-review"]?.[result.steps["spec-review"]!.length - 1];
    expect(lastStepResult ? toLegacyStepResult(lastStepResult).findingsPath : undefined).toBe(
      specReviewResultPath(slug, 1),
    );
  });
});
