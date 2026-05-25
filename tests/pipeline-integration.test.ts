import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import type { GitHubClient } from "../src/core/port/github-client.js";
import { createManagedAgentRunner } from "../src/adapter/managed-agent/agent-runner.js";
import { verificationResultPath, prCreateResultPath } from "../src/util/paths.js";
import type { AgentRunContext, AgentRunResult } from "../src/core/port/agent-runner.js";
import type { DynamicContext } from "../src/git/dynamic-context.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { SpawnFn as GitSpawnFn } from "../src/util/git-exec.js";
import { JobStateStore } from "../src/store/job-state-store.js";
import { makeStoreFactory } from "./helpers/store-factory.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

// Mock validateDeltaSpecPaths so integration tests don't read real fs for delta-spec validation.
// Default: returns { ok: true } (approved). Override per-test for needs-fix scenarios.
vi.mock("../src/core/spec/delta-spec-validator.js", () => ({
  validateDeltaSpecPaths: vi.fn().mockResolvedValue({ ok: true }),
}));

import { validateDeltaSpecPaths } from "../src/core/spec/delta-spec-validator.js";
const mockDeltaSpecValidator = validateDeltaSpecPaths as ReturnType<typeof vi.fn>;

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

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-integration-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  // Reset delta-spec-validator mock to default (approved) before each test
  mockDeltaSpecValidator.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJobState() {
  return JobStateStore.create(tempDir, {
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
      "delta-spec-fixer": { agentId: "delta-spec-fixer-agent-id", definitionHash: "sha256:dsf", lastSyncedAt: new Date().toISOString() },
      "adr-gen": { agentId: "adr-gen-agent-id", definitionHash: "sha256:adr", lastSyncedAt: new Date().toISOString() },
    },
    pipeline: { maxRetries: 2 },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    specReview: { pollIntervalMs: 100 },
    ...overrides,
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "feature", title: "Test", slug: "test", baseBranch: "main", content: "Do something", adr: false };
}

/**
 * Build a ManagedAgentRunner from client + githubClient for injection into PipelineDeps.runner.
 * Required after Task 2.1: PipelineDeps.runner replaces runtime branching in pipeline/run.ts.
 */
function buildRunner(
  client: ReturnType<typeof buildPipelineMockClient>["client"],
  githubClient: GitHubClient,
) {
  return createManagedAgentRunner({ sessionClient: client, githubClient, repo: buildRepo(), githubToken: "ghp_test" });
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
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
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
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
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
      request: buildRequest(),
      slug: "test-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
    // design(1) + spec-review(1) + test-case-gen(1) + implementer(1) + code-review(1) + adr-gen(1) = 6 sessions
    // VerificationStep is CLI (no session). Total = 6 createSession calls.
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(6);

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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
// New semantic: spec-fixer maxIter → spec-review +1 bypass → still needs-fix → escalation
describe("TC-012: runPipeline — retries exhausted: escalation + SPEC_REVIEW_RETRIES_EXHAUSTED", () => {
  it("sets error.code=SPEC_REVIEW_RETRIES_EXHAUSTED and escalation verdict on last spec-review", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // All 3 spec-review iterations return needs-fix (maxRetries=2, +1 bypass review = 3 total)
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix", "needs-fix"],
      sessionIds: [
        "sess_propose_001",
        "sess_spec_review_001",
        "sess_spec_fixer_001",
        "sess_spec_review_002",
        "sess_spec_fixer_002",
        "sess_spec_review_003",
      ],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "needs-fix", "needs-fix"] });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // spec-review: 3 entries (iter1 needs-fix, iter2 needs-fix, iter3 bypass → spec-fixer
    // exhaustion → handleExhausted overwrites the last spec-review entry's verdict to "escalation").
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(3);
    const lastItem = specReviewArr?.[specReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");

    // error code: spec-fixer exhausted after iter3 needs-fix triggers the fixer gate
    expect(result.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");

    // pipeline halts at awaiting-resume (retries exhausted)
    expect(result.status).toBe("awaiting-resume");

    // exhaustionPhase should be "review-after-final-fix" since spec-fixer reached maxIter
    expect(result.resumePoint?.exhaustionPhase).toBe("review-after-final-fix");
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("retries exhausted on spec-review, escalating");
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
// New semantic: code-fixer runs maxIter times → code-review gets +1 bypass → still needs-fix → escalation
describe("TC-061: runPipeline — code-review retries exhausted: escalation + CODE_REVIEW_RETRIES_EXHAUSTED", () => {
  it("sets error.code=CODE_REVIEW_RETRIES_EXHAUSTED and escalation verdict on last code-review (3 reviews)", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // All 3 code-review iterations return needs-fix (maxRetries=2, +1 bypass review = 3 total)
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_propose_001",
        "sess_spec_review_001",
        "sess_test_case_gen_001",
        "sess_implementer_001",
        "sess_code_review_001",
        "sess_code_fixer_001",
        "sess_code_review_002",
        "sess_code_fixer_002",
        "sess_code_review_003",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
      codeReviewVerdicts: ["needs-fix", "needs-fix", "needs-fix"],
    });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // code-review: 3 entries (iter1 needs-fix, iter2 needs-fix, iter3 +1 bypass → escalation)
    const codeReviewArr = result.steps?.["code-review"];
    expect(codeReviewArr).toBeDefined();
    expect(codeReviewArr?.length).toBe(3);
    const lastItem = codeReviewArr?.[codeReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");

    // error code
    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");

    // pipeline halts at awaiting-resume (retries exhausted)
    expect(result.status).toBe("awaiting-resume");

    // exhaustionPhase should be "review-after-final-fix" since code-fixer reached maxIter
    expect(result.resumePoint?.exhaustionPhase).toBe("review-after-final-fix");
  });
});

// TC-062: code-fixer final iter → code-review (+1) approved → awaiting-merge
describe("TC-062: code-fixer final iter reviewed — approved path", () => {
  it("allows +1 review iteration after fixer final iter, completes on approval", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // maxRetries = 2
    // code-review iter 1: needs-fix → code-fixer iter 1
    // code-review iter 2: needs-fix → code-fixer iter 2 (final)
    // code-review iter 3 (+1 bypass): approved → pr-create → end
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_propose_001",
        "sess_spec_review_001",
        "sess_test_case_gen_001",
        "sess_implementer_001",
        "sess_code_review_001",
        "sess_code_fixer_001",
        "sess_code_review_002",
        "sess_code_fixer_002",
        "sess_code_review_003",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
      codeReviewVerdicts: ["needs-fix", "needs-fix", "approved"],
    });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // code-review: 3 entries (iter1 needs-fix, iter2 needs-fix, iter3 +1 bypass approved)
    const codeReviewArr = result.steps?.["code-review"];
    expect(codeReviewArr).toBeDefined();
    expect(codeReviewArr?.length).toBe(3);
    expect(codeReviewArr?.[2] ? toLegacyStepResult(codeReviewArr[2]).verdict : undefined).toBe("approved");

    // code-fixer: 2 entries
    const codeFixerArr = result.steps?.["code-fixer"];
    expect(codeFixerArr).toBeDefined();
    expect(codeFixerArr?.length).toBe(2);
  });
});

// TC-063: spec-review / spec-fixer pair — same behavior as code-review / code-fixer
describe("TC-063: spec-review / spec-fixer pair — fixer final iter reviewed and approved", () => {
  it("allows +1 spec-review iteration after spec-fixer final iter, completes on approval", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // maxRetries = 2
    // spec-review iter 1: needs-fix → spec-fixer iter 1
    // spec-review iter 2: needs-fix → spec-fixer iter 2 (final)
    // spec-review iter 3 (+1 bypass): approved → continues to implementer → end
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix", "approved"],
      sessionIds: [
        "sess_propose_001",
        "sess_spec_review_001",
        "sess_spec_fixer_001",
        "sess_spec_review_002",
        "sess_spec_fixer_002",
        "sess_spec_review_003",
        "sess_test_case_gen_001",
        "sess_implementer_001",
        "sess_code_review_001",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["needs-fix", "needs-fix", "approved"],
      codeReviewVerdicts: ["approved"],
    });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // spec-review: 3 entries (iter1 needs-fix, iter2 needs-fix, iter3 +1 bypass approved)
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(3);
    expect(specReviewArr?.[2] ? toLegacyStepResult(specReviewArr[2]).verdict : undefined).toBe("approved");

    // spec-fixer: 2 entries
    const specFixerArr = result.steps?.["spec-fixer"];
    expect(specFixerArr).toBeDefined();
    expect(specFixerArr?.length).toBe(2);
  });
});

// TC-064: verification / build-fixer pair — fixer final iter reviewed and passed
describe("TC-064: verification / build-fixer pair — fixer final iter verification passes", () => {
  it("allows +1 verification iteration after build-fixer final iter, completes on pass", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const { runVerification } = await import("../src/core/verification/runner.js");
    const jobState = await makeJobState();

    // maxRetries = 2
    // verification iter 1: failed → build-fixer iter 1
    // verification iter 2: failed → build-fixer iter 2 (final)
    // verification iter 3 (+1 bypass): passed → code-review → end
    let verificationCallCount = 0;
    vi.mocked(runVerification).mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
      const outputPath = `${cwd}/${verificationResultPath(slug)}`;
      const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });
      const verdict = verificationCallCount < 2 ? "failed" : "passed";
      verificationCallCount++;
      await fs.writeFile(outputPath, `# Verification Result — ${slug} — iter ${verificationCallCount}\n\n## Verdict: ${verdict}\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n`);
      return {
        slug,
        verdict: verdict as "passed" | "failed",
        phases: [],
      };
    });

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_propose_001",
        "sess_spec_review_001",
        "sess_test_case_gen_001",
        "sess_implementer_001",
        // no session for verification (CLI step)
        "sess_build_fixer_001",
        // no session for verification iter 2
        "sess_build_fixer_002",
        // no session for verification iter 3
        "sess_code_review_001",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
      codeReviewVerdicts: ["approved"],
    });

    const result = await runPipeline(jobState, {
      client: client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // verification: 3 entries (iter1 failed, iter2 failed, iter3 +1 bypass passed)
    const verificationArr = result.steps?.["verification"];
    expect(verificationArr).toBeDefined();
    expect(verificationArr?.length).toBe(3);
    expect(verificationArr?.[2] ? toLegacyStepResult(verificationArr[2]).verdict : undefined).toBe("passed");

    // build-fixer: 2 entries
    const buildFixerArr = result.steps?.["build-fixer"];
    expect(buildFixerArr).toBeDefined();
    expect(buildFixerArr?.length).toBe(2);
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

    const stateFilePath = path.join(tempDir, ".specrunner", "jobs", `${jobState.jobId}.json`);

    await runPipeline(jobState, {
      client: client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // test-case-gen is a non-allowlist step that runs on the approved path
    const testCaseGenCtx = capturedCtxList.find((c) => c.step.name === "test-case-gen");
    expect(testCaseGenCtx, "Expected test-case-gen step to be called").toBeDefined();
    expect(testCaseGenCtx?.projectContext).toBeUndefined();
  });
});

// TC-DC-105: enrichContext is called for spec-review step (Read-tool-pull model)
describe("TC-DC-105: enrichContext is called for spec-review step", () => {
  it("SpecReviewStep.enrichContext is called and returns dynamicContext unchanged", async () => {
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(enrichSpy).toHaveBeenCalledOnce();
    expect(capturedEnrichResult).toBeDefined();
    // Read-tool-pull model: enrichContext returns dynamicContext unchanged
    expect(capturedEnrichResult).toEqual(testDynamicContext);
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(enrichSpy).toHaveBeenCalledOnce();
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      dynamicContext: testDynamicContext,
      cwd: tempDir,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner,
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");
    expect(capturedCtxList.length).toBeGreaterThan(0);
    for (const ctx of capturedCtxList) {
      expect(ctx.dynamicContext).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// T-14: Delta-spec-validation pipeline integration tests
// ---------------------------------------------------------------------------

// TC-DSV-INT-01: design → delta-spec-validation approved → spec-review → awaiting-merge
describe("TC-DSV-INT-01: delta-spec-validation approved is inserted between design and spec-review", () => {
  it("pipeline runs delta-spec-validation with approved verdict and proceeds to spec-review", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Default: mockDeltaSpecValidator returns { ok: true } → approved
    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // delta-spec-validation runs twice: once in 1st phase (after design) and once in 2nd phase (after code-review)
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps, "delta-spec-validation step should be present").toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(1);
    // 1st phase run is always approved (default mock)
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("approved");

    // spec-review must also have run (proving the pipeline proceeded past delta-spec-validation)
    expect(result.steps?.["spec-review"]).toBeDefined();

    // delta-spec-fixer must NOT have run (no violations)
    expect(result.steps?.["delta-spec-fixer"]).toBeUndefined();
  });
});

// TC-DSV-INT-02: design → delta-spec-validation needs-fix → delta-spec-fixer → delta-spec-validation approved → spec-review
describe("TC-DSV-INT-02: delta-spec-validation needs-fix triggers delta-spec-fixer then re-validation", () => {
  it("runs fixer once and re-validates, then proceeds to spec-review", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // First call: violations (needs-fix). Second call: clean (approved).
    mockDeltaSpecValidator
      .mockResolvedValueOnce({
        ok: false,
        violations: [
          {
            path: "/tmp/changes/test-slug/delta-spec.md",
            reason: "legacy-flat-file",
            suggested: "Move to specs/<capability>/spec.md",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true });

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // delta-spec-validation ran at least twice: iter 1 needs-fix, iter 2 approved (1st phase),
    // plus once more in 2nd phase after code-review.
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps).toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(2);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved");

    // delta-spec-fixer ran exactly once
    const dsfSteps = result.steps?.["delta-spec-fixer"];
    expect(dsfSteps).toBeDefined();
    expect(dsfSteps?.length).toBe(1);

    // Pipeline proceeded past delta-spec-validation → spec-review ran
    expect(result.steps?.["spec-review"]).toBeDefined();
  });
});

// TC-DSV-INT-03: delta-spec-validation exceeds maxRetries → DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED
describe("TC-DSV-INT-03: delta-spec-validation retries exhausted → DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED", () => {
  it("sets error.code=DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED and status=awaiting-resume", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Always returns violations so delta-spec-validation always needs-fix
    mockDeltaSpecValidator.mockResolvedValue({
      ok: false,
      violations: [
        {
          path: "/tmp/changes/test-slug/delta-spec.md",
          reason: "legacy-flat-file",
          suggested: "Move to specs/<capability>/spec.md",
        },
      ],
    });

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    // maxRetries: 2 → delta-spec-validation can run at most 2 iterations
    const result = await runPipeline(jobState, {
      client,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED");

    // delta-spec-validation ran maxRetries + 1 times: 2 needs-fix entries feed delta-spec-fixer
    // (which exhausts at fixerIters = 2), plus 1 "last entry overwritten to escalation" entry
    // produced by handleExhausted. dsv is not in loopNames, so its retry is gated by the
    // delta-spec-fixer fixerIters check, not by dsv's own loopIters.
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps).toBeDefined();
    expect(dsvSteps?.length).toBe(3);

    // spec-review must NOT have run (exhausted before reaching it)
    expect(result.steps?.["spec-review"]).toBeUndefined();
  });
});

// TC-P-06 / TC-DSV-INT-05: managed-reset-status-stale-guard regression reproduction
// Observed regression: designer wrote delta-spec/<cap>.md (legacy-flat-dir) with "## ADDED" header
// (missing "Requirements" suffix → missing-requirements-section). Both violations in 1 cycle,
// fixer resolves them, pipeline reaches spec-review and completes.
describe("TC-P-06: managed-reset-status-stale-guard scenario — legacy-flat-dir + missing-requirements-section resolved in one cycle", () => {
  it("resolves both legacy-flat-dir and missing-requirements-section violations and reaches spec-review", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // First call: two violations matching the observed regression in managed-reset-status-stale-guard:
    //   1. legacy-flat-dir  (delta-spec/<cap>.md instead of specs/<cap>/spec.md)
    //   2. missing-requirements-section  ("## ADDED" without "Requirements" suffix)
    // Second call: clean (approved) after fixer corrects both.
    mockDeltaSpecValidator
      .mockResolvedValueOnce({
        ok: false,
        violations: [
          {
            path: "specrunner/changes/managed-reset-status-stale-guard/delta-spec/managed-cli-commands.md",
            reason: "legacy-flat-dir" as const,
            suggested: "Move to specs/managed-cli-commands/spec.md",
          },
          {
            path: "specrunner/changes/managed-reset-status-stale-guard/delta-spec/managed-cli-commands.md",
            reason: "missing-requirements-section" as const,
            suggested: "Replace '## ADDED' with '## ADDED Requirements'",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true });

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // delta-spec-validation ran at least twice (1st phase: needs-fix + approved; 2nd phase: approved after code-review)
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps).toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(2);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved");

    // delta-spec-fixer ran exactly once to fix both violations
    const dsfSteps = result.steps?.["delta-spec-fixer"];
    expect(dsfSteps).toBeDefined();
    expect(dsfSteps?.length).toBe(1);

    // Pipeline proceeded to spec-review after both violations were resolved
    expect(result.steps?.["spec-review"]).toBeDefined();
  });
});

// TC-DSV-INT-04: delta-spec-validation and spec-review maintain independent iteration counters
describe("TC-DSV-INT-04: delta-spec-validation and spec-review loops are independently counted", () => {
  it("both loops run to completion with separate counters, neither prevents the other", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // delta-spec-validation: needs-fix on first call (initial phase), approved on subsequent calls
    mockDeltaSpecValidator
      .mockResolvedValueOnce({
        ok: false,
        violations: [
          {
            path: "/tmp/changes/test-slug/delta-spec.md",
            reason: "legacy-flat-file",
            suggested: "Move to specs/<capability>/spec.md",
          },
        ],
      })
      .mockResolvedValue({ ok: true });

    // spec-review: needs-fix on first call, approved on second
    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["needs-fix", "approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

    // maxRetries: 4 — higher budget so delta-spec-validation running 3 times (1 needs-fix +
    // 2 approved in spec-review cycle) and spec-review running 2 times don't exhaust the shared budget.
    // This proves that the two loops' counters are tracked independently: dsv's 3 runs do NOT
    // prevent spec-review from getting 2 runs.
    const result = await runPipeline(jobState, {
      client,
      config: buildConfig({ pipeline: { maxRetries: 4 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // Pipeline must complete normally — both loops resolved within their budgets
    expect(result.status).toBe("awaiting-merge");

    // delta-spec-validation ran at least 3 times (2nd phase adds one more after code-review):
    //   iter 1: needs-fix (initial phase) → delta-spec-fixer
    //   iter 2: approved → spec-review (1st iter, 1st phase)
    //   iter 3: approved (after spec-fixer) → spec-review (2nd iter, 1st phase)
    //   iter 4: approved (2nd phase, after code-review)
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps).toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(3);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved");
    expect(toLegacyStepResult(dsvSteps![2]!).verdict).toBe("approved");

    // spec-review ran 2 times independently — delta-spec-validation's 3 runs did not prevent this
    const specReviewSteps = result.steps?.["spec-review"];
    expect(specReviewSteps).toBeDefined();
    expect(specReviewSteps?.length).toBe(2);
    expect(toLegacyStepResult(specReviewSteps![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(specReviewSteps![1]!).verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-AGENT-COMMIT-INT-001: implementer self-commit → pipeline does not halt
// Reproduces the finish-phase0-local-conflict-check scenario (issue #275):
// - implementer agent self-commits (HEAD advances, no staged changes after)
// - pipeline should NOT halt — executor detects HEAD advancement and pushes as-is
// - verification step runs after implementer completes
// ---------------------------------------------------------------------------

describe("TC-AGENT-COMMIT-INT-001: implementer self-commit — pipeline does not halt, verification proceeds", () => {
  it("pipeline continues to verification when implementer self-commits and HEAD advances", async () => {
    // Build a git SpawnFn that simulates the agent self-commit scenario:
    // 1. rev-parse HEAD (before implementer runs) → "before-sha-abc"
    // 2. git add -A → exit 0
    // 3. git diff --cached --quiet → exit 0 (no staged, agent already committed)
    // 4. rev-parse HEAD (inside commitAndPush) → "after-sha-def" (HEAD advanced!)
    // 5. git push → exit 0

    let revParseCallCount = 0;
    const gitCallLog: string[][] = [];

    const gitSpawnFn: GitSpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
      gitCallLog.push([...args]);
      const subcommand = args[0] ?? "";

      let exitCode = 0;
      let stdout = "";

      if (subcommand === "rev-parse") {
        // First call: HEAD before step; second call: HEAD after step (advanced)
        stdout = revParseCallCount === 0 ? "abc123before000000000000000000000000000" : "def456after000000000000000000000000000";
        revParseCallCount++;
      } else if (subcommand === "diff") {
        // No staged changes (agent committed its own changes)
        exitCode = 0;
      }
      // add, push, and all others exit 0

      const procEm = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procAny = procEm as any;
      const stdoutEm = new EventEmitter();
      procAny.stdout = stdoutEm;
      procAny.stderr = new EventEmitter();
      procAny.stdin = { write: () => true, end: () => {} };

      setImmediate(() => {
        if (stdout) stdoutEm.emit("data", Buffer.from(stdout));
        procEm.emit("close", exitCode);
      });

      return procEm as unknown as ChildProcess;
    };

    // Mock AgentRunner that returns success for all steps (no real SDK required)
    const mockAgentRunner = {
      async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
        return { completionReason: "success", resultContent: null };
      },
    };

    // Imports needed to build the mini-pipeline
    const { Pipeline } = await import("../src/core/pipeline/pipeline.js");
    const { StepExecutor } = await import("../src/core/step/executor.js");
    const { EventBus } = await import("../src/core/event/event-bus.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { VerificationStep } = await import("../src/core/step/verification.js");

    const events = new EventBus();
    // Inject the git SpawnFn and a no-op sleep to avoid real 5s waits
    const executor = new StepExecutor(events, mockAgentRunner, makeStoreFactory(tempDir), gitSpawnFn, async () => {});

    // Minimal transitions: implementer → verification → end
    const miniTransitions = [
      { step: "implementer", on: "success", to: "verification" },
      { step: "implementer", on: "error", to: "escalate" },
      { step: "verification", on: "passed", to: "end" },
      { step: "verification", on: "failed", to: "escalate" },
      { step: "verification", on: "escalation", to: "escalate" },
    ];

    const miniSteps = new Map<string, import("../src/core/step/types.js").Step>([
      ["implementer", ImplementerStep],
      ["verification", VerificationStep],
    ]);

    const pipeline = new Pipeline({
      steps: miniSteps,
      transitions: miniTransitions,
      maxIterations: 1,
      executor,
      events,
      loopName: "verification",
    });

    // Job state with branch set (required by ImplementerStep.buildMessage)
    const jobState = await makeJobState();
    const stateWithBranch = { ...jobState, branch: "feat/test-self-commit" };
    // Persist so store.update can find and update it
    const { JobStateStore } = await import("../src/store/job-state-store.js");
    const store = new JobStateStore(stateWithBranch.jobId, tempDir);
    await store.persist(stateWithBranch);

    const localConfig = {
      version: 1 as const,
      runtime: "local" as const,
      agents: {},
    };

    const result = await pipeline.run("implementer", stateWithBranch, {
      config: localConfig,
      request: buildRequest(),
      slug: "test-slug",
      cwd: tempDir,
      githubClient: buildMockGithubClient(),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // Implementer must have completed (no halt)
    expect(result.steps?.["implementer"]).toBeDefined();
    expect(result.steps?.["implementer"]?.length).toBeGreaterThanOrEqual(1);

    // Verification must have run (pipeline continued past implementer)
    expect(result.steps?.["verification"]).toBeDefined();

    // Push was called (agent self-commit path)
    const pushCalls = gitCallLog.filter((args) => args[0] === "push");
    expect(pushCalls.length).toBeGreaterThanOrEqual(1);

    // Commit was NOT called by pipeline (push-only path)
    const commitCalls = gitCallLog.filter((args) => args[0] === "commit");
    expect(commitCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-INT-01: PR #289 / #291 同型 reproduction
// implementer が authority spec + delta spec 両方 staged → warning ログ + commit 続行 (halt しない)
// (Task 11: halt → warning 変更により、pipeline は続行し delta-spec-validation が検出する)
// ---------------------------------------------------------------------------
describe("TC-AUTH-INT-01: implementer stages authority spec + delta spec → warning to stderr, pipeline continues", () => {
  it("pipeline continues with warning when implementer stages authority spec alongside delta spec", async () => {
    // Git mock: implementer staged diff includes both authority spec and delta spec
    let revParseCallCount = 0;
    const gitCallLog: string[][] = [];

    const gitSpawnFn: GitSpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
      gitCallLog.push([...args]);
      const subcommand = args[0] ?? "";

      let exitCode = 0;
      let stdout = "";

      if (subcommand === "rev-parse") {
        stdout = revParseCallCount === 0 ? "sha-before-abc" : "sha-before-abc"; // HEAD does not advance
        revParseCallCount++;
      } else if (subcommand === "diff") {
        const hasNameOnly = args.includes("--name-only");
        const hasCached = args.includes("--cached");
        if (hasNameOnly && hasCached) {
          // staged file list: authority spec + delta spec
          exitCode = 0;
          stdout = "specrunner/specs/some-cap/spec.md\nspecrunner/changes/test-slug/specs/some-cap/spec.md";
        } else {
          // --cached --quiet: exit 1 = staged changes present
          exitCode = 1;
        }
      }
      // add, push → exit 0

      const procEm = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procAny = procEm as any;
      const stdoutEm = new EventEmitter();
      procAny.stdout = stdoutEm;
      procAny.stderr = new EventEmitter();
      procAny.stdin = { write: () => true, end: () => {} };

      setImmediate(() => {
        if (stdout) stdoutEm.emit("data", Buffer.from(stdout));
        procEm.emit("close", exitCode);
      });

      return procEm as unknown as ChildProcess;
    };

    const mockAgentRunner = {
      async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
        return { completionReason: "success", resultContent: null };
      },
    };

    const { Pipeline } = await import("../src/core/pipeline/pipeline.js");
    const { StepExecutor } = await import("../src/core/step/executor.js");
    const { EventBus } = await import("../src/core/event/event-bus.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");

    const events = new EventBus();
    const executor = new StepExecutor(events, mockAgentRunner, makeStoreFactory(tempDir), gitSpawnFn, async () => {});

    const miniTransitions = [
      { step: "implementer", on: "success", to: "end" },
      { step: "implementer", on: "error", to: "escalate" },
    ];

    const miniSteps = new Map<string, import("../src/core/step/types.js").Step>([
      ["implementer", ImplementerStep],
    ]);

    const pipeline = new Pipeline({
      steps: miniSteps,
      transitions: miniTransitions,
      maxIterations: 1,
      executor,
      events,
      loopName: "implementer",
    });

    const jobState = await makeJobState();
    const stateWithBranch = { ...jobState, branch: "change/test-slug-auth-guard" };
    const { JobStateStore } = await import("../src/store/job-state-store.js");
    const store = new JobStateStore(stateWithBranch.jobId, tempDir);
    await store.persist(stateWithBranch);

    const localConfig = {
      version: 1 as const,
      runtime: "local" as const,
      agents: {},
    };

    const result = await pipeline.run("implementer", stateWithBranch, {
      config: localConfig,
      request: buildRequest(),
      slug: "test-slug",
      cwd: tempDir,
      githubClient: buildMockGithubClient(),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // Pipeline must NOT halt — warning behavior: pipeline continues
    // (delta-spec-validation will handle authority spec violations downstream)
    expect(result.status).toBe("awaiting-merge");

    // No AUTHORITY_SPEC_EDIT_VIOLATION error code — halt was converted to warning
    expect(result.error?.code).not.toBe("AUTHORITY_SPEC_EDIT_VIOLATION");

    // git commit MUST have been called (pipeline proceeds past the warning)
    const commitCalls = gitCallLog.filter((args) => args[0] === "commit");
    expect(commitCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// TC-AUTH-INT-02: delta spec のみ staged の spec-change pipeline は正常完了する（対照）
// ---------------------------------------------------------------------------
describe("TC-AUTH-INT-02: implementer stages delta spec only → pipeline continues normally", () => {
  it("pipeline completes normally when implementer stages only delta spec path", async () => {
    // Git mock: implementer staged diff includes only delta spec (no authority spec)
    let revParseCallCount = 0;
    const gitCallLog: string[][] = [];

    const gitSpawnFn: GitSpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
      gitCallLog.push([...args]);
      const subcommand = args[0] ?? "";

      let exitCode = 0;
      let stdout = "";

      if (subcommand === "rev-parse") {
        stdout = revParseCallCount === 0 ? "sha-before-delta" : "sha-before-delta";
        revParseCallCount++;
      } else if (subcommand === "diff") {
        const hasNameOnly = args.includes("--name-only");
        const hasCached = args.includes("--cached");
        if (hasNameOnly && hasCached) {
          // staged file list: delta spec only — no authority spec violation
          exitCode = 0;
          stdout = "specrunner/changes/test-slug/specs/some-cap/spec.md";
        } else {
          // --cached --quiet: exit 1 = staged changes present
          exitCode = 1;
        }
      }
      // add, commit, push → exit 0

      const procEm = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procAny = procEm as any;
      const stdoutEm = new EventEmitter();
      procAny.stdout = stdoutEm;
      procAny.stderr = new EventEmitter();
      procAny.stdin = { write: () => true, end: () => {} };

      setImmediate(() => {
        if (stdout) stdoutEm.emit("data", Buffer.from(stdout));
        procEm.emit("close", exitCode);
      });

      return procEm as unknown as ChildProcess;
    };

    const mockAgentRunner = {
      async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
        return { completionReason: "success", resultContent: null };
      },
    };

    const { Pipeline } = await import("../src/core/pipeline/pipeline.js");
    const { StepExecutor } = await import("../src/core/step/executor.js");
    const { EventBus } = await import("../src/core/event/event-bus.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { VerificationStep } = await import("../src/core/step/verification.js");

    const events = new EventBus();
    const executor = new StepExecutor(events, mockAgentRunner, makeStoreFactory(tempDir), gitSpawnFn, async () => {});

    const miniTransitions = [
      { step: "implementer", on: "success", to: "verification" },
      { step: "implementer", on: "error", to: "escalate" },
      { step: "verification", on: "passed", to: "end" },
      { step: "verification", on: "failed", to: "escalate" },
      { step: "verification", on: "escalation", to: "escalate" },
    ];

    const miniSteps = new Map<string, import("../src/core/step/types.js").Step>([
      ["implementer", ImplementerStep],
      ["verification", VerificationStep],
    ]);

    const pipeline = new Pipeline({
      steps: miniSteps,
      transitions: miniTransitions,
      maxIterations: 1,
      executor,
      events,
      loopName: "verification",
    });

    const jobState = await makeJobState();
    const stateWithBranch = { ...jobState, branch: "change/test-slug-delta-only" };
    const { JobStateStore } = await import("../src/store/job-state-store.js");
    const store = new JobStateStore(stateWithBranch.jobId, tempDir);
    await store.persist(stateWithBranch);

    const localConfig = {
      version: 1 as const,
      runtime: "local" as const,
      agents: {},
    };

    const result = await pipeline.run("implementer", stateWithBranch, {
      config: localConfig,
      request: buildRequest(),
      slug: "test-slug",
      cwd: tempDir,
      githubClient: buildMockGithubClient(),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // Implementer completed (no halt)
    expect(result.steps?.["implementer"]).toBeDefined();
    expect(result.steps?.["implementer"]?.length).toBeGreaterThanOrEqual(1);

    // Verification ran (pipeline continued past implementer)
    expect(result.steps?.["verification"]).toBeDefined();

    // Commit was called (delta spec path allowed)
    const commitCalls = gitCallLog.filter((args) => args[0] === "commit");
    expect(commitCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// TC-INT-01: dsv Step 5 fail (no-specs-for-required-type) → delta-spec-fixer transition
// ---------------------------------------------------------------------------
describe("TC-INT-01: Step 5 fail (no-specs-for-required-type) → pipeline transitions to delta-spec-fixer without escalation", () => {
  it("dsv needs-fix on first call triggers delta-spec-fixer; second call approves and pipeline proceeds", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // First call: Step 5 fail (specs/ absent). Second call: approved after fixer creates specs/.
    mockDeltaSpecValidator
      .mockResolvedValueOnce({
        ok: false,
        violations: [
          {
            path: "/tmp/changes/test-slug/specs/",
            reason: "no-specs-for-required-type",
            suggested: "Request type 'spec-change' requires a delta spec. Add a file under /tmp/changes/test-slug/specs/<capability>/spec.md",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true });

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // Pipeline did NOT escalate
    expect(result.status).toBe("awaiting-merge");

    // dsv ran at least twice in 1st phase (iter 1 needs-fix, iter 2 approved),
    // plus once more in 2nd phase after code-review approved (iter 3 approved).
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps).toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(2);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved");
    // 3rd run (2nd phase, after code-review) also approved:
    if (dsvSteps!.length >= 3) {
      expect(toLegacyStepResult(dsvSteps![2]!).verdict).toBe("approved");
    }

    // delta-spec-fixer ran exactly once (= triggered by needs-fix transition)
    const dsfSteps = result.steps?.["delta-spec-fixer"];
    expect(dsfSteps).toBeDefined();
    expect(dsfSteps?.length).toBe(1);

    // Pipeline proceeded past delta-spec-validation → spec-review ran
    expect(result.steps?.["spec-review"]).toBeDefined();
  });
});

// TC-ADR-INT-01: STANDARD_TRANSITIONS includes adr-gen transitions and removes old code-review→pr-create
describe("TC-ADR-INT-01: STANDARD_TRANSITIONS adr-gen wiring", () => {
  it("code-review --approved→ delta-spec-validation (2nd-phase gate, not adr-gen or pr-create directly)", async () => {
    const { STANDARD_TRANSITIONS } = await import("../src/core/pipeline/types.js");
    const codeReviewApproved = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved"
    );
    expect(codeReviewApproved).toBeDefined();
    // code-review approved now routes through delta-spec-validation (2nd phase) before adr-gen
    expect(codeReviewApproved!.to).toBe("delta-spec-validation");
    // Must NOT go directly to adr-gen or pr-create
    expect(codeReviewApproved!.to).not.toBe("adr-gen");
    expect(codeReviewApproved!.to).not.toBe("pr-create");
  });

  it("adr-gen --success→ pr-create exists", async () => {
    const { STANDARD_TRANSITIONS } = await import("../src/core/pipeline/types.js");
    const adrGenSuccess = STANDARD_TRANSITIONS.find(
      (t) => t.step === "adr-gen" && t.on === "success"
    );
    expect(adrGenSuccess).toBeDefined();
    expect(adrGenSuccess!.to).toBe("pr-create");
  });

  it("adr-gen --error→ escalate exists", async () => {
    const { STANDARD_TRANSITIONS } = await import("../src/core/pipeline/types.js");
    const adrGenError = STANDARD_TRANSITIONS.find(
      (t) => t.step === "adr-gen" && t.on === "error"
    );
    expect(adrGenError).toBeDefined();
    expect(adrGenError!.to).toBe("escalate");
  });

  it("code-fixer --approved→ code-review loop is preserved", async () => {
    const { STANDARD_TRANSITIONS } = await import("../src/core/pipeline/types.js");
    const codeFixerApproved = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-fixer" && t.on === "approved"
    );
    expect(codeFixerApproved).toBeDefined();
    expect(codeFixerApproved!.to).toBe("code-review");
  });
});
