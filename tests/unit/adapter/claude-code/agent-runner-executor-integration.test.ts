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
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
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
      },
      cwd: tempDir,
      owner: "user",
      repo: "repo",
      spawn: noopSpawn,
      storeFactory: makeStoreFactory(tempDir),
    };

    const resultState = await executor.execute(step, initialState, deps);

    // Branch must NOT be overwritten — existing value preserved
    expect(resultState.branch).toBe(existingBranch);
  });
});

// ---------------------------------------------------------------------------
// TC-006: step name hardcode check — setsBranch flag approach used in source
// ---------------------------------------------------------------------------

describe("TC-006: executor.ts uses setsBranch flag, not step.name hardcode", () => {
  it("executor.ts does not contain step.name === 'propose' condition", async () => {
    const executorSrc = await import("node:fs/promises").then((fsp) =>
      fsp.readFile(
        new URL("../../../../src/core/step/executor.ts", import.meta.url).pathname,
        "utf-8",
      ),
    );

    // Step name hardcode dispatch patterns (TC-003 / TC-006)
    const stepNameHardcodePattern =
      /if\s*\(.*step\.name\s*===?\s*["'](?:design|spec-review|implementer|build-fixer|spec-fixer|verification)["']/;
    expect(stepNameHardcodePattern.test(executorSrc)).toBe(false);

    // Must use setsBranch flag instead
    expect(executorSrc).toContain("setsBranch");
  });
});
