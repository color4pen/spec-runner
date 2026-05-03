import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { GitHubClient } from "../src/core/port/github-client.js";

// Mock the verification runner so pipeline-integration tests don't spawn real processes.
// VerificationStep.run() calls runVerification() internally.
// Default: returns "passed" verdict and writes a minimal verification-result.md.
vi.mock("../src/core/verification/runner.js", () => ({
  runVerification: vi.fn().mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
    // Write a minimal verification-result.md so VerificationStep.parseResult can succeed
    const outputPath = `${cwd}/openspec/changes/${slug}/verification-result.md`;
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(outputPath, `# Verification Result — ${slug} — iter 1\n\n## Verdict: passed\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n`)
    );
    return {
      slug,
      verdict: "passed" as const,
      phases: [],
    };
  }),
}));

// Mock the pr-create runner so pipeline-integration tests don't spawn real gh CLI.
// PrCreateStep.run() calls runPrCreate() internally.
// Default: returns "created" status and writes a minimal pr-create-result.md.
vi.mock("../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn().mockImplementation(async (input: { branch: string; baseBranch: string; title: string; body: string; cwd?: string }) => {
    const cwd = input.cwd ?? process.cwd();
    const slug = "test-slug"; // integration tests use this slug
    const outputPath = `${cwd}/openspec/changes/${slug}/pr-create-result.md`;
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(outputPath, `# pr-create Result — ${slug}\n\n## Status: success\n\n## PR\n\n- **URL**: https://github.com/testowner/testrepo/pull/1\n- **Number**: 1\n`)
    );
    return {
      status: "created" as const,
      url: "https://github.com/testowner/testrepo/pull/1",
      number: 1,
    };
  }),
}));

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
    agents: {
      propose: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:ghi", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
      "implementer": { agentId: "implementer-agent-id", definitionHash: "sha256:imp", lastSyncedAt: new Date().toISOString() },
      "build-fixer": { agentId: "build-fixer-agent-id", definitionHash: "sha256:bfx", lastSyncedAt: new Date().toISOString() },
      "code-review": { agentId: "code-review-agent-id", definitionHash: "sha256:crv", lastSyncedAt: new Date().toISOString() },
      "code-fixer": { agentId: "code-fixer-agent-id", definitionHash: "sha256:cfx", lastSyncedAt: new Date().toISOString() },
    },
    pipeline: { maxRetries: 2 },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
    specReview: { pollIntervalMs: 100 },
    ...overrides,
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "feature", title: "Test", slug: "test", content: "Do something", enabled: [] };
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
 * Build a mock GitHubClient (port interface) for pipeline integration tests.
 *
 * - verifyBranch: returns branchFound (default true)
 * - getRawFile:
 *   - openspec/changes/<slug>/spec-review-result-NNN.md → returns verdict content per specReviewVerdicts array
 *   - openspec/changes/<slug>/review-feedback-NNN.md → returns verdict per codeReviewVerdicts array
 *   - change-folder probe (proposal.md) → returns "exists" if folderFound else null
 *
 * Uses endsWith matching so slug-prefix differences do not mask wrong paths.
 */
function buildMockGithubClient(opts: {
  branchFound?: boolean;
  folderFound?: boolean;
  specReviewVerdicts?: ("approved" | "needs-fix" | "escalation")[];
  codeReviewVerdicts?: ("approved" | "needs-fix" | "escalation")[];
  /** @deprecated use codeReviewVerdicts */
  codeReviewVerdict?: "approved" | "needs-fix" | "escalation";
} = {}): GitHubClient {
  const {
    branchFound = true,
    folderFound = true,
    specReviewVerdicts = ["approved"],
    codeReviewVerdict = "approved",
  } = opts;
  const codeReviewVerdicts = opts.codeReviewVerdicts ?? [codeReviewVerdict];

  let specReviewCallCount = 0;
  let codeReviewCallCount = 0;

  return {
    verifyBranch: vi.fn().mockResolvedValue(branchFound),
    verifyPath: vi.fn().mockResolvedValue(folderFound),
    getRawFile: vi.fn().mockImplementation(async (_owner: string, _repo: string, _branch: string, filePath: string) => {
      // Spec-review result file: path ends with spec-review-result-NNN.md
      if (/spec-review-result-\d{3}\.md$/.test(filePath)) {
        const verdict = specReviewVerdicts[specReviewCallCount] ?? specReviewVerdicts[specReviewVerdicts.length - 1]!;
        specReviewCallCount++;
        return `- **verdict**: ${verdict}\n\n## Findings\n\n| # | Severity | Category | File | Description | How to Fix |\n|---|---|---|---|---|---|\n| 1 | HIGH | completeness | tasks.md | Missing tests | Add tests |`;
      }
      // Code-review feedback file: path ends with review-feedback-NNN.md
      if (/review-feedback-\d{3}\.md$/.test(filePath)) {
        const verdict = codeReviewVerdicts[codeReviewCallCount] ?? codeReviewVerdicts[codeReviewVerdicts.length - 1]!;
        codeReviewCallCount++;
        return `- **verdict**: ${verdict}\n\n## Findings\n\n| # | Severity | Category | File | Description | How to Fix |\n|---|---|---|---|---|---|\n`;
      }
      return null;
    }),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
  };
}

// TC-010: runPipeline — iter=1 approved で spec-fixer を起動しない
describe("TC-010: runPipeline — iter=1 approved: spec-fixer not invoked", () => {
  it("returns status='success', steps['spec-review'] has 1 element with verdict=approved, no spec-fixer steps", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
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

    // After spec-review approved, pipeline continues:
    // propose(1) + spec-review(1) + implementer(1) + code-review(1) = 4 sessions
    // VerificationStep is CLI (no session). Total = 4 createSession calls.
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(4);

    // implementer should have run
    expect(result.steps?.["implementer"]).toBeDefined();
    // verification should have run
    expect(result.steps?.["verification"]).toBeDefined();
  });
});

// TC-011: runPipeline — iter=1 needs-fix → spec-fixer → iter=2 approved
describe("TC-011: runPipeline — iter=1 needs-fix → spec-fixer → iter=2 approved", () => {
  it("returns status='success', spec-review has 2 entries, spec-fixer has 1 entry", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
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

    // After spec-review approved, pipeline continues through implementer → verification → end
    expect(result.steps?.["implementer"]).toBeDefined();
    expect(result.steps?.["verification"]).toBeDefined();
  });
});

// TC-012: runPipeline — retry 上限到達: escalation verdict + SPEC_REVIEW_RETRIES_EXHAUSTED
describe("TC-012: runPipeline — retries exhausted: escalation + SPEC_REVIEW_RETRIES_EXHAUSTED", () => {
  it("sets error.code=SPEC_REVIEW_RETRIES_EXHAUSTED and escalation verdict on last spec-review", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Both iterations return needs-fix
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "needs-fix"] });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
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

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["escalation"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["escalation"] });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
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

    const { runPipeline } = await import("../src/core/pipeline/index.js");
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
      githubClient: buildMockGithubClient(),
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

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client, sessionIds } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
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

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "needs-fix"] });

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
      githubClient,
    });

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("retries exhausted, escalating");
  });
});

// TC-017: runPipeline — Pipeline finished サマリ行の出力
describe("TC-017: runPipeline — Pipeline finished summary line in stdout", () => {
  it("outputs 'Pipeline finished' summary with iterations and verdict", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

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
      githubClient,
    });

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("Pipeline finished: spec-review iterations=2, final verdict=approved");
  });
});

// TC-018: runPipeline — needs-fix → approved のログ出力順 (should)
// Note: After spec-review approved, pipeline continues to implementer → verification → end.
// "[iter N] spec-review verdict: approved → done" is only logged when the pipeline terminates
// at spec-review (i.e., when nextStep is "end"). With the new flow, approved → implementer,
// so that log line does not appear. Instead, the pipeline finishes after verification passes.
describe("TC-018: runPipeline — stdout log order for needs-fix → approved path", () => {
  it("outputs iteration progress in correct order", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

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
      githubClient,
    });

    const stdout = stdoutLines.join("");
    // Verify key log lines are present and in order
    const iter1StartIdx = stdout.indexOf("[iter 1/2] starting spec-review");
    const iter1NeedsFixIdx = stdout.indexOf("[iter 1] spec-review verdict: needs-fix → spawning fixer");
    const iter2StartIdx = stdout.indexOf("[iter 2/2] starting spec-review");
    // After approved, pipeline goes to implementer (not end), so "approved → done" is not logged.
    // Instead, the pipeline summary is printed when verification completes.
    const finishedIdx = stdout.indexOf("Pipeline finished: spec-review iterations=2, final verdict=approved");

    expect(iter1StartIdx).toBeGreaterThanOrEqual(0);
    expect(iter1NeedsFixIdx).toBeGreaterThanOrEqual(0);
    expect(iter2StartIdx).toBeGreaterThanOrEqual(0);
    expect(finishedIdx).toBeGreaterThanOrEqual(0);

    // Check ordering
    expect(iter1StartIdx).toBeLessThan(iter1NeedsFixIdx);
    expect(iter1NeedsFixIdx).toBeLessThan(iter2StartIdx);
    expect(iter2StartIdx).toBeLessThan(finishedIdx);
  });
});

// TC-050: state.step が loop 内で spec-fixer → spec-review へ更新される
describe("TC-050: state.step updated: spec-fixer → spec-review within loop", () => {
  it("persisted state has step='spec-review' after spec-fixer completes", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
    });

    // After spec-review approved → implementer → verification → code-review → pr-create → end.
    // The final step in state is "pr-create" (last step before pipeline ends).
    expect(result.step).toBe("pr-create");

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

// TC-060: runPipeline — code-review needs-fix → code-fixer → code-review approved
describe("TC-060: runPipeline — code-review needs-fix → code-fixer → code-review approved", () => {
  it("returns status='success', code-review has 2 entries, code-fixer has 1 entry", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_propose_001",
        "sess_spec_review_001",
        "sess_implementer_001",
        "sess_code_review_001",
        "sess_code_fixer_001",
        "sess_code_review_002",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
      codeReviewVerdicts: ["needs-fix", "approved"],
    });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
    });

    expect(result.status).toBe("success");

    // code-review: 2 entries
    const codeReviewArr = result.steps?.["code-review"];
    expect(codeReviewArr).toBeDefined();
    expect(codeReviewArr?.length).toBe(2);
    expect(codeReviewArr?.[0] ? toLegacyStepResult(codeReviewArr[0]).verdict : undefined).toBe("needs-fix");
    expect(codeReviewArr?.[1] ? toLegacyStepResult(codeReviewArr[1]).verdict : undefined).toBe("approved");

    // code-fixer: 1 entry
    const codeFixerArr = result.steps?.["code-fixer"];
    expect(codeFixerArr).toBeDefined();
    expect(codeFixerArr?.length).toBe(1);

    // getRawFile must have been called with review-feedback-NNN.md paths (not spec-review-result)
    const getRawFileCalls = (githubClient.getRawFile as ReturnType<typeof vi.fn>).mock.calls;
    const codeReviewPaths = getRawFileCalls
      .map((c: unknown[]) => c[3] as string)
      .filter((p: string) => /review-feedback-\d{3}\.md$/.test(p));
    expect(codeReviewPaths.length).toBe(2);
    expect(codeReviewPaths[0]).toMatch(/review-feedback-\d{3}\.md$/);
  });
});

// TC-061: runPipeline — code-review retries exhausted → CODE_REVIEW_RETRIES_EXHAUSTED
describe("TC-061: runPipeline — code-review retries exhausted: escalation + CODE_REVIEW_RETRIES_EXHAUSTED", () => {
  it("sets error.code=CODE_REVIEW_RETRIES_EXHAUSTED and escalation verdict on last code-review", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Both code-review iterations return needs-fix
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_propose_001",
        "sess_spec_review_001",
        "sess_implementer_001",
        "sess_code_review_001",
        "sess_code_fixer_001",
        "sess_code_review_002",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
      codeReviewVerdicts: ["needs-fix", "needs-fix"],
    });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
    });

    // code-review: 2 entries, last verdict is escalation (written by onExceeded)
    const codeReviewArr = result.steps?.["code-review"];
    expect(codeReviewArr).toBeDefined();
    expect(codeReviewArr?.length).toBe(2);
    const lastItem = codeReviewArr?.[codeReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");

    // error code
    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");

    // pipeline completes (status is success — pipeline ran to completion)
    expect(result.status).toBe("success");
  });
});

// TC-030: runPipeline — 中断耐性: propose 完了後に writeJobState が呼ばれる
// (Retained as persistence verification test)
describe("TC-030: runPipeline — persistence: both propose and spec-review steps saved", () => {
  it("persists both propose and spec-review results in job state file", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    const stateFilePath = path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`);

    await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
    });

    // Verify the final persisted state has both steps recorded
    const finalStateRaw = await fs.readFile(stateFilePath, "utf-8");
    const finalState = JSON.parse(finalStateRaw);
    expect(finalState.steps?.["propose"]).toBeDefined();
    expect(finalState.steps?.["spec-review"]).toBeDefined();
  });
});
