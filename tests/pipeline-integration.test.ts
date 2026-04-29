import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-integration-test-"));
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

async function makeJobState() {
  const { createJobState } = await import("../src/state/store.js");
  return createJobState({
    request: { path: "/test/request.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
}

function buildConfig(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    anthropic: { apiKey: "sk-ant-test" },
    agent: { id: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
    agents: {
      propose: { id: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      specFixer: { id: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
    },
    pipeline: { maxRetries: 2 },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
    specReview: { pollIntervalMs: 100, timeoutMs: 600000 },
    ...overrides,
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "feature", title: "Test", content: "Do something", enabled: [] };
}

/**
 * Build a mock SessionClient that supports multiple spec-review iterations.
 * Session order: sess1=propose, sess2=spec-fixer-1, sess3=spec-review-1,
 *                sess4=spec-fixer-2, sess5=spec-review-2, etc.
 *
 * Implements the SessionClient port interface (not the raw Anthropic SDK).
 */
function buildPipelineMockClient(opts: {
  proposeBranch?: string;
  proposeFailure?: boolean;
  specReviewVerdicts?: ("approved" | "needs-fix" | "escalation")[];
  sessionIds?: string[];
}) {
  const {
    proposeBranch = "feat/test-branch",
    proposeFailure = false,
    specReviewVerdicts = ["approved"],
    sessionIds = [
      "sess_propose_001",
      "sess_spec_fixer_001",
      "sess_spec_review_001",
      "sess_spec_fixer_002",
      "sess_spec_review_002",
    ],
  } = opts;

  let createCallCount = 0;

  const client = {
    createSession: vi.fn().mockImplementation(() => {
      const sessionId = sessionIds[createCallCount] ?? `sess_unknown_${createCallCount}`;
      createCallCount++;
      return Promise.resolve({ sessionId });
    }),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" as const }),
    streamEvents: vi.fn().mockImplementation(
      (_sessionId: string, opts: { onBranchRegistered?: (b: string) => void }) => {
        if (proposeFailure) {
          return Promise.resolve({
            sseDisconnected: false,
            idleEndTurnDetected: false,
            terminated: true,
            terminationReason: "terminated" as const,
          });
        }
        // Simulate register_branch tool call + end_turn
        opts.onBranchRegistered?.(proposeBranch);
        return Promise.resolve({
          sseDisconnected: false,
          idleEndTurnDetected: true,
          terminated: false,
          terminationReason: "end_turn" as const,
        });
      },
    ),
  };

  return {
    client,
    sessionIds,
    specReviewVerdicts,
  };
}

/**
 * Build a github fetch mock that returns the correct verdict for each spec-review iteration.
 * Matches URLs containing "spec-review-result" (covers spec-review-result-001.md etc.)
 */
function buildGithubFetch(
  branchStatus = 200,
  folderStatus = 200,
  specReviewVerdicts: ("approved" | "needs-fix" | "escalation")[] = ["approved"],
) {
  let specReviewCallCount = 0;

  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/branches/")) {
      return Promise.resolve({ status: branchStatus, ok: branchStatus < 400 });
    }
    // Match spec-review-result-NNN.md files (new iteration-based naming)
    if (url.includes("/contents/openspec") && url.includes("spec-review-result")) {
      const verdict = specReviewVerdicts[specReviewCallCount] ?? specReviewVerdicts[specReviewVerdicts.length - 1]!;
      specReviewCallCount++;
      const fileContent = `- **verdict**: ${verdict}\n\n## Findings\n\n| # | Severity | Category | File | Description | How to Fix |\n|---|---|---|---|---|---|\n| 1 | HIGH | completeness | tasks.md | Missing tests | Add tests |`;
      return Promise.resolve({
        status: 200,
        text: () => Promise.resolve(fileContent),
      });
    }
    if (url.includes("/contents/")) {
      return Promise.resolve({ status: folderStatus, ok: folderStatus < 400 });
    }
    return Promise.resolve({ status: 200, ok: true });
  });
}

// TC-010: runPipeline — iter=1 approved で spec-fixer を起動しない
describe("TC-010: runPipeline — iter=1 approved: spec-fixer not invoked", () => {
  it("returns status='success', steps['spec-review'] has 1 element with verdict=approved, no spec-fixer steps", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["approved"]);

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    expect(result.status).toBe("success");

    // spec-review: length 1, verdict=approved
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(1);
    const lastSpecReview = specReviewArr?.[specReviewArr.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");

    // spec-fixer: not present
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // Sessions: only propose (1) + spec-review (1) = 2 total
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(2);
  });
});

// TC-011: runPipeline — iter=1 needs-fix → spec-fixer → iter=2 approved
describe("TC-011: runPipeline — iter=1 needs-fix → spec-fixer → iter=2 approved", () => {
  it("returns status='success', spec-review has 2 entries, spec-fixer has 1 entry", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["needs-fix", "approved"]);

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    expect(result.status).toBe("success");

    // spec-review: 2 entries
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(2);
    expect(specReviewArr?.[0] ? toLegacyStepResult(specReviewArr[0]).verdict : undefined).toBe("needs-fix");
    expect(specReviewArr?.[1] ? toLegacyStepResult(specReviewArr[1]).verdict : undefined).toBe("approved");

    // spec-fixer: 1 entry
    const specFixerArr = result.steps?.["spec-fixer"];
    expect(specFixerArr).toBeDefined();
    expect(specFixerArr?.length).toBe(1);
  });
});

// TC-012: runPipeline — retry 上限到達: escalation verdict + SPEC_REVIEW_RETRIES_EXHAUSTED
describe("TC-012: runPipeline — retries exhausted: escalation + SPEC_REVIEW_RETRIES_EXHAUSTED", () => {
  it("sets error.code=SPEC_REVIEW_RETRIES_EXHAUSTED and escalation verdict on last spec-review", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    // Both iterations return needs-fix
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["needs-fix", "needs-fix"]);

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    // spec-review: 2 entries, last verdict is escalation (written by onExceeded)
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(2);
    const lastItem = specReviewArr?.[specReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");

    // error code
    expect(result.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");

    // pipeline completes (status is success — pipeline ran to completion)
    expect(result.status).toBe("success");
  });
});

// TC-013: runPipeline — iter=1 escalation で spec-fixer を起動しない
describe("TC-013: runPipeline — escalation stops loop without invoking spec-fixer", () => {
  it("does not create spec-fixer steps when spec-review returns escalation", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["escalation"] });
    const githubFetch = buildGithubFetch(200, 200, ["escalation"]);

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    // spec-fixer not created
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // spec-review: 1 entry with escalation
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    const lastItem2 = specReviewArr?.[specReviewArr.length - 1];
    const lastVerdict = lastItem2 ? toLegacyStepResult(lastItem2).verdict : undefined;
    expect(lastVerdict).toBe("escalation");

    // Only 2 sessions (propose + 1x spec-review)
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(2);
  });
});

// TC-014: runPipeline — propose 失敗時に loop を起動しない
describe("TC-014: runPipeline — spec-review loop skipped when propose fails", () => {
  it("does not create spec-review session when propose throws", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      proposeFailure: true,
    });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch: buildGithubFetch(),
    });

    // Only propose session was created
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(1);

    // result.status should be failed (propose failed)
    expect(result.status).not.toBe("success");
  });
});

// TC-015: runPipeline — 各 iteration でセッション ID が異なる (fresh-per-task)
describe("TC-015: runPipeline — fresh session IDs per iteration", () => {
  it("spec-review iterations use different session IDs", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client, sessionIds } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["needs-fix", "approved"]);

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(2);

    const iter1SessionId = specReviewArr?.[0] ? toLegacyStepResult(specReviewArr[0]).session?.id : undefined;
    const iter2SessionId = specReviewArr?.[1] ? toLegacyStepResult(specReviewArr[1]).session?.id : undefined;

    expect(iter1SessionId).toBeDefined();
    expect(iter2SessionId).toBeDefined();
    expect(iter1SessionId).not.toBe(iter2SessionId);
  });
});

// TC-016: runPipeline — retries exhausted 時の stdout 出力
describe("TC-016: runPipeline — stdout contains 'retries exhausted, escalating' when limit reached", () => {
  it("writes retries exhausted message to stdout", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["needs-fix", "needs-fix"]);

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("retries exhausted, escalating");
  });
});

// TC-017: runPipeline — Pipeline finished サマリ行の出力
describe("TC-017: runPipeline — Pipeline finished summary line in stdout", () => {
  it("outputs 'Pipeline finished' summary with iterations and verdict", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["needs-fix", "approved"]);

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("Pipeline finished: spec-review iterations=2, final verdict=approved");
  });
});

// TC-018: runPipeline — needs-fix → approved のログ出力順 (should)
describe("TC-018: runPipeline — stdout log order for needs-fix → approved path", () => {
  it("outputs iteration progress in correct order", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["needs-fix", "approved"]);

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    const stdout = stdoutLines.join("");
    // Verify key log lines are present and in order
    const iter1StartIdx = stdout.indexOf("[iter 1/2] starting spec-review");
    const iter1NeedsFixIdx = stdout.indexOf("[iter 1] spec-review verdict: needs-fix → spawning fixer");
    const iter2StartIdx = stdout.indexOf("[iter 2/2] starting spec-review");
    const iter2ApprovedIdx = stdout.indexOf("[iter 2] spec-review verdict: approved → done");
    const finishedIdx = stdout.indexOf("Pipeline finished: spec-review iterations=2, final verdict=approved");

    expect(iter1StartIdx).toBeGreaterThanOrEqual(0);
    expect(iter1NeedsFixIdx).toBeGreaterThanOrEqual(0);
    expect(iter2StartIdx).toBeGreaterThanOrEqual(0);
    expect(iter2ApprovedIdx).toBeGreaterThanOrEqual(0);
    expect(finishedIdx).toBeGreaterThanOrEqual(0);

    // Check ordering
    expect(iter1StartIdx).toBeLessThan(iter1NeedsFixIdx);
    expect(iter1NeedsFixIdx).toBeLessThan(iter2StartIdx);
    expect(iter2StartIdx).toBeLessThan(iter2ApprovedIdx);
    expect(iter2ApprovedIdx).toBeLessThan(finishedIdx);
  });
});

// TC-050: state.step が loop 内で spec-fixer → spec-review へ更新される
describe("TC-050: state.step updated: spec-fixer → spec-review within loop", () => {
  it("persisted state has step='spec-review' after spec-fixer completes", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubFetch = buildGithubFetch(200, 200, ["needs-fix", "approved"]);

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    // Final state should be in spec-review step (last thing that ran)
    expect(result.step).toBe("spec-review");

    // history should contain step-transition entries
    const stepTransitions = result.history.filter(
      (h) => h.step === "step-transition",
    );
    expect(stepTransitions.length).toBeGreaterThan(0);

    // Verify spec-fixer step was in history
    const specFixerHistory = result.history.some(
      (h) => h.message?.includes("spec-fixer"),
    );
    expect(specFixerHistory).toBe(true);
  });
});

// TC-030: runPipeline — 中断耐性: propose 完了後に writeJobState が呼ばれる
// (Retained as persistence verification test)
describe("TC-030: runPipeline — persistence: both propose and spec-review steps saved", () => {
  it("persists both propose and spec-review results in job state file", async () => {

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubFetch = buildGithubFetch(200, 200, ["approved"]);

    const stateFilePath = path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`);

    await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    // Verify the final persisted state has both steps recorded
    const finalStateRaw = await fs.readFile(stateFilePath, "utf-8");
    const finalState = JSON.parse(finalStateRaw);
    expect(finalState.steps?.["propose"]).toBeDefined();
    expect(finalState.steps?.["spec-review"]).toBeDefined();
  });
});
