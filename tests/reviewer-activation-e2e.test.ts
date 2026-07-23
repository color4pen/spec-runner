/**
 * T-11 / round-all-skip-pass-through: E2E mock pipeline tests for reviewer activation conditions.
 *
 * Coverage:
 * - TC-ACT-01 / TC-001: paths 不一致 reviewer が skip → job は "awaiting-archive" で完了（構造的 skip）
 * - TC-ACT-02: requestTypes 一致で起動、不一致で skip → job は "awaiting-archive"（構造的 skip）
 * - TC-ACT-03: 条件無指定 reviewer は常時起動する
 * - TC-ACT-04 / TC-002: skip ≠ approved — skipped reviewer が後続 reviewer / conformance へ進む
 *   - first test: 単一 reviewer skip → "awaiting-archive"（構造的 skip）
 *   - second test: 1 skip + 1 approved → "awaiting-archive"（mixed → approved, 変わらず）
 * - TC-ACT-05: reviewers/ 空の場合は既存挙動と完全一致（regression）
 *
 * TC-040 (updated to new behavior): 単一 reviewer が activation 不一致で skip →
 *   job は "awaiting-archive" で完了（構造的 skip per round-all-skip-pass-through）
 *   CHANGE from old behavior: was "awaiting-resume" (all-skip escalation per D6).
 *   Affects: TC-ACT-01, TC-ACT-02 (requestTypes不一致), TC-ACT-04 (first test)
 *
 * TC-041 (unchanged): reviewer が 1 名 skip + 1 名 approved → job は "awaiting-archive" で完了
 *   (mixed verdict = approved, not all-skip — behavior unchanged)
 *   Affects: TC-ACT-04 (second test / mixed case) — stays "awaiting-archive"
 *
 * NEW for round-all-skip-pass-through:
 *   TC-001: 全 member 担当外 skip の round で job が awaiting-archive まで到達する（E2E）
 *   TC-002: 単一 reviewer の全 skip も構造的 skip として通る（E2E）
 *   TC-004: skip した member の理由が journal step-attempt record に残る
 *   TC-005: 全 skip round でも member 証跡が消えない
 *   TC-010: 旧 ROUND_ALL_MEMBERS_SKIPPED 状態からの resume が完走する（後方回復経路）
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
import { fold } from "../src/store/event-journal.js";
import { buildPipelineForJob } from "../src/core/pipeline/index.js";
import type { JobState } from "../src/state/schema.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../src/core/pipeline/types.js";

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

describe("TC-ACT-01 / TC-001: paths 不一致 reviewer is skipped → job reaches awaiting-archive (structural skip)", () => {
  it("TC-001/TC-ACT-01: reviewer with paths condition is skipped; job reaches awaiting-archive (structural skip)", async () => {
    // paths: ["src/auth/**"] — managed runtime returns [] for changedFiles → skip
    // TC-001: all-skip = structural skip → "awaiting-archive" (gate pass-through)
    //
    // CHANGE from custom-reviewer-canon-binding D6: was "awaiting-resume" (all-skip escalation).
    // New behavior per round-all-skip-pass-through: structural skip proceeds to awaiting-archive.
    //
    // Destruction confirmation (TC-001): reverting aggregateVerdict all-skip to "escalation"
    // and/or restoring ROUND_ALL_MEMBERS_SKIPPED terminal seam → result.status === "awaiting-resume".
    const reviewers = [
      makeSnapshot("security", { paths: ["src/auth/**"] }),
    ];

    const result = await runPipelineWith(reviewers);

    // TC-001/TC-040 (updated): all-skip → structural skip → "awaiting-archive" (not "awaiting-resume")
    expect(result.status).toBe("awaiting-archive");

    // TC-005: security reviewer should have been skipped with skip record preserved
    const securityRuns = result.steps?.["security"];
    expect(securityRuns, "security step should have a run record").toBeDefined();
    expect(securityRuns?.length).toBe(1);
    const run = securityRuns![0]!;
    expect(run.outcome.verdict).toBe("skipped");
    expect(run.outcome.skipReason).toBeDefined();
    expect(run.outcome.skipReason).toContain("src/auth/**");

    // Pipeline should still complete (skip → regression-gate → conformance → pr-create)
    expect(result.steps?.["conformance"], "conformance should have run after structural skip").toBeDefined();
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

  it("TC-ACT-02 (requestTypes不一致): reviewer is skipped when requestType does NOT match → awaiting-archive (structural skip)", async () => {
    // TC-ACT-02 (requestTypes不一致): request type "bug-fix" but reviewer activates only for "spec-change" → skip
    // TC-040 (updated): all-skip → structural skip → "awaiting-archive" (not "awaiting-resume")
    //
    // CHANGE from custom-reviewer-canon-binding: was "awaiting-resume".
    // New behavior: structural skip proceeds to awaiting-archive.
    //
    // Destruction confirmation: reverting aggregateVerdict all-skip to "escalation" causes
    // result.status === "awaiting-resume" instead of "awaiting-archive".
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

    // TC-040 (updated): all-skip → structural skip → "awaiting-archive"
    expect(result.status).toBe("awaiting-archive");
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

describe("TC-ACT-04 / TC-002: skipped verdict is distinct from approved; structural skip reaches awaiting-archive", () => {
  it("TC-002/TC-ACT-04: skipped step has verdict 'skipped' (not 'approved'); structural skip reaches awaiting-archive", async () => {
    // TC-002: single reviewer that skips is "all members skipped" = structural skip.
    // The per-member verdict remains "skipped" (not "approved") — vocabulary is preserved.
    // Only the aggregate changes from "escalation" to "approved" (structural skip).
    //
    // TC-040 (updated): all-skip → structural skip → "awaiting-archive" (not "awaiting-resume")
    //
    // CHANGE: was "awaiting-resume" (old all-skip escalation). Now "awaiting-archive".
    //
    // Destruction confirmation (TC-002): reverting aggregateVerdict all-skip to "escalation"
    // causes result.status === "awaiting-resume" instead of "awaiting-archive".
    const reviewers = [
      makeSnapshot("security", { requestTypes: ["spec-change"] }),
    ];

    const result = await runPipelineWith(reviewers, "bug-fix");

    const run = result.steps?.["security"]?.[0];
    // Per-member verdict stays "skipped" (vocabulary preserved, not "approved")
    expect(run?.outcome.verdict).toBe("skipped");
    expect(run?.outcome.verdict).not.toBe("approved");
    // TC-002/TC-040 (updated): all-skip → structural skip → "awaiting-archive"
    expect(result.status).toBe("awaiting-archive");
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

// ---------------------------------------------------------------------------
// TC-004 / TC-005: per-member skip 証跡が journal に残る
// (round-all-skip-pass-through requirement 2 / D-journal)
// ---------------------------------------------------------------------------

describe("TC-004 / TC-005: per-member skip evidence preserved in journal and state", () => {
  it("TC-004/TC-005: skip member's step-attempt record is in events.jsonl with verdict 'skipped' and skipReason", async () => {
    // TC-004: skip した member の理由が journal step-attempt record に残る
    // TC-005: 全 skip round でも member 証跡が消えない
    //
    // Design D-journal: per-member skip records are written via projectSkip + commitRound
    // regardless of the all-skip structural-skip change. The journaling path is not changed.
    //
    // This test verifies that:
    //   1. state.steps["security"][0].outcome.verdict === "skipped" (TC-005: state has record)
    //   2. state.steps["security"][0].outcome.skipReason contains the path pattern (TC-004)
    //   3. events.jsonl fold() also contains the step-attempt record (TC-004: journal has record)
    //   4. events.jsonl history contains the "security-skipped" transition record (TC-004)
    //
    // Destruction confirmation: removing the members.push() call in parallel-review-round.ts
    // (the per-member skip push) would cause TC-004/TC-005 to fail — skip records would vanish.
    const reviewers = [
      makeSnapshot("security", { paths: ["src/auth/**"] }),
    ];

    const result = await runPipelineWith(reviewers);

    // TC-005: state.steps has the skip record
    const securityRun = result.steps?.["security"]?.[0];
    expect(securityRun, "TC-005: state.steps must contain security skip record").toBeDefined();
    expect(securityRun?.outcome.verdict).toBe("skipped");
    expect(securityRun?.outcome.skipReason, "TC-004: skipReason must be set").toBeDefined();
    expect(securityRun?.outcome.skipReason).toContain("src/auth/**");

    // TC-004: events.jsonl also has the step-attempt record
    // The changeDir for test store is: tempDir/.specrunner/test-jobs/<jobId>/
    const eventsPath = path.join(
      tempDir, ".specrunner", "test-jobs", result.jobId, "events.jsonl",
    );
    const eventsContent = await fs.readFile(eventsPath, "utf-8");
    const folded = fold(eventsContent);

    // TC-004: journal step-attempt record for "security" has verdict "skipped" + skipReason
    const journalSecurityRun = folded.steps["security"]?.[0];
    expect(journalSecurityRun, "TC-004: journal must contain security step-attempt record").toBeDefined();
    expect(journalSecurityRun?.outcome.verdict).toBe("skipped");
    expect(journalSecurityRun?.outcome.skipReason, "TC-004: journal skip record must have skipReason").toBeDefined();
    expect(journalSecurityRun?.outcome.skipReason).toContain("src/auth/**");

    // TC-004: transition record "security-skipped" must be in journal history
    const skippedTransition = folded.history.find((h) => h.step === "security-skipped");
    expect(skippedTransition, "TC-004: journal history must contain 'security-skipped' transition").toBeDefined();
    expect(skippedTransition?.status).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// TC-010: 旧 ROUND_ALL_MEMBERS_SKIPPED 状態からの resume が完走する（後方回復経路）
// (round-all-skip-pass-through requirement 6)
// ---------------------------------------------------------------------------

describe("TC-010: backward recovery — job stopped with ROUND_ALL_MEMBERS_SKIPPED resumes to awaiting-archive", () => {
  it("TC-010: seeded ROUND_ALL_MEMBERS_SKIPPED awaiting-resume state re-runs and reaches awaiting-archive", async () => {
    // TC-010: a job that was stopped at awaiting-resume with state.error.code ===
    // "ROUND_ALL_MEMBERS_SKIPPED" under the old behavior must be recoverable under new semantics.
    //
    // Resume flow:
    //   1. transitionJob(state, "running", { patch: { error: null, ... } }) — clears error
    //   2. pipeline.run(coordinatorStep, state, deps) — starts from coordinator
    //   3. All members skip → structural skip → approved → roundError = null
    //   4. commitRound sets state.error = null (already null, but also clears any sticky error)
    //   5. Terminal seam: nextStep="end", state.status="running", state.error=null → awaiting-archive
    //
    // This test simulates the post-resume state (error=null, status=running, step=coordinator)
    // and runs the pipeline from the coordinator step.
    //
    // Destruction confirmation (TC-010): if aggregateVerdict all-skip returns "escalation" OR
    // ROUND_ALL_MEMBERS_SKIPPED roundError is restored → terminal seam routes to "awaiting-resume"
    // instead of "awaiting-archive", causing this test to fail.
    const reviewers = [
      makeSnapshot("security", { paths: ["src/auth/**"] }),
    ];

    // Build the initial job state with reviewer configured
    const initialState = await makeJobState(reviewers, "bug-fix");

    // Simulate resume: transition to "running", clear error, set step to coordinator
    // (mirrors what resume.ts does: transitionJob + patch: { error: null })
    const resumedState: JobState = {
      ...initialState,
      status: "running" as const,
      step: CUSTOM_REVIEWERS_STEP_NAME,
      error: null,
      // reviewerStatuses: not set → deriveReviewerStatuses will init all as "pending"
      reviewerStatuses: [{ name: "security", status: "pending", approvedAtCommit: null, invalidatedByCommit: null }],
    };

    // Persist the seeded state
    await makeStoreFactory(tempDir)(resumedState.jobId).persist(resumedState);

    // Build pipeline and run from the coordinator step (simulating resume)
    const client = buildMockClient();
    const githubClient = buildGithubClient();
    const reviewerNames = reviewers.map((r) => r.name);
    const deps = {
      client,
      config: buildConfig(reviewerNames) as Parameters<typeof buildPipelineForJob>[1]["config"],
      request: {
        type: "bug-fix" as const,
        title: "Backward Recovery Test",
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
    };

    // Run from the coordinator step (not from the beginning)
    const pipeline = buildPipelineForJob(resumedState, deps as never);
    const finalState = await pipeline.run(CUSTOM_REVIEWERS_STEP_NAME, resumedState, deps as never);

    // TC-010: backward recovery — must reach awaiting-archive (not awaiting-resume)
    expect(finalState.status).toBe("awaiting-archive");
    // TC-010: state.error must be null (sticky error cleared by structural skip round)
    expect(finalState.error).toBeNull();
  });
});
