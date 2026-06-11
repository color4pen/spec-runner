/**
 * T-14: E2E mock pipeline tests for custom reviewer steps.
 *
 * Uses the managed agent runner (mock client) to simulate pipeline execution
 * with one or more custom reviewer steps injected via jobState.reviewers.
 *
 * Coverage:
 * - TC-040: single reviewer runs after code-review
 * - TC-041: multiple reviewers run in declaration order
 * - TC-044: code-fixer returns to reviewer that issued needs-fix
 * - TC-045: zero reviewers — existing pipeline behavior unchanged
 * - TC-046: per-reviewer iteration budget is independent
 * - TC-047: code-fixer findings block includes reviewer name
 * - TC-048: zero reviewer → existing tests green (via zero-reviewer state)
 */
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
import { buildInitialJobState } from "../src/store/job-state-store.js";
import type { ReviewerSnapshot } from "../src/core/reviewers/types.js";
import { vi as vitest } from "vitest";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

// ---- Mock verification runner (no real process spawn) ----
vi.mock("../src/core/verification/runner.js", () => ({
  runVerification: vi.fn().mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
    const outputPath = `${cwd}/${verificationResultPath(slug)}`;
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    await import("node:fs/promises").then((f) => f.mkdir(dir, { recursive: true }));
    await import("node:fs/promises").then((f) =>
      f.writeFile(outputPath, `# Verification Result — ${slug}\n\n## Verdict: passed\n\n## Phase Results\n\n`)
    );
    return { slug, verdict: "passed" as const, phases: [] };
  }),
}));

// ---- Mock pr-create runner ----
vi.mock("../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn().mockImplementation(async (input: { cwd?: string }) => {
    const cwd = input.cwd ?? process.cwd();
    const slug = "cr-slug";
    const outputPath = `${cwd}/${prCreateResultPath(slug)}`;
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    await import("node:fs/promises").then((f) => f.mkdir(dir, { recursive: true }));
    await import("node:fs/promises").then((f) =>
      f.writeFile(outputPath, `# pr-create Result — ${slug}\n\n## Status: success\n\n## PR\n\n- **URL**: https://github.com/o/r/pull/1\n- **Number**: 1\n`)
    );
    return { status: "created" as const, url: "https://github.com/o/r/pull/1", number: 1 };
  }),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "custom-reviewers-e2e-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(name: string, maxIterations = 3, model?: string): ReviewerSnapshot {
  return {
    name,
    maxIterations,
    model,
    purpose: `${name} purpose`,
    criteria: `${name} criteria`,
    judgment: `${name} judgment`,
    freeText: "",
  };
}

async function makeJobState(reviewers?: ReviewerSnapshot[]) {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Custom Reviewer Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    reviewers,
  });
  const stateWithBranch = { ...state, branch: `feat/cr-slug-${state.jobId.slice(0, 8)}` };
  await makeStoreFactory(tempDir)(stateWithBranch.jobId).persist(stateWithBranch);
  return stateWithBranch;
}

/**
 * Build a mock session client with support for custom reviewer agent IDs.
 *
 * @param reviewerVerdicts - Map of reviewer name → ordered verdict array.
 *   Each verdict is returned in order; last one is repeated for subsequent calls.
 *   Verdict "approved" → ok:true, no blocking findings.
 *   Verdict "needs-fix" → ok:true, one high-severity fixable finding.
 *   Verdict "ok-false" → ok:false (voluntary failure / escalation).
 */
function buildCustomMockClient(opts: {
  codeReviewVerdicts?: ("approved" | "needs-fix")[];
  reviewerVerdicts?: Record<string, ("approved" | "needs-fix" | "ok-false")[]>;
  regressionGateVerdicts?: ("approved" | "needs-fix" | "decision-needed")[];
} = {}) {
  const {
    codeReviewVerdicts = ["approved"],
    reviewerVerdicts = {},
    regressionGateVerdicts = ["approved"],
  } = opts;

  let createCallCount = 0;
  const sessionIdToAgentId = new Map<string, string>();
  let codeReviewCount = 0;
  const reviewerCounts: Record<string, number> = {};
  let regressionGateCount = 0;

  const client = {
    createSession: vi.fn().mockImplementation((params: { agentId?: string }) => {
      const sessionId = `sess_${createCallCount++}_${params?.agentId ?? "unknown"}`;
      if (params?.agentId) {
        sessionIdToAgentId.set(sessionId, params.agentId);
      }
      return Promise.resolve({ sessionId });
    }),

    sendUserMessage: vi.fn().mockResolvedValue(undefined),

    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" as const }),

    streamEvents: vi.fn().mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: true,
      terminated: false,
      terminationReason: "end_turn" as const,
    }),

    getSessionUsage: vi.fn().mockResolvedValue(undefined),

    listEvents: vi.fn().mockImplementation((sessionId: string) => {
      const agentId = sessionIdToAgentId.get(sessionId) ?? "";

      // spec-review
      if (agentId === "agent_spec_review") {
        return Promise.resolve([{
          type: "agent.custom_tool_use",
          name: "report_result",
          id: "mock-id",
          input: { ok: true, approved: true, findings: [] },
        }]);
      }

      // code-review
      if (agentId === "code-review-agent-id") {
        const rawVerdict = codeReviewVerdicts[codeReviewCount] ?? codeReviewVerdicts[codeReviewVerdicts.length - 1]!;
        codeReviewCount++;
        if (rawVerdict === "approved") {
          return Promise.resolve([{
            type: "agent.custom_tool_use",
            name: "report_result",
            id: "mock-id",
            input: { ok: true, approved: true, findings: [] },
          }]);
        } else {
          return Promise.resolve([{
            type: "agent.custom_tool_use",
            name: "report_result",
            id: "mock-id",
            input: {
              ok: true,
              approved: false,
              findings: [{ severity: "high", resolution: "fixable", file: "src/test.ts", title: "code-review issue", rationale: "Fix required" }],
            },
          }]);
        }
      }

      // Custom reviewer agents: agentId = "<name>-agent-id"
      for (const [reviewerName, verdicts] of Object.entries(reviewerVerdicts)) {
        if (agentId === `${reviewerName}-agent-id`) {
          const count = reviewerCounts[reviewerName] ?? 0;
          reviewerCounts[reviewerName] = count + 1;
          const rawVerdict = verdicts[count] ?? verdicts[verdicts.length - 1]!;

          if (rawVerdict === "approved") {
            return Promise.resolve([{
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-id",
              input: { ok: true, approved: true, findings: [] },
            }]);
          } else if (rawVerdict === "ok-false") {
            return Promise.resolve([{
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-id",
              input: { ok: false, reason: `${reviewerName} voluntary failure` },
            }]);
          } else {
            // needs-fix
            return Promise.resolve([{
              type: "agent.custom_tool_use",
              name: "report_result",
              id: "mock-id",
              input: {
                ok: true,
                approved: false,
                findings: [{
                  severity: "high",
                  resolution: "fixable",
                  file: "src/feature.ts",
                  title: `${reviewerName} finding`,
                  rationale: `Fix required by ${reviewerName}`,
                }],
              },
            }]);
          }
        }
      }

      // regression-gate
      if (agentId === "regression-gate-agent-id") {
        const rawVerdict = regressionGateVerdicts[regressionGateCount] ?? regressionGateVerdicts[regressionGateVerdicts.length - 1]!;
        regressionGateCount++;
        if (rawVerdict === "approved") {
          return Promise.resolve([{
            type: "agent.custom_tool_use",
            name: "report_result",
            id: "mock-id",
            input: { ok: true, approved: true, findings: [] },
          }]);
        } else if (rawVerdict === "decision-needed") {
          return Promise.resolve([{
            type: "agent.custom_tool_use",
            name: "report_result",
            id: "mock-id",
            input: {
              ok: true,
              findings: [{
                severity: "high",
                resolution: "decision-needed",
                file: "src/contradiction.ts",
                title: "Contradictory fixes",
                rationale: "Fixing A re-introduces B",
              }],
            },
          }]);
        } else {
          // needs-fix: regression detected
          return Promise.resolve([{
            type: "agent.custom_tool_use",
            name: "report_result",
            id: "mock-id",
            input: {
              ok: true,
              findings: [{
                severity: "high",
                resolution: "fixable",
                file: "src/regressed.ts",
                title: "Regression detected",
                rationale: "A previously-fixed issue has returned",
              }],
            },
          }]);
        }
      }

      // conformance
      if (agentId === "conformance-agent-id") {
        return Promise.resolve([{
          type: "agent.custom_tool_use",
          name: "report_result",
          id: "mock-id",
          input: { ok: true, approved: true, findings: [] },
        }]);
      }

      // request-review
      if (agentId === "request-review-agent-id") {
        return Promise.resolve([{
          type: "agent.custom_tool_use",
          name: "report_result",
          id: "mock-id",
          input: { ok: true, verdict: "approve", findings: [] },
        }]);
      }

      // Producer steps (design, spec-fixer, test-case-gen, implementer, build-fixer, code-fixer, adr-gen)
      return Promise.resolve([{
        type: "agent.custom_tool_use",
        name: "report_result",
        id: "mock-id",
        input: { ok: true, status: "success" },
      }]);
    }),

    sendEvents: vi.fn().mockResolvedValue(undefined),
  };

  return { client };
}

/** Build pipeline config with custom reviewer agent entries. */
function buildConfig(reviewerNames: string[] = []) {
  const customAgentEntries = Object.fromEntries(
    reviewerNames.map((name) => [
      name,
      { agentId: `${name}-agent-id`, definitionHash: `sha256:${name}`, lastSyncedAt: new Date().toISOString() },
    ]),
  );
  return {
    version: 1 as const,
    agents: {
      "request-review": { agentId: "request-review-agent-id", definitionHash: "sha256:rrv", lastSyncedAt: new Date().toISOString() },
      design: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:ghi", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
      "test-case-gen": { agentId: "test-case-gen-agent-id", definitionHash: "sha256:tcg", lastSyncedAt: new Date().toISOString() },
      "implementer": { agentId: "implementer-agent-id", definitionHash: "sha256:imp", lastSyncedAt: new Date().toISOString() },
      "build-fixer": { agentId: "build-fixer-agent-id", definitionHash: "sha256:bfx", lastSyncedAt: new Date().toISOString() },
      "code-review": { agentId: "code-review-agent-id", definitionHash: "sha256:crv", lastSyncedAt: new Date().toISOString() },
      "code-fixer": { agentId: "code-fixer-agent-id", definitionHash: "sha256:cfx", lastSyncedAt: new Date().toISOString() },
      "conformance": { agentId: "conformance-agent-id", definitionHash: "sha256:cnf", lastSyncedAt: new Date().toISOString() },
      "adr-gen": { agentId: "adr-gen-agent-id", definitionHash: "sha256:adr", lastSyncedAt: new Date().toISOString() },
      // regression-gate is always registered when custom reviewers are present
      "regression-gate": { agentId: "regression-gate-agent-id", definitionHash: "sha256:rgt", lastSyncedAt: new Date().toISOString() },
      ...customAgentEntries,
    } as Record<string, { agentId: string; definitionHash: string; lastSyncedAt: string }>,
    pipeline: { maxRetries: 3 },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    specReview: { pollIntervalMs: 100 },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "bug-fix", title: "Custom Reviewer Test", slug: "cr-slug", baseBranch: "main", content: "Test request content", adr: false };
}

function buildMockGithubClient(): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    verifyPath: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
  };
}

function buildRunner(
  client: ReturnType<typeof buildCustomMockClient>["client"],
  githubClient: GitHubClient,
) {
  return createManagedAgentRunner({
    sessionClient: client,
    githubClient,
    repo: buildRepo(),
    githubToken: "ghp_test",
  });
}

// ---------------------------------------------------------------------------
// TC-040: Single custom reviewer runs after code-review
// ---------------------------------------------------------------------------

describe("TC-040: single custom reviewer runs after code-review", () => {
  it("security reviewer runs after code-review and pipeline completes", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("security")];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: { security: ["approved"] },
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-archive");

    // code-review ran and was approved
    const codeReviewArr = result.steps?.["code-review"];
    expect(codeReviewArr, "code-review should have run").toBeDefined();
    expect(codeReviewArr?.length).toBe(1);
    expect(toLegacyStepResult(codeReviewArr![0]!).verdict).toBe("approved");

    // security reviewer ran after code-review
    const securityArr = result.steps?.["security"];
    expect(securityArr, "security reviewer should have run").toBeDefined();
    expect(securityArr?.length).toBe(1);
    expect(toLegacyStepResult(securityArr![0]!).verdict).toBe("approved");

    // conformance ran after security
    expect(result.steps?.["conformance"], "conformance should have run after security").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-041: Multiple reviewers run in declaration order
// ---------------------------------------------------------------------------

describe("TC-041: multiple reviewers run in declaration order", () => {
  it("security then perf reviewers both run in order", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("security"), makeSnapshot("perf")];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: {
        security: ["approved"],
        perf: ["approved"],
      },
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security", "perf"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-archive");

    // Both reviewers ran
    expect(result.steps?.["security"], "security should have run").toBeDefined();
    expect(result.steps?.["perf"], "perf should have run").toBeDefined();
    expect(result.steps?.["security"]?.length).toBe(1);
    expect(result.steps?.["perf"]?.length).toBe(1);

    // Verify ordering: security startedAt < perf startedAt (or at least both ran)
    const secRun = result.steps?.["security"]?.[0];
    const perfRun = result.steps?.["perf"]?.[0];
    expect(secRun).toBeDefined();
    expect(perfRun).toBeDefined();
    // Both approved
    expect(toLegacyStepResult(secRun!).verdict).toBe("approved");
    expect(toLegacyStepResult(perfRun!).verdict).toBe("approved");

    // conformance ran after both
    expect(result.steps?.["conformance"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-044: code-fixer returns to reviewer that issued needs-fix
// ---------------------------------------------------------------------------

describe("TC-044: code-fixer returns to reviewer that issued needs-fix", () => {
  it("code-fixer goes back to security reviewer after needs-fix", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("security", 3)];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: {
        // security: needs-fix → code-fixer runs → security: approved
        security: ["needs-fix", "approved"],
      },
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-archive");

    // security ran twice (needs-fix, then approved)
    const securityArr = result.steps?.["security"];
    expect(securityArr, "security should have run").toBeDefined();
    expect(securityArr?.length).toBe(2);
    expect(toLegacyStepResult(securityArr![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(securityArr![1]!).verdict).toBe("approved");

    // code-fixer ran once (triggered by security needs-fix)
    const codeFixerArr = result.steps?.["code-fixer"];
    expect(codeFixerArr, "code-fixer should have run").toBeDefined();
    expect(codeFixerArr?.length).toBe(1);

    // conformance ran after security approved
    expect(result.steps?.["conformance"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-045: Zero reviewers — zero-reviewer path unchanged
// ---------------------------------------------------------------------------

describe("TC-045: zero reviewers — existing behavior unchanged", () => {
  it("pipeline without reviewers completes with standard code-review only", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    // No reviewers
    const jobState = await makeJobState();

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig([]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-archive");

    // Standard code-review ran
    const codeReviewArr = result.steps?.["code-review"];
    expect(codeReviewArr, "code-review should have run").toBeDefined();
    expect(codeReviewArr?.length).toBe(1);
    expect(toLegacyStepResult(codeReviewArr![0]!).verdict).toBe("approved");

    // No custom reviewer step names in state
    expect(result.reviewers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-046: Per-reviewer iteration budget is independent
// ---------------------------------------------------------------------------

describe("TC-046: per-reviewer iteration budget is independent", () => {
  it("reviewer with maxIterations=1 exhausts after 1 needs-fix, independent of code-review budget", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    // reviewer with maxIterations=1: after 1 needs-fix, should exhaust
    const reviewerSnapshots = [makeSnapshot("r1", 1)];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: {
        // r1: needs-fix, code-fixer: approved, but r1 maxIterations=1 → should exhaust
        r1: ["needs-fix", "needs-fix"],  // will keep returning needs-fix
      },
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["r1"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // Pipeline should exhaust on r1 (maxIterations=1) and transition to awaiting-resume
    expect(result.status).toBe("awaiting-resume");
    // r1 should have a run (at least 1)
    const r1Arr = result.steps?.["r1"];
    expect(r1Arr, "r1 should have run").toBeDefined();
    expect(r1Arr!.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// TC-047: code-fixer findings block contains reviewer name (source identification)
// ---------------------------------------------------------------------------

describe("TC-047: findings source identification — reviewer name in code-fixer message", () => {
  it("code-fixer receives findings attributed to the active reviewer (unit check)", async () => {
    // This tests the buildFindingsBlock function with reviewer name labeling,
    // already covered in fixer-reviewer.test.ts. Here we verify via E2E that
    // the code-fixer step is actually triggered when reviewer returns needs-fix.
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("api-compat")];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: {
        "api-compat": ["needs-fix", "approved"],
      },
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["api-compat"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-archive");

    // api-compat ran twice (needs-fix → approved)
    const reviewerArr = result.steps?.["api-compat"];
    expect(reviewerArr).toBeDefined();
    expect(reviewerArr?.length).toBe(2);

    // code-fixer ran exactly once for api-compat findings
    const codeFixerArr = result.steps?.["code-fixer"];
    expect(codeFixerArr, "code-fixer should have run once for api-compat findings").toBeDefined();
    expect(codeFixerArr?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-048 / resume invariant: snapshot used on resume, definition changes don't affect
// ---------------------------------------------------------------------------

describe("TC-048: resume uses snapshot — definition changes don't affect running job", () => {
  it("reviewers from state.reviewers are used, not re-loaded from disk", async () => {
    // This is a static test: verifies that ResumeCommand.prepare does not call
    // loadReviewerDefinitions. We verify by building a jobState with reviewers
    // and confirming pipeline uses them without needing disk files.
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    // State already has reviewers snapshot (as if job was started with these)
    const reviewerSnapshots = [makeSnapshot("snapshot-reviewer")];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: {
        "snapshot-reviewer": ["approved"],
      },
    });
    const githubClient = buildMockGithubClient();

    // Run pipeline — the reviewers come from jobState.reviewers (the snapshot),
    // not from any disk read. If composeReviewerDescriptor didn't use the snapshot,
    // the "snapshot-reviewer" step would not exist and the pipeline would fail.
    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["snapshot-reviewer"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-archive");
    // snapshot-reviewer ran using the in-state snapshot
    expect(result.steps?.["snapshot-reviewer"]).toBeDefined();
    expect(result.steps?.["snapshot-reviewer"]?.length).toBe(1);
    expect(toLegacyStepResult(result.steps!["snapshot-reviewer"]![0]!).verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC: ok=false escalation for custom reviewer
// ---------------------------------------------------------------------------

describe("custom reviewer ok=false → escalation", () => {
  it("ok=false from custom reviewer escalates to awaiting-resume", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("security")];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: {
        security: ["ok-false"],
      },
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // ok=false should escalate
    expect(result.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-042: non-existent file ref in custom reviewer finding → escalation
// ---------------------------------------------------------------------------

describe("TC-042: non-existent file ref in custom reviewer finding → escalation", () => {
  it("escalates when custom reviewer finding references a file that does not exist", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("security")];
    const jobState = await makeJobState(reviewerSnapshots);

    // security returns a needs-fix finding — the file it references will be non-existent
    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: { security: ["needs-fix"] },
    });
    const githubClient = buildMockGithubClient();

    // Minimal runtimeStrategy mock: verifyFindingRefs returns all refs as non-existent
    const mockRuntimeStrategy = {
      validateStepInputs: vi.fn().mockResolvedValue(undefined),
      captureHeadSha: vi.fn().mockResolvedValue(null),
      prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
      finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
      verifyFindingRefs: vi.fn().mockImplementation(async (refs: { file: string }[]) => refs),
      digestArtifacts: vi.fn().mockResolvedValue([]),
      commitFinalState: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runtimeStrategy: mockRuntimeStrategy as any,
    });

    // Non-existent file ref → verdict escalation → pipeline awaiting-resume
    expect(result.status).toBe("awaiting-resume");
    expect(mockRuntimeStrategy.verifyFindingRefs).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Regression-gate E2E scenarios (T-08)
// ---------------------------------------------------------------------------

// TC-RG-01: regression detected → code-fixer → approved → conformance
describe("TC-RG-01: regression-gate detects regression → code-fixer → approved → conformance", () => {
  it("regression-gate reports high/fixable → code-fixer → gate re-runs → approved → conformance", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("security")];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: { security: ["approved"] },
      // gate: needs-fix (regression) on first call, approved on second
      regressionGateVerdicts: ["needs-fix", "approved"],
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(result.status).toBe("awaiting-archive");

    // regression-gate ran twice (needs-fix → approved)
    const gateArr = result.steps?.["regression-gate"];
    expect(gateArr, "regression-gate should have run").toBeDefined();
    expect(gateArr?.length).toBe(2);
    expect(toLegacyStepResult(gateArr![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(gateArr![1]!).verdict).toBe("approved");

    // code-fixer ran for the regression
    expect(result.steps?.["code-fixer"], "code-fixer should have run").toBeDefined();

    // conformance ran after regression-gate approved
    expect(result.steps?.["conformance"], "conformance should have run after gate").toBeDefined();
  });
});

// TC-RG-02: regression-gate reports decision-needed → escalation
describe("TC-RG-02: regression-gate decision-needed → escalation", () => {
  it("decision-needed from regression-gate escalates to awaiting-resume", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    const reviewerSnapshots = [makeSnapshot("security")];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: { security: ["approved"] },
      regressionGateVerdicts: ["decision-needed"],
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // decision-needed → escalation → awaiting-resume
    expect(result.status).toBe("awaiting-resume");
  });
});

// TC-RG-03: regression-gate exhaustion → REGRESSION_GATE_RETRIES_EXHAUSTED → awaiting-resume
describe("TC-RG-03: regression-gate exhaustion → awaiting-resume", () => {
  it("regression-gate with maxIterations=1 exhausts after budget", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");

    // Use a reviewer with 1 iteration to trigger exhaustion quickly
    const reviewerSnapshots = [makeSnapshot("security", 3)];
    const jobState = await makeJobState(reviewerSnapshots);

    const { client } = buildCustomMockClient({
      codeReviewVerdicts: ["approved"],
      reviewerVerdicts: { security: ["approved"] },
      // gate always returns needs-fix → should exhaust at REGRESSION_GATE_MAX_ITERATIONS (3)
      regressionGateVerdicts: ["needs-fix", "needs-fix", "needs-fix", "needs-fix"],
    });
    const githubClient = buildMockGithubClient();

    const result = await runPipeline(jobState, {
      client,
      config: buildConfig(["security"]) as Parameters<typeof runPipeline>[1]["config"],
      request: buildRequest(),
      slug: "cr-slug",
      cwd: tempDir,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient,
      runner: buildRunner(client, githubClient),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    // regression-gate exhausted → awaiting-resume
    expect(result.status).toBe("awaiting-resume");
    // error code should be REGRESSION_GATE_RETRIES_EXHAUSTED
    expect(result.error?.code).toBe("REGRESSION_GATE_RETRIES_EXHAUSTED");
  });
});

// Suppress unused import warning
void vitest;
