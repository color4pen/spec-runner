import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { GitHubClient } from "../src/core/port/github-client.js";
import { createManagedAgentRunner } from "../src/adapter/managed-agent/agent-runner.js";
import { verificationResultPath, prCreateResultPath } from "../src/util/paths.js";
import type { SpawnFn } from "../src/util/spawn.js";
import { makeStoreFactory } from "./helpers/store-factory.js";
import { JobStateStore } from "../src/store/job-state-store.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "multi-layer-defense-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJobState() {
  return JobStateStore.create(tempDir, {
    request: { path: "/test/request.md", title: "Test", type: "spec-change" },
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
  return { type: "spec-change", title: "Test", slug: "test", baseBranch: "main", content: "Do something", adr: false };
}

function buildRunner(
  client: ReturnType<typeof buildPipelineMockClient>["client"],
  githubClient: GitHubClient,
) {
  return createManagedAgentRunner({ sessionClient: client, githubClient, repo: buildRepo(), githubToken: "ghp_test" });
}

/**
 * Build a mock SessionClient that supports multiple spec-review iterations.
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
  // Track sessionId → agentId mapping for verdict-aware listEvents
  const sessionIdToAgentId = new Map<string, string>();
  let specReviewCount = 0;

  const client = {
    createSession: vi.fn().mockImplementation((params: { agentId?: string }) => {
      const sessionId = sessionIds[createCallCount] ?? `sess_unknown_${createCallCount}`;
      createCallCount++;
      if (params?.agentId) {
        sessionIdToAgentId.set(sessionId, params.agentId);
      }
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
        return Promise.resolve({
          sseDisconnected: false,
          idleEndTurnDetected: true,
          terminated: false,
          terminationReason: "end_turn" as const,
        });
      },
    ),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockImplementation((sessionId: string) => {
      const agentId = sessionIdToAgentId.get(sessionId) ?? "";

      // spec-review judge step
      if (agentId === "agent_spec_review") {
        const rawVerdict = specReviewVerdicts[specReviewCount] ?? specReviewVerdicts[specReviewVerdicts.length - 1]!;
        specReviewCount++;
        const approved = rawVerdict === "approved";
        return Promise.resolve([
          { type: "agent.custom_tool_use", name: "report_result", id: "mock-report-id", input: { ok: true, approved } },
        ]);
      }

      // code-review judge step — always approved in these tests
      if (agentId === "code-review-agent-id") {
        return Promise.resolve([
          { type: "agent.custom_tool_use", name: "report_result", id: "mock-report-id", input: { ok: true, approved: true } },
        ]);
      }

      // Producer steps (design, spec-fixer, test-case-gen, implementer, build-fixer, code-fixer, adr-gen)
      return Promise.resolve([
        { type: "agent.custom_tool_use", name: "report_result", id: "mock-report-id", input: { ok: true, status: "success" } },
      ]);
    }),
    sendEvents: vi.fn().mockResolvedValue(undefined),
  };

  // Suppress unused variable warning
  void designBranch;

  return {
    client,
    sessionIds,
    specReviewVerdicts,
  };
}

/**
 * Build a mock GitHubClient (port interface) for pipeline integration tests.
 */
function buildMockGithubClient(opts: {
  branchFound?: boolean;
  folderFound?: boolean;
  specReviewVerdicts?: ("approved" | "needs-fix" | "escalation")[];
  codeReviewVerdicts?: ("approved" | "needs-fix" | "escalation")[];
} = {}): GitHubClient {
  const {
    branchFound = true,
    folderFound = true,
    specReviewVerdicts = ["approved"],
    codeReviewVerdicts = ["approved"],
  } = opts;

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

// ---------------------------------------------------------------------------
// TC-01: Happy path — spec-review approved → pipeline completes
// ---------------------------------------------------------------------------

describe("TC-01: happy path — spec-review approved, pipeline completes", () => {
  it("design → spec-review(approved) → awaiting-merge", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["approved"] });

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // spec-review: 1 run, approved
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr, "spec-review should be defined").toBeDefined();
    expect(specReviewArr?.length).toBe(1);
    expect(toLegacyStepResult(specReviewArr![0]!).verdict).toBe("approved");

    // spec-fixer: not invoked (spec-review approved)
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // Pipeline completes past spec-review
    expect(result.steps?.["implementer"], "implementer should have run").toBeDefined();
    expect(result.steps?.["verification"], "verification should have run").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-02: spec-review catches insufficient spec → spec-fixer → re-spec-review approved
// ---------------------------------------------------------------------------

describe("TC-02: spec-review catches insufficient spec — spec-fixer repairs, re-review approved", () => {
  it("spec-review needs-fix → spec-fixer → spec-review approved → pipeline completes", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["needs-fix", "approved"] });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(),
      request: buildRequest(),
      slug: "test-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-merge");

    // spec-review: 2 runs (needs-fix → approved)
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr, "spec-review should be defined").toBeDefined();
    expect(specReviewArr?.length).toBe(2);
    expect(toLegacyStepResult(specReviewArr![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(specReviewArr![1]!).verdict).toBe("approved");

    // spec-fixer: 1 run (triggered by spec-review needs-fix)
    const specFixerArr = result.steps?.["spec-fixer"];
    expect(specFixerArr, "spec-fixer should be defined").toBeDefined();
    expect(specFixerArr?.length).toBe(1);

    // Pipeline completes past spec-review
    expect(result.steps?.["implementer"], "implementer should have run").toBeDefined();
  });
});
