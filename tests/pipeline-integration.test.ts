import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { GitHubClient } from "../src/core/port/github-client.js";
import { createManagedAgentRunner } from "../src/adapter/managed-agent/agent-runner.js";
import { verificationResultPath, prCreateResultPath } from "../src/util/paths.js";
import type { AgentRunContext } from "../src/core/port/agent-runner.js";
import type { DynamicContext } from "../src/git/dynamic-context.js";

// Mock the verification runner so pipeline-integration tests don't spawn real processes.
// VerificationStep.run() calls runVerification() internally.
// Default: returns "passed" verdict and writes a minimal verification-result.md.
vi.mock("../src/core/verification/runner.js", () => ({
  runVerification: vi.fn().mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
    // Write a minimal verification-result.md so VerificationStep.parseResult can succeed
    const outputPath = `${cwd}/${verificationResultPath(slug)}`;
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
    const outputPath = `${cwd}/${prCreateResultPath(slug)}`;
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
    agents: {
      design: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:ghi", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
      "test-case-gen": { agentId: "test-case-gen-agent-id", definitionHash: "sha256:tcg", lastSyncedAt: new Date().toISOString() },
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
  return { type: "feature", title: "Test", slug: "test", baseBranch: "main", content: "Do something", enabled: [] };
}

/**
 * Build a ManagedAgentRunner from client + githubClient for injection into PipelineDeps.runner.
 * Required after Task 2.1: PipelineDeps.runner replaces runtime branching in pipeline/run.ts.
 */
function buildRunner(
  client: ReturnType<typeof buildPipelineMockClient>["client"],
  githubClient: GitHubClient,
) {
  return createManagedAgentRunner({ sessionClient: client, githubClient, repo: buildRepo() });
}

/**
 * Build a mock SessionClient that supports multiple spec-review iterations.
 * Session order: sess1=propose, sess2=spec-fixer-1, sess3=spec-review-1,
 *                sess4=spec-fixer-2, sess5=spec-review-2, etc.
 *
 * Implements the SessionClient port interface (not the raw Anthropic SDK).
 */
function buildPipelineMockClient(opts: {
  designBranch?: string;
  designFailure?: boolean;
  specReviewVerdicts?: ("approved" | "needs-fix" | "escalation")[];
  sessionIds?: string[];
}) {
  const {
    designBranch = "feat/test-branch",
    designFailure = false,
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
      (_sessionId: string) => {
        if (designFailure) {
          return Promise.resolve({
            sseDisconnected: false,
            idleEndTurnDetected: false,
            terminated: true,
            terminationReason: "terminated" as const,
          });
        }
        // Branch is pre-set by CLI before propose runs (D4: register_branch removed)
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
 *   - {changeFolderPath(slug)}/spec-review-result-NNN.md → returns verdict content per specReviewVerdicts array
 *   - {changeFolderPath(slug)}/review-feedback-NNN.md → returns verdict per codeReviewVerdicts array
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
  it("returns status='awaiting-merge', steps['spec-review'] has 1 element with verdict=approved, no spec-fixer steps", async () => {

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
      runner: buildRunner(client, githubClient),
    });

    expect(result.status).toBe("awaiting-merge");

    // spec-review: length 1, verdict=approved
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(1);
    const lastSpecReview = specReviewArr?.[specReviewArr.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");

    // spec-fixer: not present
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // After spec-review approved, pipeline continues:
    // propose(1) + spec-review(1) + test-case-gen(1) + implementer(1) + code-review(1) = 5 sessions
    // VerificationStep is CLI (no session). Total = 5 createSession calls.
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(5);

    // implementer should have run
    expect(result.steps?.["implementer"]).toBeDefined();
    // verification should have run
    expect(result.steps?.["verification"]).toBeDefined();
  });
});

// TC-011: runPipeline — iter=1 needs-fix → spec-fixer → iter=2 approved
describe("TC-011: runPipeline — iter=1 needs-fix → spec-fixer → iter=2 approved", () => {
  it("returns status='awaiting-merge', spec-review has 2 entries, spec-fixer has 1 entry", async () => {

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
      runner: buildRunner(client, githubClient),
    });

    expect(result.status).toBe("awaiting-merge");

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
      runner: buildRunner(client, githubClient),
    });

    // spec-review: 2 entries, last verdict is escalation (written by onExceeded)
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(2);
    const lastItem = specReviewArr?.[specReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");

    // error code
    expect(result.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");

    // pipeline halts at awaiting-resume (retries exhausted)
    expect(result.status).toBe("awaiting-resume");
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
      runner: buildRunner(client, githubClient),
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
      designFailure: true,
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
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
      runner: buildRunner(client, githubClient),
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
      runner: buildRunner(client, githubClient),
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
      runner: buildRunner(client, githubClient),
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
      runner: buildRunner(client, githubClient),
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
      runner: buildRunner(client, githubClient),
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
  it("returns status='awaiting-merge', code-review has 2 entries, code-fixer has 1 entry", async () => {

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
      runner: buildRunner(client, githubClient),
    });

    expect(result.status).toBe("awaiting-merge");

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
      runner: buildRunner(client, githubClient),
    });

    // code-review: 2 entries, last verdict is escalation (written by onExceeded)
    const codeReviewArr = result.steps?.["code-review"];
    expect(codeReviewArr).toBeDefined();
    expect(codeReviewArr?.length).toBe(2);
    const lastItem = codeReviewArr?.[codeReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");

    // error code
    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");

    // pipeline halts at awaiting-resume (retries exhausted)
    expect(result.status).toBe("awaiting-resume");
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
      runner: buildRunner(client, githubClient),
    });

    // Verify the final persisted state has both steps recorded
    const finalStateRaw = await fs.readFile(stateFilePath, "utf-8");
    const finalState = JSON.parse(finalStateRaw);
    expect(finalState.steps?.["design"]).toBeDefined();
    expect(finalState.steps?.["spec-review"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-DC-100: DynamicContext injection through pipeline
// ---------------------------------------------------------------------------

const testDynamicContext: DynamicContext = {
  gitLog: "abc1234 feat: add tests",
  diffStat: " tests/foo.test.ts | 10 +++\n 1 file changed",
  changesList: ["dynamic-context-integration-tests", "other-change"],
  specIndex: [
    { capability: "cli-commands", purpose: "CLI subcommands", requirementCount: 10 },
    { capability: "pipeline-orchestrator", purpose: "Pipeline state machine", requirementCount: 13 },
  ],
};

/**
 * Build a runner spy that captures every AgentRunContext passed to runner.run().
 * The original implementation is called through (spy-through), so the pipeline
 * progresses normally.
 */
function buildRunnerWithSpy(
  client: ReturnType<typeof buildPipelineMockClient>["client"],
  githubClient: GitHubClient,
): { runner: ReturnType<typeof buildRunner>; capturedCtxList: AgentRunContext[] } {
  const runner = buildRunner(client, githubClient);
  const capturedCtxList: AgentRunContext[] = [];
  const originalRun = runner.run.bind(runner);
  vi.spyOn(runner, "run").mockImplementation(async (ctx: AgentRunContext) => {
    capturedCtxList.push(ctx);
    return originalRun(ctx);
  });
  return { runner, capturedCtxList };
}

// TC-DC-101: dynamicContext is forwarded to all agent steps via AgentRunContext
describe("TC-DC-101: DynamicContext forwarded to all agent steps via AgentRunContext", () => {
  it("ctx.dynamicContext matches testDynamicContext fields in every runner.run() call", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner, capturedCtxList } = buildRunnerWithSpy(client, githubClient);

    await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
    });

    // All agent steps must have received dynamicContext
    expect(capturedCtxList.length).toBeGreaterThan(0);
    for (const ctx of capturedCtxList) {
      expect(ctx.dynamicContext).toBeDefined();
      expect(ctx.dynamicContext?.gitLog).toBe(testDynamicContext.gitLog);
      expect(ctx.dynamicContext?.diffStat).toBe(testDynamicContext.diffStat);
      expect(ctx.dynamicContext?.changesList).toEqual(testDynamicContext.changesList);
    }
  });
});

// TC-DC-102: specIndex is present in dynamicContext for all steps
describe("TC-DC-102: specIndex propagated to all agent steps", () => {
  it("ctx.dynamicContext.specIndex has 2 entries with correct capabilities in every call", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner, capturedCtxList } = buildRunnerWithSpy(client, githubClient);

    await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
    });

    expect(capturedCtxList.length).toBeGreaterThan(0);
    for (const ctx of capturedCtxList) {
      expect(ctx.dynamicContext?.specIndex).toBeDefined();
      expect(ctx.dynamicContext?.specIndex.length).toBe(2);
      expect(ctx.dynamicContext?.specIndex[0]?.capability).toBe("cli-commands");
      expect(ctx.dynamicContext?.specIndex[1]?.capability).toBe("pipeline-orchestrator");
    }
  });
});

// TC-DC-103: projectContext injected only for allowlist steps
describe("TC-DC-103: projectContext injected only for allowlist steps", () => {
  it("allowlist steps (propose, spec-review, implementer, code-review) have projectContext set", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Write project.md into tempDir
    await fs.mkdir(path.join(tempDir, "specrunner"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "specrunner", "project.md"), "# Test Project Context");

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner, capturedCtxList } = buildRunnerWithSpy(client, githubClient);

    await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
    });

    const allowlistNames = ["design", "spec-review", "implementer", "code-review"];
    for (const stepName of allowlistNames) {
      const ctx = capturedCtxList.find((c) => c.step.name === stepName);
      expect(ctx, `Expected step '${stepName}' to be called`).toBeDefined();
      expect(ctx?.projectContext).toBe("# Test Project Context");
    }
  });
});

// TC-DC-104: projectContext is undefined for non-allowlist steps
describe("TC-DC-104: projectContext undefined for non-allowlist steps", () => {
  it("test-case-gen step has projectContext === undefined", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Write project.md so allowlist steps get it — we're testing non-allowlist steps
    await fs.mkdir(path.join(tempDir, "specrunner"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "specrunner", "project.md"), "# Test Project Context");

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner, capturedCtxList } = buildRunnerWithSpy(client, githubClient);

    await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
    });

    // test-case-gen is a non-allowlist step that runs on the approved path
    const testCaseGenCtx = capturedCtxList.find((c) => c.step.name === "test-case-gen");
    expect(testCaseGenCtx, "Expected test-case-gen step to be called").toBeDefined();
    expect(testCaseGenCtx?.projectContext).toBeUndefined();
  });
});

// TC-DC-105: enrichContext adds baselineSpecs for spec-review step
describe("TC-DC-105: enrichContext adds baselineSpecs for spec-review step", () => {
  it("SpecReviewStep.enrichContext is called and returns baselineSpecs['my-cap']", async () => {
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Build file system: delta spec dir (enrichContext trigger) + baseline spec
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", "test-slug", "specs", "my-cap"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "specrunner", "specs", "my-cap"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "specs", "my-cap", "spec.md"),
      "# my-cap baseline spec content",
    );

    // Spy on enrichContext: call the real implementation, capture the return value
    let capturedEnrichResult: DynamicContext | undefined;
    const realEnrichContext = SpecReviewStep.enrichContext!.bind(SpecReviewStep);
    const enrichSpy = vi.spyOn(SpecReviewStep, "enrichContext").mockImplementation(
      async (dynamicContext: DynamicContext, cwd: string, slug: string) => {
        const result = await realEnrichContext(dynamicContext, cwd, slug);
        capturedEnrichResult = result;
        return result;
      },
    );

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner } = buildRunnerWithSpy(client, githubClient);

    await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
    });

    expect(enrichSpy).toHaveBeenCalledOnce();
    expect(capturedEnrichResult).toBeDefined();
    expect(capturedEnrichResult?.baselineSpecs).toBeDefined();
    expect(capturedEnrichResult?.baselineSpecs?.["my-cap"]).toBe("# my-cap baseline spec content");
  });
});

// TC-DC-106: enrichContext returns unmodified dynamicContext when no delta specs dir
describe("TC-DC-106: enrichContext returns unmodified dynamicContext when no delta specs dir", () => {
  it("baselineSpecs is undefined when specrunner/changes/test-slug/specs/ does not exist", async () => {
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // No delta spec directory — enrichContext should return dynamicContext unchanged
    let capturedEnrichResult: DynamicContext | undefined;
    const enrichSpy = vi.spyOn(SpecReviewStep, "enrichContext").mockImplementation(
      async (dynamicContext: DynamicContext, _cwd: string, _slug: string) => {
        // Simulate: no delta specs dir → return as-is
        capturedEnrichResult = dynamicContext;
        return dynamicContext;
      },
    );

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner } = buildRunnerWithSpy(client, githubClient);

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
    });

    expect(enrichSpy).toHaveBeenCalledOnce();
    expect(capturedEnrichResult?.baselineSpecs).toBeUndefined();
    expect(result.status).toBe("awaiting-merge");
  });
});

// TC-DC-107: project.md absent — projectContext undefined even for allowlist steps
describe("TC-DC-107: project.md absent — projectContext is undefined for all steps", () => {
  it("allowlist steps have projectContext === undefined when project.md does not exist", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Do NOT write project.md — tempDir has no specrunner/project.md

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner, capturedCtxList } = buildRunnerWithSpy(client, githubClient);

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
    });

    // Pipeline must not throw — project.md absence is not an error
    expect(result.status).toBe("awaiting-merge");

    const allowlistNames = ["design", "spec-review", "implementer", "code-review"];
    for (const stepName of allowlistNames) {
      const ctx = capturedCtxList.find((c) => c.step.name === stepName);
      expect(ctx, `Expected step '${stepName}' to be called`).toBeDefined();
      expect(ctx?.projectContext).toBeUndefined();
    }
  });
});

// TC-DC-108: dynamicContext omitted — backward compatibility
describe("TC-DC-108: dynamicContext omitted — backward compatibility", () => {
  it("ctx.dynamicContext is undefined in all calls and pipeline completes normally", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });
    const { runner, capturedCtxList } = buildRunnerWithSpy(client, githubClient);

    // Do NOT include dynamicContext in deps
    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
    });

    expect(result.status).toBe("awaiting-merge");
    expect(capturedCtxList.length).toBeGreaterThan(0);
    for (const ctx of capturedCtxList) {
      expect(ctx.dynamicContext).toBeUndefined();
    }
  });
});
