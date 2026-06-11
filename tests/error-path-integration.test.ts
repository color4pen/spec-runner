/**
 * Error path integration tests for pipeline failure scenarios.
 *
 * TC-T04-judge:    follow-up retry exhaustion (judge) → escalation → awaiting-resume
 * TC-T04-producer: follow-up retry exhaustion (producer) → completionVerdict → continues
 * TC-T05-dn:       findings decision-needed → escalation → awaiting-resume
 * TC-T05-ref:      blocking finding referencing non-existent file → escalation
 * TC-T06:          session termination → SESSION_TERMINATED in state → awaiting-resume
 * TC-T07:          verification partial failure (build ok, test fail) → build-fixer runs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { SpawnFn } from "../src/util/spawn.js";
import type { AgentRunner, AgentRunResult } from "../src/core/port/agent-runner.js";
import type { JobState } from "../src/state/schema.js";
import type { PipelineDeps } from "../src/core/types.js";
import type { RuntimeStrategy } from "../src/core/port/runtime-strategy.js";
import { buildInitialJobState } from "../src/store/job-state-store.js";
import { EventBus } from "../src/core/event/event-bus.js";
import { StepExecutor } from "../src/core/step/executor.js";
import { Pipeline } from "../src/core/pipeline/pipeline.js";
import { makeStoreFactory } from "./helpers/store-factory.js";
import { verificationResultPath } from "../src/util/paths.js";
import {
  buildPipelineMockClient,
  buildMockGithubClient,
} from "./helpers/pipeline-mock-client.js";
import { createManagedAgentRunner } from "../src/adapter/managed-agent/agent-runner.js";
import type { GitHubClient } from "../src/core/port/github-client.js";

// Mock verification runner (same as other integration test files)
vi.mock("../src/core/verification/runner.js", () => ({
  runVerification: vi.fn().mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
    const outputPath = `${cwd}/${verificationResultPath(slug)}`;
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(outputPath, `# Verification Result — ${slug} — iter 1\n\n## Verdict: passed\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n`)
    );
    return { slug, verdict: "passed" as const, phases: [] };
  }),
}));

// Mock pr-create runner (same as other integration test files)
vi.mock("../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn().mockImplementation(async (input: { branch: string; baseBranch: string; title: string; body: string; cwd?: string }) => {
    const cwd = input.cwd ?? process.cwd();
    const slug = "test-slug";
    const { prCreateResultPath } = await import("../src/util/paths.js");
    const outputPath = `${cwd}/${prCreateResultPath(slug)}`;
    const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(outputPath, `# pr-create Result — ${slug}\n\n## Status: success\n\n## PR\n\n- **URL**: https://github.com/testowner/testrepo/pull/1\n- **Number**: 1\n`)
    );
    return { status: "created" as const, url: "https://github.com/testowner/testrepo/pull/1", number: 1 };
  }),
}));

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "error-path-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
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
  const stateWithBranch = { ...state, branch: `change/test-slug-${state.jobId.slice(0, 8)}` };
  await makeStoreFactory(tempDir)(stateWithBranch.jobId).persist(stateWithBranch);
  return stateWithBranch;
}

function buildConfig(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    agents: {
      "request-review": { agentId: "request-review-agent-id", definitionHash: "sha256:rrv", lastSyncedAt: new Date().toISOString() },
      design: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:ghi", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
      "test-case-gen": { agentId: "test-case-gen-agent-id", definitionHash: "sha256:tcg", lastSyncedAt: new Date().toISOString() },
      implementer: { agentId: "implementer-agent-id", definitionHash: "sha256:imp", lastSyncedAt: new Date().toISOString() },
      "build-fixer": { agentId: "build-fixer-agent-id", definitionHash: "sha256:bfx", lastSyncedAt: new Date().toISOString() },
      "code-review": { agentId: "code-review-agent-id", definitionHash: "sha256:crv", lastSyncedAt: new Date().toISOString() },
      "code-fixer": { agentId: "code-fixer-agent-id", definitionHash: "sha256:cfx", lastSyncedAt: new Date().toISOString() },
      conformance: { agentId: "conformance-agent-id", definitionHash: "sha256:cnf", lastSyncedAt: new Date().toISOString() },
      "adr-gen": { agentId: "adr-gen-agent-id", definitionHash: "sha256:adr", lastSyncedAt: new Date().toISOString() },
    },
    pipeline: { maxRetries: 2 },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    specReview: { pollIntervalMs: 100 },
    ...overrides,
  };
}

function buildRequest() {
  return { type: "feature", title: "Test", slug: "test", baseBranch: "main", content: "Do something", adr: false };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRunner(
  client: ReturnType<typeof buildPipelineMockClient>["client"],
  githubClient: GitHubClient,
) {
  return createManagedAgentRunner({ sessionClient: client, githubClient, repo: buildRepo(), githubToken: "ghp_test" });
}

// ---------------------------------------------------------------------------
// Mini-pipeline helpers (for executor-level tests with controlled runner)
// ---------------------------------------------------------------------------

/**
 * Create an AgentRunner that returns the given toolResult for all run() calls.
 * followUpAttempts=maxAttempts simulates exhausted retry budget.
 */
function makeMockRunnerWithToolResult(
  toolResult: Record<string, unknown> | null,
  followUpAttempts = 0,
): AgentRunner {
  return {
    run: vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult,
      followUpAttempts,
    } as AgentRunResult),
  };
}

async function createRunningJobState(): Promise<JobState> {
  const created = buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug: "test-slug",
    },
    repository: { owner: "owner", name: "repo" },
  });
  const store = makeStoreFactory(tempDir)(created.jobId);
  const running: JobState = { ...created, status: "running", branch: "feat/test-slug" };
  await store.persist(running);
  return running;
}

function makePipelineDeps(): PipelineDeps {
  return {
    config: { version: 1, runtime: "managed", agents: {} } as PipelineDeps["config"],
    slug: "test-slug",
    request: {
      type: "new-feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "# Test\n",
      adr: false,
    },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "owner",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    cwd: tempDir,
  };
}

/** Build a minimal spec-review step (judge) for mini-pipeline tests. */
async function makeSpecReviewStep() {
  const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
  return SpecReviewStep;
}

/** Build a minimal implementer step (producer) for mini-pipeline tests. */
async function makeImplementerStep() {
  const { ImplementerStep } = await import("../src/core/step/implementer.js");
  return ImplementerStep;
}

// ===========================================================================
// TC-T04-judge: follow-up retry exhaustion (judge) → escalation → awaiting-resume
// ===========================================================================

describe("TC-T04-judge: follow-up retry exhaustion (judge) → escalation → awaiting-resume", () => {
  it("spec-review with toolResult=null (maxAttempts exhausted) yields escalation verdict and awaiting-resume", async () => {
    // Runner returns null toolResult with followUpAttempts=2 (maxAttempts exhausted)
    const runner = makeMockRunnerWithToolResult(null, 2);
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const specReviewStep = await makeSpecReviewStep();

    // Mini pipeline: spec-review on escalation → escalate
    const transitions = [
      { step: "spec-review", on: "escalation", to: "escalate" },
      { step: "spec-review", on: "needs-fix", to: "escalate" },
      { step: "spec-review", on: "approved", to: "end" },
    ];
    const steps = new Map<string, import("../src/core/step/types.js").Step>([
      ["spec-review", specReviewStep],
    ]);
    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 2,
      executor,
      events,
      loopName: "spec-review",
    });

    const jobState = await createRunningJobState();
    const deps = makePipelineDeps();

    const result = await pipeline.run("spec-review", jobState, deps);

    // Observable job state assertions
    expect(result.status).toBe("awaiting-resume");
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    const lastRun = specReviewArr?.[specReviewArr.length - 1];
    const lastVerdict = lastRun?.outcome?.verdict;
    expect(lastVerdict).toBe("escalation");

    // followUpAttempts stored in step result
    expect(lastRun?.outcome?.followUpAttempts).toBe(2);
  });
});

// ===========================================================================
// TC-T04-producer: follow-up retry exhaustion (producer) → completionVerdict → continues
// ===========================================================================

describe("TC-T04-producer: follow-up retry exhaustion (producer) → completionVerdict success → pipeline continues", () => {
  it("implementer with toolResult=null (maxAttempts exhausted) yields success verdict and pipeline proceeds", async () => {
    // Runner returns null toolResult with followUpAttempts=2 (maxAttempts exhausted)
    const runner = makeMockRunnerWithToolResult(null, 2);
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const implementerStep = await makeImplementerStep();

    // Mini pipeline: implementer on success → end
    const transitions = [
      { step: "implementer", on: "success", to: "end" },
      { step: "implementer", on: "error", to: "escalate" },
    ];
    const steps = new Map<string, import("../src/core/step/types.js").Step>([
      ["implementer", implementerStep],
    ]);
    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 2,
      executor,
      events,
      loopName: "implementer",
    });

    const jobState = await createRunningJobState();
    const deps = makePipelineDeps();

    const result = await pipeline.run("implementer", jobState, deps);

    // Observable job state assertions
    // Producer with null toolResult falls back to completionVerdict ("success" for implementer)
    expect(result.status).toBe("awaiting-archive");
    const implementerArr = result.steps?.["implementer"];
    expect(implementerArr).toBeDefined();
    const lastRun = implementerArr?.[implementerArr.length - 1];
    const lastVerdict = lastRun?.outcome?.verdict;
    expect(lastVerdict).toBe("success");
    // followUpAttempts stored in step result
    expect(lastRun?.outcome?.followUpAttempts).toBe(2);
  });
});

// ===========================================================================
// TC-T05-dn: findings decision-needed → escalation → awaiting-resume
// ===========================================================================

describe("TC-T05-dn: spec-review with decision-needed finding → verdict escalation → awaiting-resume", () => {
  it("decision-needed finding in spec-review causes pipeline to halt at awaiting-resume", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // decision-needed verdict: ok:true + resolution="decision-needed" finding
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["decision-needed"],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["decision-needed"],
    });

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

    // Pipeline halts — decision-needed triggers escalation
    expect(result.status).toBe("awaiting-resume");

    // spec-review verdict should be "escalation"
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    const lastItem = specReviewArr?.[specReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");
  });
});

// ===========================================================================
// TC-T05-ref: blocking finding referencing non-existent file → escalation
// ===========================================================================

describe("TC-T05-ref: spec-review with high finding referencing non-existent file → escalation (via verifyFindingRefs)", () => {
  it("verifyFindingRefs returning non-empty forces verdict to escalation", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // spec-review returns needs-fix (high finding) — but verifyFindingRefs will say file doesn't exist
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix"],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["needs-fix"],
    });

    // RuntimeStrategy that declares the file reference non-existent
    const runtimeStrategyWithMissingRef: Partial<RuntimeStrategy> = {
      async verifyFindingRefs(_refs, _cwd, _branch) {
        // All refs are non-existent
        return _refs.map((r) => ({ file: r.file }));
      },
      async captureHeadSha() { return null; },
      async prepareStepArtifacts() {},
      async finalizeStepArtifacts() {},
      async validateStepInputs() {},
      async validateStepOutputs(): Promise<import("../src/core/port/output-contract.js").OutputCheckResult> { return { violations: [] }; },
      async commitFinalState() {},
      async persistJobState() {},
      async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
      async setupWorkspace() { return { cwd: "" }; },
      buildDeps() { return {} as PipelineDeps; },
      registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
      async teardown() {},
      async *query() {},
      createAgentRunner() {
        return {
          async run(): Promise<AgentRunResult> {
            return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
          },
        };
      },
    };

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
      runtimeStrategy: runtimeStrategyWithMissingRef as RuntimeStrategy,
    });

    // Pipeline halts — non-existent file ref triggers escalation
    expect(result.status).toBe("awaiting-resume");

    // spec-review verdict should be "escalation"
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    const lastItem = specReviewArr?.[specReviewArr.length - 1];
    expect(lastItem ? toLegacyStepResult(lastItem).verdict : undefined).toBe("escalation");
  });
});

// ===========================================================================
// TC-T06: session termination → SESSION_TERMINATED in error state → awaiting-resume
// ===========================================================================

describe("TC-T06: session termination → SESSION_TERMINATED error code → awaiting-resume (resumable)", () => {
  it("implementer session terminated sets error.code=SESSION_TERMINATED and transitions to awaiting-resume", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // Terminate implementer's session via pollUntilComplete
    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      terminateAgentId: "implementer-agent-id",
      sessionIds: [
        "sess_rr_001",
        "sess_design_001",
        "sess_spec_review_001",
        "sess_test_case_gen_001",
        "sess_implementer_001",  // this one will be terminated
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
    });

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

    // Observable: SESSION_TERMINATED error recorded in state
    expect(result.error?.code).toBe("SESSION_TERMINATED");

    // Job is in awaiting-resume — resumable state, not failed permanently
    expect(result.status).toBe("awaiting-resume");

    // resumePoint records the failing step for re-entry
    expect(result.resumePoint?.step).toBeDefined();
  });
});

// ===========================================================================
// TC-T07: verification partial failure (build ok, test fail) → build-fixer runs
// ===========================================================================

describe("TC-T07: verification partial failure (build passed, test failed) → build-fixer runs", () => {
  it("verification with mixed phase results (build ok, test fail) routes to build-fixer", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const { runVerification } = await import("../src/core/verification/runner.js");
    const jobState = await makeJobState();

    let verificationCallCount = 0;

    // First call: partial failure (build passed, test failed)
    // Second call: passed (so pipeline completes)
    vi.mocked(runVerification).mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
      const outputPath = `${cwd}/${verificationResultPath(slug)}`;
      const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });

      const isFirst = verificationCallCount === 0;
      verificationCallCount++;

      if (isFirst) {
        // Partial failure: build ok, test failed → verdict "failed"
        await fs.writeFile(
          outputPath,
          `# Verification Result — ${slug} — iter 1\n\n## Verdict: failed\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n| 1 | build | passed | 1s | 0 |\n| 2 | test | failed | 3s | 1 |\n`,
        );
        return {
          slug,
          verdict: "failed" as const,
          phases: [
            { phase: "build", status: "passed" as const, stdout: "", stderr: "", exitCode: 0, durationMs: 1000 },
            { phase: "test", status: "failed" as const, stdout: "", stderr: "", exitCode: 1, durationMs: 3000 },
          ],
        };
      } else {
        // Subsequent call: passed
        await fs.writeFile(
          outputPath,
          `# Verification Result — ${slug} — iter 2\n\n## Verdict: passed\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n| 1 | build | passed | 1s | 0 |\n| 2 | test | passed | 2s | 0 |\n`,
        );
        return {
          slug,
          verdict: "passed" as const,
          phases: [
            { phase: "build", status: "passed" as const, stdout: "", stderr: "", exitCode: 0, durationMs: 1000 },
            { phase: "test", status: "passed" as const, stdout: "", stderr: "", exitCode: 0, durationMs: 2000 },
          ],
        };
      }
    });

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_rr_001",
        "sess_design_001",
        "sess_spec_review_001",
        "sess_test_case_gen_001",
        "sess_implementer_001",
        // no session for verification (CLI step)
        "sess_build_fixer_001",
        // no session for verification iter 2
        "sess_code_review_001",
        "sess_conformance_001",
        "sess_adr_gen_001",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
      codeReviewVerdicts: ["approved"],
    });

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

    // Pipeline should complete after build-fixer fixes the test failure
    expect(result.status).toBe("awaiting-archive");

    // verification: 2 entries (iter1 failed, iter2 passed)
    const verificationArr = result.steps?.["verification"];
    expect(verificationArr).toBeDefined();
    expect(verificationArr?.length).toBe(2);
    // First verification verdict: failed (partial failure)
    const firstVer = verificationArr?.[0];
    expect(firstVer ? toLegacyStepResult(firstVer).verdict : undefined).toBe("failed");
    // Second verification verdict: passed
    const secondVer = verificationArr?.[1];
    expect(secondVer ? toLegacyStepResult(secondVer).verdict : undefined).toBe("passed");

    // build-fixer: at least 1 entry (triggered by partial verification failure)
    const buildFixerArr = result.steps?.["build-fixer"];
    expect(buildFixerArr).toBeDefined();
    expect((buildFixerArr?.length ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
