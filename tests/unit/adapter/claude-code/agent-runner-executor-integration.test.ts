/**
 * Integration test: ClaudeCodeRunner ↔ StepExecutor boundary (TC-146)
 *
 * Regression guard for review-feedback-001 finding #1/#2:
 * Verifies that when ClaudeCodeRunner is wired into StepExecutor via the
 * local runtime path, state.steps and state.history are correctly populated
 * after a successful agent step execution.
 *
 * TC-146: StepExecutor + ClaudeCodeRunner integration — state.steps and
 *         state.history populated after local-runtime agent step
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import { specReviewResultPath, changeFolderPath } from "../../../../src/util/paths.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import { noopRoundGitEffects, noopStepArtifact, noopStepIo, noopTerminalState } from "../../../../src/core/step/noop-capabilities.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-executor-integration-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeJobState(jobId: string): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Integration Test", type: "feature", slug: "integration-test" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: "feat/integration-test",
    history: [],
    error: null,
    steps: {},
  };
}

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
  };
}

/**
 * Create a mock query function that optionally writes a result file as a side effect.
 */
function makeLocalQueryFn(opts: {
  resultRelPath?: string;
  resultContent?: string;
  error?: boolean;
}): QueryFn {
  const { resultRelPath, resultContent = "", error = false } = opts;

  return async function* mockQuery(params: { prompt: string; options?: Record<string, unknown> }) {
    const cwd = (params.options?.cwd as string) ?? "";

    if (resultRelPath && resultContent) {
      const filePath = path.join(cwd, resultRelPath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, resultContent, "utf-8");
    }

    if (error) {
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: true,
        num_turns: 1,
        stop_reason: null,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        errors: ["test error"],
        uuid: "test-uuid",
        session_id: "test-session",
      } as unknown;
    } else {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        uuid: "test-uuid",
        session_id: "test-session",
      } as unknown;
    }
  } as QueryFn;
}

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  await makeStoreFactory(tempDir)(jobId).persist(state);
}

// ---------------------------------------------------------------------------
// TC-146: Integration — ClaudeCodeRunner + StepExecutor state propagation
// ---------------------------------------------------------------------------

describe("TC-146: ClaudeCodeRunner + StepExecutor — local runtime state propagation", () => {
  it("state.steps['spec-review'] and state.history are populated after successful local-runtime agent step", async () => {
    const jobId = "tc146-integration-job";
    const resultRelPath = specReviewResultPath("integration-test", 1);
    const resultContent = "**Verdict**: approved\n";

    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    const queryFn = makeLocalQueryFn({ resultRelPath, resultContent });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "spec-review",
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review",
        model: "claude-sonnet-4-5",
        system: "review this",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "review this",
      resultFilePath: () => resultRelPath,
      parseResult: (content: string) => ({
        verdict: content.includes("approved") ? ("approved" as const) : ("needs-fix" as const),
        findingsPath: resultRelPath,
      }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: {
        type: "feature",
        title: "Integration Test",
        slug: "integration-test",
        baseBranch: "main",
        content: "test content",
        adr: false,
      },
      slug: "integration-test",

      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: noopStepArtifact,
      stepIo: noopStepIo,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    const verdictEvents: string[] = [];
    events.on("verdict:parsed", (payload) => {
      const p = payload as { step: string; outcome: { verdict: string | null } };
      verdictEvents.push(`${p.step}:${p.outcome.verdict}`);
    });

    const resultState = await executor.execute(step, initialState, deps);

    const stepResults = resultState.steps?.["spec-review"];
    expect(stepResults).toBeDefined();
    expect(Array.isArray(stepResults)).toBe(true);
    expect(stepResults!.length).toBeGreaterThan(0);

    const lastResult = stepResults![stepResults!.length - 1] as StepRun;
    expect(lastResult.outcome.verdict).toBe("approved");

    const verdictHistoryEntry = resultState.history.find(
      (h) => h.step === "spec-review-verdict" && h.status === "ok",
    );
    expect(verdictHistoryEntry).toBeDefined();
    expect(verdictHistoryEntry?.message).toContain("approved");

    expect(verdictEvents).toContain("spec-review:approved");

    const persisted = await makeStoreFactory(tempDir)(jobId).load();
    expect(persisted.steps?.["spec-review"]).toBeDefined();
  });

  it("state.steps has a failed step result when ClaudeCodeRunner returns completionReason='error'", async () => {
    const jobId = "tc146-error-job";
    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    const queryFn = makeLocalQueryFn({ error: true });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "spec-review",
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review",
        model: "claude-sonnet-4-5",
        system: "review this",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "review this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: {
        type: "feature",
        title: "Integration Test",
        slug: "integration-test",
        baseBranch: "main",
        content: "test content",
        adr: false,
      },
      slug: "integration-test",

      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: noopStepArtifact,
      stepIo: noopStepIo,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    await expect(executor.execute(step, initialState, deps)).rejects.toMatchObject({
      code: "CLAUDE_CODE_QUERY_FAILED",
    });

    const persisted2 = await makeStoreFactory(tempDir)(jobId).load();
    const stepResults = persisted2.steps?.["spec-review"];
    expect(stepResults).toBeDefined();
    expect(Array.isArray(stepResults)).toBe(true);
    expect(stepResults!.length).toBeGreaterThan(0);

    const lastResult = stepResults![stepResults!.length - 1] as StepRun;
    expect(lastResult.outcome.verdict).toBeNull();
    expect(lastResult.outcome.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-001: completionVerdict fallback — resultContent null + completionVerdict defined
// ---------------------------------------------------------------------------

describe("TC-001: completionVerdict fallback — resultContent null + completionVerdict defined", () => {
  it("uses step.completionVerdict as verdict when resultContent is null", async () => {
    const jobId = "tc001-completion-verdict-job";
    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    // Query that returns success but writes no result file
    const queryFn = makeLocalQueryFn({ /* no resultRelPath */ });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "design",
      agent: {
        name: "specrunner-design",
        role: "design",
        model: "claude-sonnet-4-5",
        system: "design",
        tools: [],
      },
      toolHandlers: undefined,
      completionVerdict: "success",
      buildMessage: () => "design",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: { type: "feature", title: "Test", slug: "tc001-slug", baseBranch: "main", content: "content", adr: false },
      slug: "tc001-slug",

      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: noopStepArtifact,
      stepIo: noopStepIo,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    const verdictEvents: string[] = [];
    events.on("verdict:parsed", (payload) => {
      const p = payload as { step: string; outcome: { verdict: string | null } };
      verdictEvents.push(`${p.step}:${p.outcome.verdict}`);
    });

    const resultState = await executor.execute(step, initialState, deps);

    // Verdict should be "success" from completionVerdict, not escalation
    const stepResults = resultState.steps?.["design"];
    expect(stepResults).toBeDefined();
    const lastResult = stepResults![stepResults!.length - 1] as StepRun;
    expect(lastResult.outcome.verdict).toBe("success");
    expect(verdictEvents).toContain("design:success");
  });
});

// ---------------------------------------------------------------------------
// TC-002: completionVerdict fallback — resultContent null + completionVerdict undefined
// ---------------------------------------------------------------------------

describe("TC-002: completionVerdict fallback — resultContent null + completionVerdict undefined", () => {
  it("falls back to escalation when resultContent is null and completionVerdict is undefined", async () => {
    const jobId = "tc002-no-verdict-job";
    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    // Query that returns success but writes no result file
    const queryFn = makeLocalQueryFn({ /* no resultRelPath */ });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "spec-review",
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review",
        model: "claude-sonnet-4-5",
        system: "review",
        tools: [],
      },
      toolHandlers: undefined,
      // completionVerdict intentionally omitted
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: { type: "feature", title: "Test", slug: "tc002-slug", baseBranch: "main", content: "content", adr: false },
      slug: "tc002-slug",

      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: noopStepArtifact,
      stepIo: noopStepIo,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    const resultState = await executor.execute(step, initialState, deps);

    // Verdict should fall back to "escalation" (no completionVerdict, null resultContent)
    const stepResults = resultState.steps?.["spec-review"];
    expect(stepResults).toBeDefined();
    const lastResult = stepResults![stepResults!.length - 1] as StepRun;
    expect(lastResult.outcome.verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-003 (behavior): completionVerdict NOT used when resultContent is non-null
// ---------------------------------------------------------------------------

describe("TC-003 (behavior): completionVerdict is NOT used when resultContent is non-null", () => {
  it("parses verdict from resultContent, ignoring completionVerdict", async () => {
    const jobId = "tc003-behavior-job";
    const resultRelPath = `${changeFolderPath("tc003-slug")}/review-result-001.md`;
    const resultContent = "- **verdict**: needs-fix\n";

    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    const queryFn = makeLocalQueryFn({ resultRelPath, resultContent });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "spec-review",
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review",
        model: "claude-sonnet-4-5",
        system: "review",
        tools: [],
      },
      toolHandlers: undefined,
      completionVerdict: "approved", // Would be "approved" if fallback were used
      buildMessage: () => "review",
      resultFilePath: () => resultRelPath,
      parseResult: (content: string) => ({
        verdict: content.includes("needs-fix") ? ("needs-fix" as const) : ("approved" as const),
        findingsPath: resultRelPath,
      }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: { type: "feature", title: "Test", slug: "tc003-slug", baseBranch: "main", content: "content", adr: false },
      slug: "tc003-slug",

      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: noopStepArtifact,
      stepIo: noopStepIo,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    const resultState = await executor.execute(step, initialState, deps);

    const stepResults = resultState.steps?.["spec-review"];
    expect(stepResults).toBeDefined();
    const lastResult = stepResults![stepResults!.length - 1] as StepRun;
    // Must use parsed verdict from resultContent, not completionVerdict
    expect(lastResult.outcome.verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-004: setsBranch flag — state.branch set after propose step
// ---------------------------------------------------------------------------

describe("TC-004: setsBranch flag — state.branch set after propose step completes", () => {
  it("sets state.branch to feat/${slug}-${jobId[0..7]} when setsBranch:true and jobState.branch is absent", async () => {
    const jobId = "tc004-sets-branch-job";
    const initialState = makeJobState(jobId);
    initialState.branch = null; // no branch
    await seedJobState(jobId, initialState);

    const queryFn = makeLocalQueryFn({ /* no result file */ });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "design",
      agent: {
        name: "specrunner-design",
        role: "design",
        model: "claude-sonnet-4-5",
        system: "design",
        tools: [],
      },
      toolHandlers: undefined,
      completionVerdict: "success",
      setsBranch: true,
      buildMessage: () => "design",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: { type: "feature", title: "Test", slug: "my-feature-slug", baseBranch: "main", content: "content", adr: false },
      slug: "my-feature-slug",

      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: noopStepArtifact,
      stepIo: noopStepIo,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    const resultState = await executor.execute(step, initialState, deps);

    // New format: feat/<slug>-<jobId first 8 chars>
    // jobId = "tc004-sets-branch-job" → first 8 = "tc004-se"
    expect(resultState.branch).toBe("feat/my-feature-slug-tc004-se");
  });
});

// ---------------------------------------------------------------------------
// TC-005: setsBranch flag — does NOT overwrite an existing branch
// ---------------------------------------------------------------------------

describe("TC-005: setsBranch flag — does not overwrite existing state.branch", () => {
  it("keeps existing state.branch when setsBranch:true but jobState.branch is already set", async () => {
    const jobId = "tc005-no-overwrite-job";
    const existingBranch = "feat/already-set-branch";
    const initialState = makeJobState(jobId);
    initialState.branch = existingBranch;
    await seedJobState(jobId, initialState);

    const queryFn = makeLocalQueryFn({ /* no result file */ });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "design",
      agent: {
        name: "specrunner-design",
        role: "design",
        model: "claude-sonnet-4-5",
        system: "design",
        tools: [],
      },
      toolHandlers: undefined,
      completionVerdict: "success",
      setsBranch: true,
      buildMessage: () => "design",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: { type: "feature", title: "Test", slug: "different-slug", baseBranch: "main", content: "content", adr: false },
      slug: "different-slug",

      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: noopStepArtifact,
      stepIo: noopStepIo,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    const resultState = await executor.execute(step, initialState, deps);

    // Branch must NOT be overwritten — existing value preserved
    expect(resultState.branch).toBe(existingBranch);
  });
});

// ---------------------------------------------------------------------------
// TC-006: step name hardcode check — setsBranch flag approach used in source
// ---------------------------------------------------------------------------

describe("TC-006: executor.ts / commit-orchestrator.ts uses setsBranch flag, not step.name hardcode", () => {
  it("executor.ts does not contain step.name === 'propose' condition, setsBranch in orchestrator", async () => {
    const [executorSrc, orchestratorSrc] = await Promise.all([
      import("node:fs/promises").then((fsp) =>
        fsp.readFile(
          new URL("../../../../src/core/step/executor.ts", import.meta.url).pathname,
          "utf-8",
        ),
      ),
      import("node:fs/promises").then((fsp) =>
        fsp.readFile(
          new URL("../../../../src/core/step/commit-orchestrator.ts", import.meta.url).pathname,
          "utf-8",
        ),
      ),
    ]);

    // Step name hardcode dispatch patterns (TC-003 / TC-006)
    const stepNameHardcodePattern =
      /if\s*\(.*step\.name\s*===?\s*["'](?:design|spec-review|implementer|build-fixer|spec-fixer|verification)["']/;
    expect(stepNameHardcodePattern.test(executorSrc)).toBe(false);
    expect(stepNameHardcodePattern.test(orchestratorSrc)).toBe(false);

    // setsBranch logic moved to commit-orchestrator.ts (B-13 single-writer refactor)
    expect(orchestratorSrc).toContain("setsBranch");
  });
});

// ---------------------------------------------------------------------------
// TC-007: rollover + success → finalizeStepArtifacts 1 回呼ばれ step は success
// TC-009: budget 超過 → CONTEXT_WINDOW_EXHAUSTED halt、finalizeStepArtifacts 呼ばれない
// (T-07 fresh-session-rollover)
// ---------------------------------------------------------------------------

/**
 * Minimal RuntimeStrategy mock for rollover integration tests.
 * Provides the seams exercised by StepExecutor when runtimeStrategy is set:
 *   - prepareStepArtifacts (before runner)
 *   - finalizeStepArtifacts (after success — THE spy)
 *   - captureHeadSha (for commitOid capture)
 * All other methods return safe no-op values.
 */
function makeRolloverRuntimeStrategy(opts: {
  finalizeStepArtifacts?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    async *query() {},
    createAgentRunner() {
      return { run: vi.fn() };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as never; },
    registerCleanup() { return {} as never; },
    async teardown() {},
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: opts.finalizeStepArtifacts ?? vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    async bootstrapJob() { throw new Error("not implemented"); },
    async persistJobState() {},
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "success" as const, files: [] }),
  } as never;
}

/** QueryFn that returns exhaustion on first call, success on second call. */
function makeRolloverQueryFn(): QueryFn {
  let callCount = 0;
  return async function* rolloverQuery() {
    callCount++;
    if (callCount === 1) {
      // First call: context exhaustion
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        is_error: true,
        stop_reason: null,
        errors: ["Prompt is too long for this model's context window"],
        session_id: "sess-exhaust-1",
        modelUsage: {
          "claude-sonnet-4-5": {
            inputTokens: 190000,
            outputTokens: 1000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
        },
        usage: { input_tokens: 190000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "uuid-exhaust-1",
        num_turns: 5,
        duration_ms: 1000,
        duration_api_ms: 900,
        total_cost_usd: 0.05,
      } as unknown;
    } else {
      // Second+ call: success
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        session_id: "sess-success-1",
        is_error: false,
        stop_reason: "end_turn",
        num_turns: 3,
        duration_ms: 5000,
        duration_api_ms: 4000,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {
          "claude-sonnet-4-5": {
            inputTokens: 80000,
            outputTokens: 5000,
            cacheReadInputTokens: 5000,
            cacheCreationInputTokens: 2000,
            contextWindow: 200000,
          },
        },
        permission_denials: [],
        uuid: "uuid-success-1",
      } as unknown;
    }
  } as QueryFn;
}

/** QueryFn that always returns context exhaustion. */
function makeAlwaysExhaustQueryFn(): QueryFn {
  return async function* alwaysExhaust() {
    yield {
      type: "result" as const,
      subtype: "error_during_execution" as const,
      is_error: true,
      stop_reason: null,
      errors: ["Prompt is too long for this model's context window"],
      session_id: "sess-exhaust-always",
      modelUsage: {
        "claude-sonnet-4-5": {
          inputTokens: 195000,
          outputTokens: 500,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
      usage: { input_tokens: 195000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
      permission_denials: [],
      uuid: "uuid-exhaust-always",
      num_turns: 5,
      duration_ms: 1000,
      duration_api_ms: 900,
      total_cost_usd: 0.05,
    } as unknown;
  } as QueryFn;
}

describe("TC-007 (T-07): rollover + success → finalizeStepArtifacts が 1 回だけ呼ばれ、step が success になる", () => {
  it("1 回目 exhaustion → 2 回目 success: executor が success で完了し、finalizeStepArtifacts は 1 回", async () => {
    const jobId = "tc007-rollover-success-job";
    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    const finalizeStepArtifacts = vi.fn().mockResolvedValue(undefined);
    const runtimeStrategy = makeRolloverRuntimeStrategy({ finalizeStepArtifacts });

    const queryFn = makeRolloverQueryFn();
    // Config with default maxRollovers=1 (no explicit contextRollover → resolved as 1)
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "implementer",
      agent: {
        name: "specrunner-implementer",
        role: "implementer",
        model: "claude-sonnet-4-5",
        system: "implement this",
        tools: [],
      },
      toolHandlers: undefined,
      completionVerdict: "success",
      buildMessage: () => "implement this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: { type: "feature", title: "TC-007", slug: "tc007-slug", baseBranch: "main", content: "content", adr: false },
      slug: "tc007-slug",
      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
        getIssue: vi.fn().mockResolvedValue({ number: 1, title: "TC007", body: "" }),
        createLinkedBranch: vi.fn().mockResolvedValue(undefined),
        listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: runtimeStrategy as never,
      stepIo: runtimeStrategy as never,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    const resultState = await executor.execute(step, initialState, deps);

    // TC-007: step result is "success"
    const stepResults = resultState.steps?.["implementer"];
    expect(stepResults).toBeDefined();
    const lastResult = stepResults![stepResults!.length - 1] as import("../../../../src/state/schema.js").StepRun;
    expect(lastResult.outcome.verdict).toBe("success");

    // TC-007: finalizeStepArtifacts called exactly once (not once per rollover session)
    expect(finalizeStepArtifacts).toHaveBeenCalledTimes(1);
  });
});

describe("TC-009 (T-07): rollover budget 超過 → CONTEXT_WINDOW_EXHAUSTED halt、finalizeStepArtifacts 呼ばれない", () => {
  it("maxRollovers=1 で毎回 exhaustion → executor が CONTEXT_WINDOW_EXHAUSTED で throw し、finalizeStepArtifacts は 0 回", async () => {
    const jobId = "tc009-budget-exceeded-job";
    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    const finalizeStepArtifacts = vi.fn().mockResolvedValue(undefined);
    const runtimeStrategy = makeRolloverRuntimeStrategy({ finalizeStepArtifacts });

    const queryFn = makeAlwaysExhaustQueryFn();
    // Config with maxRollovers=1 (default) — 2 calls (1 initial + 1 rollover) then budget exceeded
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "implementer",
      agent: {
        name: "specrunner-implementer",
        role: "implementer",
        model: "claude-sonnet-4-5",
        system: "implement this",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "implement this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: { type: "feature", title: "TC-009", slug: "tc009-slug", baseBranch: "main", content: "content", adr: false },
      slug: "tc009-slug",
      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
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
        getIssue: vi.fn().mockResolvedValue({ number: 1, title: "TC009", body: "" }),
        createLinkedBranch: vi.fn().mockResolvedValue(undefined),
        listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
      stepArtifact: runtimeStrategy as never,
      stepIo: runtimeStrategy as never,
      terminalState: noopTerminalState,
      roundGitEffects: noopRoundGitEffects,
    };

    // executor.execute() must throw with CONTEXT_WINDOW_EXHAUSTED
    await expect(executor.execute(step, initialState, deps)).rejects.toMatchObject({
      code: "CONTEXT_WINDOW_EXHAUSTED",
    });

    // TC-009: finalizeStepArtifacts must NOT be called (budget exceeded → halt before finalize)
    expect(finalizeStepArtifacts).toHaveBeenCalledTimes(0);

    // TC-009: persisted state has CONTEXT_WINDOW_EXHAUSTED as the error code
    const persisted = await makeStoreFactory(tempDir)(jobId).load();
    expect(persisted.error?.code).toBe("CONTEXT_WINDOW_EXHAUSTED");
  });
});
