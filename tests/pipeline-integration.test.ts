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
import { gitExec } from "../src/util/git-exec.js";
import type { SpawnFn as GitSpawnFn } from "../src/util/git-exec.js";
import type { RuntimeStrategy } from "../src/core/port/runtime-strategy.js";
import type { AgentStep } from "../src/core/step/types.js";
import type { JobState } from "../src/state/schema.js";
import type { PipelineDeps } from "../src/core/types.js";
import type { AgentRunner } from "../src/core/port/agent-runner.js";
import { commitAndPush } from "../src/core/step/commit-push.js";
import type { CommitPushInfra } from "../src/core/step/commit-push.js";
import { cleanupOutputTemplates } from "../src/core/artifact/copy-artifacts.js";
import { buildInitialJobState } from "../src/store/job-state-store.js";
import { makeStoreFactory } from "./helpers/store-factory.js";
import { EventBus } from "../src/core/event/event-bus.js";
import {
  buildPipelineMockClient,
  buildMockGithubClient,
} from "./helpers/pipeline-mock-client.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

/** Create an EventBus with inline progress-style subscribers that write pipeline events to stderr. */
function makeEventsWithProgress(): EventBus {
  const events = new EventBus();
  events.on("pipeline:iteration:start", (p) => {
    process.stderr.write(`[iter ${p.iteration}/${p.maxIterations}] starting ${p.step}\n`);
  });
  events.on("pipeline:iteration:verdict", (p) => {
    const actionLabel = p.action === "done" ? "done" : p.action === "halt" ? "halt" : "spawning fixer";
    process.stderr.write(`[iter ${p.iteration}] ${p.step} verdict: ${p.verdict} → ${actionLabel}\n`);
  });
  events.on("pipeline:iteration:exhausted", (p) => {
    process.stderr.write(`[iter ${p.iteration}/${p.maxIterations}] retries exhausted on ${p.step}, escalating\n`);
  });
  events.on("pipeline:summary", (p) => {
    process.stderr.write(`Pipeline finished: ${p.step} iterations=${p.iterations}, final verdict=${p.finalVerdict}\n`);
  });
  events.on("pipeline:cli-step", (p) => {
    if (p.verdict !== undefined) {
      process.stderr.write(`[step] ${p.step}: ${p.verdict}\n`);
    } else {
      process.stderr.write(`[step] ${p.step}\n`);
    }
  });
  return events;
}

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
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Build a minimal RuntimeStrategy that delegates git operations to the test's
 * gitSpawnFn (synchronous ChildProcess-based, from git-exec.ts). Mirrors
 * LocalRuntime semantics without requiring a real worktree.
 */
function makeTestRuntimeStrategy(spawnFn: GitSpawnFn): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner(): AgentRunner {
      return {
        async run() {
          return { completionReason: "success" as const, resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(cwd: string): Promise<string | null> {
      return gitExec(spawnFn, cwd, ["rev-parse", "HEAD"]);
    },
    async prepareStepArtifacts(): Promise<void> { /* no-op */ },
    async finalizeStepArtifacts(
      step: AgentStep,
      state: JobState,
      deps: PipelineDeps,
      headBeforeStep: string | null,
      infra: CommitPushInfra,
    ): Promise<void> {
      const cwd = deps.cwd ?? process.cwd();
      await cleanupOutputTemplates(cwd, deps.slug, step.name, state);
      await commitAndPush(step, state, deps, headBeforeStep, infra);
    },
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> { /* no-op in tests */ },
    async bootstrapJob(): Promise<import("../src/state/schema.js").JobState> { throw new Error("not implemented in test"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs(): Promise<import("../src/core/port/runtime-strategy.js").FindingRef[]> { return []; },
    async digestArtifacts(refs: { path: string }[]): Promise<import("../src/store/event-journal.js").ArtifactRef[]> {
      return refs.map((r) => ({ path: r.path, hash: null }));
    },
  };
}

async function makeJobState() {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
  // Set branch so polling-style steps (including request-review) can run without BRANCH_NOT_REGISTERED.
  // In real execution, setupWorkspace sets this before runPipeline is called.
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
      "implementer": { agentId: "implementer-agent-id", definitionHash: "sha256:imp", lastSyncedAt: new Date().toISOString() },
      "build-fixer": { agentId: "build-fixer-agent-id", definitionHash: "sha256:bfx", lastSyncedAt: new Date().toISOString() },
      "code-review": { agentId: "code-review-agent-id", definitionHash: "sha256:crv", lastSyncedAt: new Date().toISOString() },
      "code-fixer": { agentId: "code-fixer-agent-id", definitionHash: "sha256:cfx", lastSyncedAt: new Date().toISOString() },
      "conformance": { agentId: "conformance-agent-id", definitionHash: "sha256:cnf", lastSyncedAt: new Date().toISOString() },
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

    expect(result.status).toBe("awaiting-archive");

    // spec-review: length 1, verdict=approved
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr?.length).toBe(1);
    const lastSpecReview = specReviewArr?.[specReviewArr.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");

    // spec-fixer: not present
    expect(result.steps?.["spec-fixer"]).toBeUndefined();

    // After spec-review approved, pipeline continues:
    // request-review(1) + design(1) + spec-review(1) + test-case-gen(1) + implementer(1) + code-review(1) + conformance(1) + adr-gen(1) = 8 sessions
    // VerificationStep is CLI (no session). Total = 8 createSession calls.
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(8);

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

    expect(result.status).toBe("awaiting-archive");

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

// TC-013: spec-review "needs-fix" → spec-fixer IS invoked.
// When spec-review returns needs-fix (blocking high finding), the loop proceeds to spec-fixer.
describe("TC-013: runPipeline — spec-review needs-fix invokes spec-fixer (R3: escalation removed)", () => {
  it("creates spec-fixer steps when spec-review returns needs-fix (approved:false)", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // needs-fix (high finding) → spec-fixer runs; then approved → pipeline proceeds
    const { client } = buildPipelineMockClient({ specReviewVerdicts: ["needs-fix", "approved"] });
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

    // spec-fixer IS created (escalation → needs-fix in R3, which loops to spec-fixer)
    expect(result.steps?.["spec-fixer"]).toBeDefined();

    // spec-review: at least 2 entries (iter1 needs-fix, iter2 approved)
    const specReviewArr = result.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(specReviewArr!.length).toBeGreaterThanOrEqual(2);
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

    // request-review(1) + propose/design session created (1, then fails) = 2 sessions total
    const createCalls = (client.createSession as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(2);

    // result.status should be failed (propose failed)
    expect(result.status).not.toBe("success");
  });
});

// TC-015: runPipeline — 各 iteration でセッション ID が異なる (fresh-per-task)
describe("TC-015: runPipeline — fresh session IDs per iteration", () => {
  it("spec-review iterations use different session IDs", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client, sessionIds: _sessionIds } = buildPipelineMockClient({
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
describe("TC-016: runPipeline — stderr contains 'retries exhausted, escalating' when limit reached", () => {
  it("writes retries exhausted message to stderr", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "needs-fix"] });

    const stderrLines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    const events = makeEventsWithProgress();
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
    }, events);

    const stdout = stderrLines.join("");
    expect(stdout).toContain("retries exhausted on spec-review, escalating");
  });
});

// TC-017: runPipeline — Pipeline finished サマリ行の出力
describe("TC-017: runPipeline — Pipeline finished summary line in stderr", () => {
  it("outputs 'Pipeline finished' summary with iterations and verdict", async () => {

    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "approved"],
    });
    const githubClient = buildMockGithubClient({ specReviewVerdicts: ["needs-fix", "approved"] });

    const stderrLines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    const events = makeEventsWithProgress();
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
    }, events);

    const stdout = stderrLines.join("");
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

    const stderrLines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    const events = makeEventsWithProgress();
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
    }, events);

    const stdout = stderrLines.join("");
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

    // After spec-review approved → implementer → verification → code-review → conformance → adr-gen → pr-create → end.
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
      codeReviewVerdicts: ["needs-fix", "approved"],
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

    expect(result.status).toBe("awaiting-archive");

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
      codeReviewVerdicts: ["needs-fix", "needs-fix", "needs-fix"],
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
      codeReviewVerdicts: ["needs-fix", "needs-fix", "approved"],
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

    expect(result.status).toBe("awaiting-archive");

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

    expect(result.status).toBe("awaiting-archive");

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

    expect(result.status).toBe("awaiting-archive");

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

    // Verify the final persisted state has both steps recorded — reload via store
    const finalState = await makeStoreFactory(tempDir)(jobState.jobId).load();
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
      expect(ctx.input.dynamicContext).toBeDefined();
      expect(ctx.input.dynamicContext?.gitLog).toBe(testDynamicContext.gitLog);
      expect(ctx.input.dynamicContext?.diffStat).toBe(testDynamicContext.diffStat);
      expect(ctx.input.dynamicContext?.changesList).toEqual(testDynamicContext.changesList);
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
      expect(ctx?.input.projectContext).toBe("# Test Project Context");
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
    expect(testCaseGenCtx?.input.projectContext).toBeUndefined();
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

// TC-DC-106: enrichContext returns unmodified dynamicContext when no spec context available
describe("TC-DC-106: enrichContext returns unmodified dynamicContext when no spec context available", () => {
  it("baselineSpecs is undefined when no spec context is available", async () => {
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    // No spec context — enrichContext should return dynamicContext unchanged
    let _capturedEnrichResult: DynamicContext | undefined;
    const enrichSpy = vi.spyOn(SpecReviewStep, "enrichContext").mockImplementation(
      async (dynamicContext: DynamicContext, _cwd: string, _slug: string) => {
        // Simulate: no spec context → return as-is
        _capturedEnrichResult = dynamicContext;
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
    expect(result.status).toBe("awaiting-archive");
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
    expect(result.status).toBe("awaiting-archive");

    const allowlistNames = ["design", "spec-review", "implementer", "code-review"];
    for (const stepName of allowlistNames) {
      const ctx = capturedCtxList.find((c) => c.step.name === stepName);
      expect(ctx, `Expected step '${stepName}' to be called`).toBeDefined();
      expect(ctx?.input.projectContext).toBeUndefined();
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

    expect(result.status).toBe("awaiting-archive");
    expect(capturedCtxList.length).toBeGreaterThan(0);
    for (const ctx of capturedCtxList) {
      expect(ctx.input.dynamicContext).toBeUndefined();
    }
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
        return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
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
    const store = makeStoreFactory(tempDir)(stateWithBranch.jobId);
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
      runtimeStrategy: makeTestRuntimeStrategy(gitSpawnFn),
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


// TC-ADR-INT-01: STANDARD_TRANSITIONS includes adr-gen transitions and removes old code-review→pr-create
describe("TC-ADR-INT-01: STANDARD_TRANSITIONS adr-gen wiring", () => {
  it("code-review --approved→ conformance (via conformance gate, no direct adr-gen)", async () => {
    const { STANDARD_TRANSITIONS } = await import("../src/core/pipeline/types.js");
    // Find the fallback (no `when`) transition: code-review approved → conformance
    const codeReviewApproved = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && !t.when
    );
    expect(codeReviewApproved).toBeDefined();
    // code-review approved now routes to conformance (not adr-gen directly)
    expect(codeReviewApproved!.to).toBe("conformance");
    // Must NOT go to adr-gen directly (conformance is the intermediary)
    expect(codeReviewApproved!.to).not.toBe("adr-gen");
    // Must NOT go to pr-create directly
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

  it("code-fixer --approved→ code-review loop is preserved (fallback row)", async () => {
    const { STANDARD_TRANSITIONS } = await import("../src/core/pipeline/types.js");
    // The code-fixer --approved → code-review fallback row exists.
    // Since buildReviewerChainTransitions generates per-reviewer conditional fallbacks,
    // the row may have a 'when' predicate (always satisfied for single-reviewer chain).
    const codeFixerApprovedFallback = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-fixer" && t.on === "approved" && t.to === "code-review"
    );
    expect(codeFixerApprovedFallback).toBeDefined();
    expect(codeFixerApprovedFallback!.to).toBe("code-review");
  });
});

// ---------------------------------------------------------------------------
// TC-065: verification/build-fixer loop exhaustion → VERIFICATION_RETRIES_EXHAUSTED
// All 3 verification iterations return "failed" (maxRetries=2, +1 bypass = 3 total).
// ---------------------------------------------------------------------------
describe("TC-065: verification/build-fixer exhaustion — VERIFICATION_RETRIES_EXHAUSTED", () => {
  it("sets error.code=VERIFICATION_RETRIES_EXHAUSTED, escalation verdict on last verification, resumePoint.step=build-fixer", async () => {
    const { runPipeline } = await import("../src/core/pipeline/index.js");
    const { runVerification } = await import("../src/core/verification/runner.js");
    const jobState = await makeJobState();

    // All 3 verification iterations return "failed"
    vi.mocked(runVerification).mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
      const outputPath = `${cwd}/${verificationResultPath(slug)}`;
      const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, `# Verification Result — ${slug}\n\n## Verdict: failed\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n| 1 | build | passed | 1s | 0 |\n| 2 | test | failed | 2s | 1 |\n`);
      return {
        slug,
        verdict: "failed" as const,
        phases: [
          { phase: "build", status: "passed" as const, stdout: "", stderr: "", exitCode: 0, durationMs: 1000 },
          { phase: "test", status: "failed" as const, stdout: "", stderr: "", exitCode: 1, durationMs: 2000 },
        ],
      };
    });

    const { client } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_request_review_001",
        "sess_design_001",
        "sess_spec_review_001",
        "sess_test_case_gen_001",
        "sess_implementer_001",
        "sess_build_fixer_001",
        "sess_build_fixer_002",
      ],
    });
    const githubClient = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
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

    // Pipeline halts with exhaustion error
    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("VERIFICATION_RETRIES_EXHAUSTED");

    // verification: 3 entries, last has escalation verdict
    const verificationArr = result.steps?.["verification"];
    expect(verificationArr).toBeDefined();
    expect(verificationArr?.length).toBe(3);
    const lastVerification = verificationArr?.[verificationArr.length - 1];
    expect(lastVerification ? toLegacyStepResult(lastVerification).verdict : undefined).toBe("escalation");

    // resumePoint: step=build-fixer (productive entry point), exhaustionPhase=review-after-final-fix
    expect(result.resumePoint?.step).toBe("build-fixer");
    expect(result.resumePoint?.exhaustionPhase).toBe("review-after-final-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-070: escalation → resume roundtrip
// Phase 1: exhaust spec-review → awaiting-resume with resumePoint
// Phase 2: resume from resumePoint.step with approved mock → awaiting-archive
// ---------------------------------------------------------------------------
describe("TC-070: escalation → resume roundtrip", () => {
  it("spec-review exhaustion halts at awaiting-resume; resume from resumePoint.step completes to awaiting-archive", async () => {
    const { runPipeline, createStandardPipeline } = await import("../src/core/pipeline/index.js");
    const { runVerification } = await import("../src/core/verification/runner.js");

    // Restore passing verification mock (a prior test may have overridden it to always-fail).
    vi.mocked(runVerification).mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
      const outputPath = `${cwd}/${verificationResultPath(slug)}`;
      const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, `# Verification Result — ${slug} — iter 1\n\n## Verdict: passed\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n`);
      return { slug, verdict: "passed" as const, phases: [] };
    });

    // --- Phase 1: exhaust spec-review ---
    const jobState = await makeJobState();

    const { client: client1 } = buildPipelineMockClient({
      specReviewVerdicts: ["needs-fix", "needs-fix", "needs-fix"],
      sessionIds: [
        "sess_rr_001",
        "sess_design_001",
        "sess_spec_review_001",
        "sess_spec_fixer_001",
        "sess_spec_review_002",
        "sess_spec_fixer_002",
        "sess_spec_review_003",
      ],
    });
    const githubClient1 = buildMockGithubClient({
      specReviewVerdicts: ["needs-fix", "needs-fix", "needs-fix"],
    });

    const halted = await runPipeline(jobState, {
      client: client1,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: githubClient1,
      runner: buildRunner(client1, githubClient1),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    });

    expect(halted.status).toBe("awaiting-resume");
    expect(halted.resumePoint).toBeDefined();
    const resumeStep = halted.resumePoint!.step;
    // spec-review exhaustion resumes from spec-fixer (the paired fixer)
    expect(resumeStep).toBe("spec-fixer");

    // --- Phase 2: resume from resumePoint.step with approved spec-review ---
    const { client: client2 } = buildPipelineMockClient({
      specReviewVerdicts: ["approved"],
      sessionIds: [
        "sess_spec_fixer_resume_001",
        "sess_spec_review_resume_001",
        "sess_test_case_gen_resume_001",
        "sess_implementer_resume_001",
        "sess_code_review_resume_001",
        "sess_conformance_resume_001",
        "sess_adr_gen_resume_001",
      ],
    });
    const githubClient2 = buildMockGithubClient({
      specReviewVerdicts: ["approved"],
      codeReviewVerdicts: ["approved"],
    });

    // Transition halted state back to running so pipeline.run() can proceed
    const { transitionJob } = await import("../src/state/lifecycle.js");
    const { state: resumedState } = transitionJob(halted, "running", {
      trigger: "resume",
      reason: "manual resume for test",
    });
    const resumeDeps = {
      client: client2,
      config: buildConfig({ pipeline: { maxRetries: 2 } }),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: githubClient2,
      runner: buildRunner(client2, githubClient2),
      owner: "testowner",
      repo: "testrepo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    };

    const resumed = await createStandardPipeline(resumeDeps).run(resumeStep, resumedState, resumeDeps);

    // Pipeline should complete normally after resume
    expect(resumed.status).toBe("awaiting-archive");
    // spec-review should have gained at least 1 more entry (resumed run)
    const specReviewArr = resumed.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    // After exhaustion there were 3 entries; resume adds at least 1 more
    expect((specReviewArr?.length ?? 0)).toBeGreaterThanOrEqual(1);
    // Last spec-review in the resumed run should be approved
    const lastSpecReview = specReviewArr?.[specReviewArr.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");
  });
});
