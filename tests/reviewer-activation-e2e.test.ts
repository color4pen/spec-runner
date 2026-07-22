/**
 * T-11: E2E mock pipeline tests for reviewer activation conditions.
 *
 * Coverage:
 * - TC-ACT-01: paths 不一致 reviewer が skip され、verdict: "skipped" + skipReason が state に記録される
 * - TC-ACT-02: requestTypes 一致で起動、不一致で skip
 * - TC-ACT-03: 条件無指定 reviewer は常時起動する
 * - TC-ACT-04: skip ≠ approved — skipped reviewer が後続 reviewer / conformance へ進む
 * - TC-ACT-05: reviewers/ 空の場合は既存挙動と完全一致（regression）
 *
 * TC-040 (must): 単一 reviewer が activation 不一致で skip → job が "awaiting-resume" で停止
 *   (all-skip escalation per aggregateVerdict, req 3)
 *   Affects: TC-ACT-01, TC-ACT-02 (requestTypes不一致), TC-ACT-04 (first test / single-skip case)
 * TC-041 (must): reviewer が 1 名 skip + 1 名 approved → job は "awaiting-archive" で完了
 *   (mixed verdict = approved, not escalation)
 *   Affects: TC-ACT-04 (second test / mixed case) — stays "awaiting-archive"
 *
 * Note: These tests use the managed agent runner (mock client).
 * In managed mode, listChangedFiles is not available (runtimeStrategy not injected),
 * so changedFiles defaults to []. Path-based conditions with non-empty patterns
 * will always evaluate to "no match" → skip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { GitHubClient } from "../src/core/port/github-client.js";
import { createManagedAgentRunner } from "../src/adapter/managed-agent/agent-runner.js";
import { verificationResultPath, prCreateResultPath } from "../src/util/paths.js";
import type { SpawnFn } from "../src/util/spawn.js";
import { makeStoreFactory } from "./helpers/store-factory.js";
import { buildInitialJobState } from "../src/store/job-state-store.js";
import type { ReviewerSnapshot } from "../src/kernel/reviewer-snapshot.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

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

vi.mock("../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn().mockImplementation(async (input: { cwd?: string }) => {
    const cwd = input.cwd ?? process.cwd();
    const slug = "act-slug";
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reviewer-activation-e2e-"));
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

function makeSnapshot(
  name: string,
  overrides: Partial<ReviewerSnapshot> = {},
): ReviewerSnapshot {
  return {
    name,
    maxIterations: 3,
    purpose: `${name} purpose`,
    criteria: `${name} criteria`,
    judgment: `${name} judgment`,
    freeText: "",
    ...overrides,
  };
}

async function makeJobState(
  reviewers?: ReviewerSnapshot[],
  requestType = "bug-fix",
) {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Activation Test", type: requestType },
    repository: { owner: "testowner", name: "testrepo" },
    reviewers,
  });
  const stateWithBranch = { ...state, branch: `feat/act-slug-${state.jobId.slice(0, 8)}` };
  await makeStoreFactory(tempDir)(stateWithBranch.jobId).persist(stateWithBranch);
  return stateWithBranch;
}

/**
 * Build a mock session client where all steps succeed.
 * Custom reviewers always return approved.
 */
function buildMockClient() {
  const sessionIdToAgentId = new Map<string, string>();
  let callCount = 0;

  return {
    createSession: vi.fn().mockImplementation((params: { agentId?: string }) => {
      const sessionId = `sess_${callCount++}`;
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
          type: "agent.custom_tool_use", name: "report_result", id: "id",
          input: { ok: true, approved: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } },
        }]);
      }
      // code-review
      if (agentId === "code-review-agent-id") {
        return Promise.resolve([{
          type: "agent.custom_tool_use", name: "report_result", id: "id",
          input: { ok: true, approved: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } },
        }]);
      }
      // conformance
      if (agentId === "conformance-agent-id") {
        return Promise.resolve([{
          type: "agent.custom_tool_use", name: "report_result", id: "id",
          input: { ok: true, approved: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } },
        }]);
      }
      // request-review
      // TC-024: evidence added (checked > 0) so parseRequestReviewReportInput succeeds
      // after the evidence requirement is enforced (request-review-evidence-counts change)
      if (agentId === "request-review-agent-id") {
        return Promise.resolve([{
          type: "agent.custom_tool_use", name: "report_result", id: "id",
          input: { ok: true, verdict: "approve", findings: [], evidence: { checked: 5, skipped: 0, unverified: 0 } },
        }]);
      }
      // All other (custom reviewers, producers)
      return Promise.resolve([{
        type: "agent.custom_tool_use", name: "report_result", id: "id",
        input: { ok: true, approved: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } },
      }]);
    }),
    sendEvents: vi.fn().mockResolvedValue(undefined),
  };
}

function buildConfig(reviewerNames: string[] = []) {
  const customEntries = Object.fromEntries(
    reviewerNames.map((name) => [
      name,
      { agentId: `${name}-agent-id`, definitionHash: `sha256:${name}`, lastSyncedAt: new Date().toISOString() },
    ]),
  );
  return {
    version: 1 as const,
    agents: {
      "request-review": { agentId: "request-review-agent-id", definitionHash: "sha256:rr", lastSyncedAt: new Date().toISOString() },
      design: { agentId: "agent_001", definitionHash: "sha256:des", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:sr", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:sf", lastSyncedAt: new Date().toISOString() },
      "test-case-gen": { agentId: "test-case-gen-agent-id", definitionHash: "sha256:tcg", lastSyncedAt: new Date().toISOString() },
      "test-materialize": { agentId: "test-materialize-agent-id", definitionHash: "sha256:tmt", lastSyncedAt: new Date().toISOString() },
      implementer: { agentId: "implementer-agent-id", definitionHash: "sha256:imp", lastSyncedAt: new Date().toISOString() },
      "build-fixer": { agentId: "build-fixer-agent-id", definitionHash: "sha256:bfx", lastSyncedAt: new Date().toISOString() },
      "code-review": { agentId: "code-review-agent-id", definitionHash: "sha256:crv", lastSyncedAt: new Date().toISOString() },
      "code-fixer": { agentId: "code-fixer-agent-id", definitionHash: "sha256:cfx", lastSyncedAt: new Date().toISOString() },
      conformance: { agentId: "conformance-agent-id", definitionHash: "sha256:cnf", lastSyncedAt: new Date().toISOString() },
      "adr-gen": { agentId: "adr-gen-agent-id", definitionHash: "sha256:adr", lastSyncedAt: new Date().toISOString() },
      "regression-gate": { agentId: "regression-gate-agent-id", definitionHash: "sha256:rgt", lastSyncedAt: new Date().toISOString() },
      ...customEntries,
    } as Record<string, { agentId: string; definitionHash: string; lastSyncedAt: string }>,
    pipeline: { maxRetries: 3 },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    specReview: { pollIntervalMs: 100 },
  };
}

function buildGithubClient(): GitHubClient {
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
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}

async function runPipelineWith(
  reviewers: ReviewerSnapshot[],
  requestType = "bug-fix",
) {
  const { runPipeline } = await import("../src/core/pipeline/index.js");

  const jobState = await makeJobState(reviewers, requestType);
  const client = buildMockClient();
  const githubClient = buildGithubClient();
  const reviewerNames = reviewers.map((r) => r.name);

  return runPipeline(jobState, {
    client,
    config: buildConfig(reviewerNames) as Parameters<typeof runPipeline>[1]["config"],
    request: {
      type: requestType,
      title: "Activation Test",
      slug: "act-slug",
      baseBranch: "main",
      content: "test content",
      adr: false,
    },
    slug: "act-slug",
    cwd: tempDir,
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient,
    runner: createManagedAgentRunner({
      sessionClient: client,
      githubClient,
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
    }),
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  });
}

// ---------------------------------------------------------------------------
// TC-ACT-01: paths 不一致 reviewer → skipped
// ---------------------------------------------------------------------------

describe("TC-ACT-01: paths 不一致 reviewer is skipped", () => {
  it("reviewer with paths condition is skipped when no files match (managed: changedFiles=[])", async () => {
    // paths: ["src/auth/**"] — managed runtime returns [] for changedFiles → skip
    const reviewers = [
      makeSnapshot("security", { paths: ["src/auth/**"] }),
    ];

    const result = await runPipelineWith(reviewers);

    // TC-040: all-skip → escalation → "awaiting-resume" (not "awaiting-archive")
    // BREAKING CHANGE from old behavior ("awaiting-archive").
    // Destruction confirmation (TC-048): reverting aggregateVerdict all-skip branch makes this fail.
    expect(result.status).toBe("awaiting-resume");

    // security reviewer should have been skipped
    const securityRuns = result.steps?.["security"];
    expect(securityRuns, "security step should have a run record").toBeDefined();
    expect(securityRuns?.length).toBe(1);
    const run = securityRuns![0]!;
    expect(run.outcome.verdict).toBe("skipped");
    expect(run.outcome.skipReason).toBeDefined();
    expect(run.outcome.skipReason).toContain("src/auth/**");

    // Pipeline should still complete (skip → conformance)
    expect(result.steps?.["conformance"], "conformance should have run after skip").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-ACT-02: requestTypes 一致で起動、不一致で skip
// ---------------------------------------------------------------------------

describe("TC-ACT-02: requestTypes condition", () => {
  it("reviewer activates when requestType matches", async () => {
    const reviewers = [
      makeSnapshot("security", { requestTypes: ["bug-fix"] }),
    ];

    const result = await runPipelineWith(reviewers, "bug-fix");

    const securityRuns = result.steps?.["security"];
    expect(securityRuns, "security should have run").toBeDefined();
    expect(securityRuns?.length).toBe(1);
    // Should be approved (not skipped)
    expect(securityRuns![0]!.outcome.verdict).not.toBe("skipped");
  });

  it("reviewer is skipped when requestType does NOT match", async () => {
    const reviewers = [
      makeSnapshot("security", { requestTypes: ["spec-change"] }),
    ];

    // Request type is "bug-fix" but reviewer only activates for "spec-change"
    const result = await runPipelineWith(reviewers, "bug-fix");

    const securityRuns = result.steps?.["security"];
    expect(securityRuns, "security step should have a run record").toBeDefined();
    expect(securityRuns![0]!.outcome.verdict).toBe("skipped");
    expect(securityRuns![0]!.outcome.skipReason).toContain("spec-change");
    expect(securityRuns![0]!.outcome.skipReason).toContain("bug-fix");

    // TC-040: all-skip → escalation → "awaiting-resume" (not "awaiting-archive")
    expect(result.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-ACT-03: 条件無指定 reviewer は常時起動する
// ---------------------------------------------------------------------------

describe("TC-ACT-03: reviewer without conditions always activates", () => {
  it("reviewer with no conditions runs and is not skipped", async () => {
    const reviewers = [makeSnapshot("security")]; // no paths or requestTypes

    const result = await runPipelineWith(reviewers);

    const securityRuns = result.steps?.["security"];
    expect(securityRuns, "security should have run").toBeDefined();
    expect(securityRuns?.length).toBe(1);
    expect(securityRuns![0]!.outcome.verdict).not.toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// TC-ACT-04: skip ≠ approved — state has skipped, pipeline continues
// ---------------------------------------------------------------------------

describe("TC-ACT-04: skipped verdict is distinct from approved", () => {
  it("skipped step has verdict 'skipped' (not 'approved') and pipeline completes", async () => {
    const reviewers = [
      makeSnapshot("security", { requestTypes: ["spec-change"] }),
    ];

    const result = await runPipelineWith(reviewers, "bug-fix");

    const run = result.steps?.["security"]?.[0];
    expect(run?.outcome.verdict).toBe("skipped");
    expect(run?.outcome.verdict).not.toBe("approved");
    // TC-040: single reviewer all-skip → escalation → "awaiting-resume"
    expect(result.status).toBe("awaiting-resume");
  });

  it("two reviewers: one skipped, one approved — pipeline still completes", async () => {
    const reviewers = [
      makeSnapshot("security", { requestTypes: ["spec-change"] }), // will skip on bug-fix
      makeSnapshot("perf"), // no conditions → always activates
    ];

    const result = await runPipelineWith(reviewers, "bug-fix");

    expect(result.steps?.["security"]?.[0]?.outcome.verdict).toBe("skipped");
    expect(result.steps?.["perf"]?.[0]?.outcome.verdict).not.toBe("skipped");
    expect(result.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-ACT-05: no reviewers — existing pipeline behavior unchanged
// ---------------------------------------------------------------------------

describe("TC-ACT-05: no reviewers — regression check", () => {
  it("pipeline completes normally with empty reviewers array", async () => {
    const result = await runPipelineWith([]);
    expect(result.status).toBe("awaiting-archive");
  });
});
