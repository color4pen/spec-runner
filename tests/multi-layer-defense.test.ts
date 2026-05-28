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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "multi-layer-defense-test-"));
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

// D5: type defaults to "spec-change" (not "feature") to match the multi-layer defense context.
// The no-specs-for-required-type rule in delta-spec-validator triggers for spec-change/new-feature.
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
    listEvents: vi.fn().mockResolvedValue([
      { type: "agent.custom_tool_use", name: "report_result", id: "mock-report-id", input: { ok: true } },
    ]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
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

// ---------------------------------------------------------------------------
// TC-MLD-01: Happy path — all 3 layers pass, pipeline completes
// Layer summary:
//   design (layer C): creates specs/ correctly (self-check passes)
//   dsv    (layer A): approved (no violations)
//   spec-review (layer B): approved (content is sufficient)
// ---------------------------------------------------------------------------

// TC-MLD-01: 3 層全正常 — design creates specs, dsv approved, spec-review approved → pipeline completes
describe("TC-MLD-01: happy path — all 3 layers pass, pipeline completes", () => {
  it("design → dsv(approved) → spec-review(approved) → awaiting-merge", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // All layers pass: dsv approved (default mock), spec-review approved
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

    // delta-spec-validation: at least 1 run approved (1st phase); 2nd phase adds one more after code-review
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps, "delta-spec-validation should be defined").toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(1);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("approved");

    // spec-review: 1 run, approved
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr, "spec-review should be defined").toBeDefined();
    expect(specReviewArr?.length).toBe(1);
    expect(toLegacyStepResult(specReviewArr![0]!).verdict).toBe("approved");

    // delta-spec-fixer: not invoked (dsv approved)
    expect(result.steps?.["delta-spec-fixer"]).toBeUndefined();

    // spec-fixer: not invoked (spec-review approved)
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // Pipeline completes past spec-review
    expect(result.steps?.["implementer"], "implementer should have run").toBeDefined();
    expect(result.steps?.["verification"], "verification should have run").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-MLD-02: Sub-B catch — spec-review catches insufficient delta spec content
// Layer behavior:
//   design (layer C): missed checklist — creates specs/ but content is insufficient
//   dsv    (layer A): passes (structure OK) — does NOT catch content quality
//   spec-review (layer B): catches it → triggers spec-fixer → re-dsv → re-spec-review
// State transition: dsv(approved) → spec-review(needs-fix) → spec-fixer → dsv(approved) → spec-review(approved)
// ---------------------------------------------------------------------------

// TC-MLD-02: Sub-B catch — dsv passes but spec-review catches insufficient delta spec content
// State: dsv(approved) → spec-review(needs-fix) → spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-02: spec-review catches insufficient delta spec → spec-fixer → re-dsv → re-spec-review approved", () => {
  it("dsv approved both times, spec-review needs-fix→approved via spec-fixer route", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // dsv is approved on both calls (structure is valid, content quality is out of dsv scope)
    // mockDeltaSpecValidator default: { ok: true } — already reset in beforeEach
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

    // delta-spec-validation: at least 2 runs (once after design, once after spec-fixer);
    // 2nd phase adds one more run after code-review.
    // All approved — dsv never needs-fix
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps, "delta-spec-validation should be defined").toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(2);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("approved"); // initial dsv after design
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved"); // re-dsv after spec-fixer

    // spec-review: 2 runs (needs-fix → approved)
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr, "spec-review should be defined").toBeDefined();
    expect(specReviewArr?.length).toBe(2);
    expect(toLegacyStepResult(specReviewArr![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(specReviewArr![1]!).verdict).toBe("approved");

    // spec-fixer: 1 run (triggered by spec-review needs-fix)
    // This is the Sub-B path: spec-fixer (not delta-spec-fixer)
    const specFixerArr = result.steps?.["spec-fixer"];
    expect(specFixerArr, "spec-fixer should be defined").toBeDefined();
    expect(specFixerArr?.length).toBe(1);

    // delta-spec-fixer: NOT invoked (dsv was always approved)
    expect(result.steps?.["delta-spec-fixer"]).toBeUndefined();

    // Pipeline completes past spec-review
    expect(result.steps?.["implementer"], "implementer should have run").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-MLD-03: Sub-A catch — dsv catches legacy structure violation
// Layer behavior:
//   design (layer C): missed checklist — created delta-spec.md (flat file) instead of specs/<cap>/spec.md
//   dsv    (layer A): catches legacy-flat-file violation → triggers delta-spec-fixer
//   spec-review (layer B): approves after dsv fixes the structure
// State transition: dsv(needs-fix) → delta-spec-fixer → dsv(approved) → spec-review(approved)
// ---------------------------------------------------------------------------

// TC-MLD-03: Sub-A catch — design creates legacy structure, dsv catches violation
// State: dsv(needs-fix) → delta-spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-03: dsv catches legacy-flat-file → delta-spec-fixer → re-dsv approved → spec-review approved", () => {
  it("dsv needs-fix first call, approved after delta-spec-fixer; spec-fixer not invoked", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // dsv: legacy-flat-file violation on first call, clean on second
    mockDeltaSpecValidator
      .mockResolvedValueOnce({
        ok: false,
        violations: [{
          path: "/tmp/changes/test-slug/delta-spec.md",
          reason: "legacy-flat-file",
          suggested: "Move to specs/<capability>/spec.md",
        }],
      })
      .mockResolvedValueOnce({ ok: true });

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

    // delta-spec-validation: at least 2 runs (1st phase: needs-fix → approved);
    // 2nd phase adds one more run after code-review (approved via default mock).
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps, "delta-spec-validation should be defined").toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(2);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved");

    // delta-spec-fixer: 1 run (triggered by dsv needs-fix)
    // This is the Sub-A path: delta-spec-fixer (not spec-fixer)
    const dsfSteps = result.steps?.["delta-spec-fixer"];
    expect(dsfSteps, "delta-spec-fixer should be defined").toBeDefined();
    expect(dsfSteps?.length).toBe(1);

    // spec-review: 1 run, approved (spec-review content was fine, only structure was wrong)
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr, "spec-review should be defined").toBeDefined();
    expect(specReviewArr?.length).toBe(1);
    expect(toLegacyStepResult(specReviewArr![0]!).verdict).toBe("approved");

    // spec-fixer: NOT invoked (spec-review was approved)
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // Pipeline completes past spec-review
    expect(result.steps?.["implementer"], "implementer should have run").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-MLD-04: 2-layer failure 5-a — design + spec-review both fail, dsv is sole defense
// Layer behavior:
//   design (layer C): BUGGED — missed checklist, skipped creating specs/ entirely
//   spec-review (layer B): BUGGED — does not check for missing delta spec, returns approved
//   dsv    (layer A): WORKING — catches no-specs-for-required-type (PR #282 reproduction)
// State transition: dsv(needs-fix) → delta-spec-fixer → dsv(approved) → spec-review(approved)
// This reproduces the PR #282 scenario where only dsv stands between merge and a missing delta spec.
// ---------------------------------------------------------------------------

// TC-MLD-04: 2-layer failure 5-a — design missed checklist + spec-review bugged
// Only dsv remains as defense → catches no-specs-for-required-type (PR #282 reproduction)
// State: dsv(needs-fix) → delta-spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-04: design + spec-review both fail — dsv catches no-specs-for-required-type as sole defense", () => {
  it("dsv catches no-specs-for-required-type; spec-review (bugged) approves after delta-spec-fixer repairs", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // dsv: no-specs-for-required-type violation on first call (same as PR #282 scenario)
    // After delta-spec-fixer creates the missing specs/, second call returns clean
    mockDeltaSpecValidator
      .mockResolvedValueOnce({
        ok: false,
        violations: [{
          path: "specrunner/changes/test-slug/specs/",
          reason: "no-specs-for-required-type",
          suggested: "Add at least one delta spec under specs/<capability>/spec.md",
        }],
      })
      .mockResolvedValueOnce({ ok: true });

    // spec-review is "bugged" = always approves regardless of spec content
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

    // delta-spec-validation: at least 2 runs (1st phase: needs-fix → approved);
    // 2nd phase adds one more after code-review (approved via default mock).
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps, "delta-spec-validation should be defined").toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(2);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("needs-fix");
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved");

    // delta-spec-fixer: 1 run (dsv sole defense caught the violation)
    const dsfSteps = result.steps?.["delta-spec-fixer"];
    expect(dsfSteps, "delta-spec-fixer should be defined").toBeDefined();
    expect(dsfSteps?.length).toBe(1);

    // spec-review: 1 run, approved (bugged — would have missed the violation before dsv fixed it)
    // This is intentional: after delta-spec-fixer repairs specs/, spec-review runs in the
    // "fixed state" and its bug is masked. The key assertion is that dsv caught it.
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr, "spec-review should be defined").toBeDefined();
    expect(specReviewArr?.length).toBe(1);
    expect(toLegacyStepResult(specReviewArr![0]!).verdict).toBe("approved");

    // spec-fixer: NOT invoked (spec-review was approved — even though it was bugged)
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // Pipeline completes — dsv as sole working defense was sufficient to prevent bad merge
    expect(result.steps?.["implementer"], "implementer should have run").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-MLD-05: 2-layer failure 5-b — design + dsv both fail, spec-review is sole defense
// Layer behavior:
//   design (layer C): BUGGED — missed checklist, did not verify specs/ content
//   dsv    (layer A): BUGGED — no-specs-for-required-type rule not working, always returns ok
//   spec-review (layer B): WORKING — catches missing/insufficient delta spec content
// State transition: dsv(approved) → spec-review(needs-fix) → spec-fixer → dsv(approved) → spec-review(approved)
// Semantics: dsv "approved" both times because it is bugged (returns ok even when specs/ is absent/wrong).
//            spec-review catches the issue on first invocation and triggers spec-fixer.
//            After spec-fixer repairs the spec, the re-run path dsv→spec-review both approve.
// ---------------------------------------------------------------------------

// TC-MLD-05: 2-layer failure 5-b — design missed checklist + dsv rule bugged (always approves)
// Only spec-review remains as defense → catches missing delta spec content
// State: dsv(approved) → spec-review(needs-fix) → spec-fixer → dsv(approved) → spec-review(approved)
describe("TC-MLD-05: design + dsv both fail — spec-review catches as sole defense", () => {
  it("dsv bugged (always approved); spec-review catches needs-fix, spec-fixer repairs, re-review approves", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // dsv is "bugged" = always returns { ok: true }, even when specs/ is absent or wrong
    // mockDeltaSpecValidator default: { ok: true } — already reset in beforeEach (no override needed)

    // spec-review is the sole working defense: catches on first invocation, approves after spec-fixer
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

    // delta-spec-validation: at least 2 runs, ALL approved (dsv is bugged — never returns needs-fix);
    // 2nd phase adds one more run after code-review.
    const dsvSteps = result.steps?.["delta-spec-validation"];
    expect(dsvSteps, "delta-spec-validation should be defined").toBeDefined();
    expect(dsvSteps?.length).toBeGreaterThanOrEqual(2);
    expect(toLegacyStepResult(dsvSteps![0]!).verdict).toBe("approved"); // initial run — bugged, approves
    expect(toLegacyStepResult(dsvSteps![1]!).verdict).toBe("approved"); // re-run after spec-fixer — still bugged

    // spec-review: 2 runs (needs-fix on first, approved after spec-fixer)
    // spec-review is the sole working defense — it caught what design and dsv missed
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr, "spec-review should be defined").toBeDefined();
    expect(specReviewArr?.length).toBe(2);
    expect(toLegacyStepResult(specReviewArr![0]!).verdict).toBe("needs-fix"); // sole defense triggers
    expect(toLegacyStepResult(specReviewArr![1]!).verdict).toBe("approved"); // after spec-fixer repair

    // spec-fixer: 1 run (triggered by spec-review sole defense catch)
    const specFixerArr = result.steps?.["spec-fixer"];
    expect(specFixerArr, "spec-fixer should be defined").toBeDefined();
    expect(specFixerArr?.length).toBe(1);

    // delta-spec-fixer: NOT invoked (dsv was always approved — bugged)
    expect(result.steps?.["delta-spec-fixer"]).toBeUndefined();

    // Pipeline completes — spec-review as sole working defense was sufficient
    expect(result.steps?.["implementer"], "implementer should have run").toBeDefined();
  });
});
