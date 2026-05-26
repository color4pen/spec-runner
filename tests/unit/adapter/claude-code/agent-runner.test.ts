/**
 * Unit tests for ClaudeCodeRunner (TC-022 through TC-029)
 *
 * TC-022: ClaudeCodeRunner implements AgentRunner interface
 * TC-023: query() receives ctx.cwd
 * TC-024: ClaudeCodeRunner does not import SessionClient / @anthropic-ai/sdk
 * TC-025: resultContent is read from fs (not GitHub API)
 * TC-026: additionalInstructions contains branch checkout instruction
 * TC-027: ClaudeCodeRunner does not import register_branch
 * TC-028: requiresCommit guard — branch HEAD not advanced → error
 * TC-029: branch does not exist after agent run → error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { ClaudeCodeRunner } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { SpawnFn, QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import { specReviewResultPath } from "../../../../src/util/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-runner-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeJobState(jobId = "test-job", branch = "feat/test"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
  };
}

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
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
    ...overrides,
  };
}

/**
 * Create a mock query function that yields a success result message.
 * Captures the params passed to query() for assertion.
 */
function makeQueryFn(opts: {
  captureParams?: (params: { prompt: string; options?: Record<string, unknown> }) => void;
  result?: "success" | "error";
  sideEffect?: (cwd: string) => Promise<void> | void;
} = {}): QueryFn {
  const { captureParams, result = "success", sideEffect } = opts;

  return async function* mockQuery(params: { prompt: string; options?: Record<string, unknown> }) {
    if (captureParams) captureParams(params);

    const cwd = (params.options?.cwd as string) ?? "";
    if (sideEffect) await sideEffect(cwd);

    if (result === "success") {
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
    } else {
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
    }
  } as QueryFn;
}

/**
 * Create a spawn function that simulates git behavior for requiresCommit tests.
 */
function makeGitSimulatingSpawnFn(gitResponses: Record<string, { stdout: string; exitCode: number }>): SpawnFn {
  return (_bin: string, args: string[], spawnOpts: SpawnOptions): ChildProcess => {
    const gitCmd = args[0] ?? "unknown";
    const response = gitResponses[gitCmd] ?? { stdout: "", exitCode: 0 };

    const stdoutEm = new EventEmitter();
    const procEm = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procAny = procEm as any;
    procAny.stdin = { write: () => true, end: () => {} };
    procAny.stdout = stdoutEm;
    procAny.stderr = new EventEmitter();

    setImmediate(() => {
      if (response.stdout) {
        stdoutEm.emit("data", Buffer.from(response.stdout + "\n"));
      }
      procEm.emit("close", response.exitCode);
    });

    return procEm as unknown as ChildProcess;
  };
}

// ---------------------------------------------------------------------------
// TC-022: ClaudeCodeRunner implements AgentRunner interface
// ---------------------------------------------------------------------------

describe("TC-022: ClaudeCodeRunner implements AgentRunner interface", () => {
  it("ClaudeCodeRunner has a run() method", () => {
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeQueryFn() });
    expect(typeof runner.run).toBe("function");
  });

  it("ClaudeCodeRunner.run() accepts AgentRunContext and returns AgentRunResult", async () => {
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeQueryFn() });
    const state = makeJobState("tc022-job");
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state,
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result).toHaveProperty("completionReason");
    expect(result).toHaveProperty("resultContent");
  });
});

// ---------------------------------------------------------------------------
// TC-023: query() receives ctx.cwd
// ---------------------------------------------------------------------------

describe("TC-023: ClaudeCodeRunner invokes query() with ctx.cwd", () => {
  it("query() is called with the correct cwd", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const worktreeCwd = tempDir;
    const runner = new ClaudeCodeRunner({ cwd: worktreeCwd, _queryFn: queryFn });
    const state = makeJobState("tc023-job");
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state,
      branch: "feat/test",
      slug: "test-slug",
      cwd: worktreeCwd,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams).toBeDefined();
    expect(capturedParams!.options?.cwd).toBe(worktreeCwd);
  });

  it("query() is called with allowedTools, permissionMode, and model (maxTurns from config resolution)", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    // step.maxTurns is undefined, config has no steps → maxTurns resolves to null → omitted from options
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams!.options?.allowedTools).toEqual(["Read", "Edit", "Write", "Bash", "Grep", "Glob"]);
    expect(capturedParams!.options?.permissionMode).toBe("bypassPermissions");
    // model comes from step.agent.model via stepDefaults resolution
    expect(capturedParams!.options?.model).toBe("claude-sonnet-4-5");
    // maxTurns is absent because step.maxTurns=undefined, config has no steps → null → unlimited
    expect(capturedParams!.options?.maxTurns).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-008: steps セクションなしで既存動作が維持される（後方互換）
// TC-006: maxTurns: null のとき SDK query() に maxTurns を渡さない
// TC-007: maxTurns に数値が設定されているとき SDK query() に数値が渡される
// TC-012: 既存の step.maxTurns ?? 30 フォールバックが削除されている
// TC-020: ClaudeCodeRunner が解決済みの model を SDK に渡す
// ---------------------------------------------------------------------------

describe("TC-008: config.steps なしで既存動作が維持される（後方互換）", () => {
  it("step.maxTurns=undefined かつ config.steps なし → maxTurns は SDK options に含まれない（unlimited）", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      // step.maxTurns is undefined — config has no steps → resolves to null → omitted
      step: makeAgentStep({ maxTurns: undefined }),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(), // no steps field
      emit: vi.fn(),
    };

    await runner.run(ctx);

    // No error — step ran successfully
    // maxTurns is omitted (unlimited) when stepDefaults.maxTurns is undefined → null
    expect(capturedParams!.options?.maxTurns).toBeUndefined();
    // model comes from step.agent.model
    expect(capturedParams!.options?.model).toBe("claude-sonnet-4-5");
  });

  it("step.maxTurns=60 かつ config.steps なし → maxTurns: 60 が渡される", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ maxTurns: 60 }),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams!.options?.maxTurns).toBe(60);
  });
});

describe("TC-006: maxTurns: null のとき SDK query() に maxTurns を渡さない", () => {
  it("config.steps.defaults.maxTurns: null → options.maxTurns は undefined（省略）", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { maxTurns: null },
      },
    };
    const ctx: AgentRunContext = {
      step: makeAgentStep({ maxTurns: 30 }),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    await runner.run(ctx);

    // maxTurns: null in config → omit from SDK options
    expect(capturedParams!.options?.maxTurns).toBeUndefined();
  });
});

describe("TC-007: maxTurns に数値が設定されているとき SDK query() に数値が渡される", () => {
  it("config.steps.defaults.maxTurns: 60 → options.maxTurns: 60", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { maxTurns: 60 },
      },
    };
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams!.options?.maxTurns).toBe(60);
  });
});

describe("TC-012: 既存の step.maxTurns ?? 30 フォールバックが削除されている", () => {
  it("config.steps.defaults.maxTurns: null かつ step.maxTurns: 60 → SDK に maxTurns が渡されない（config が優先）", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { maxTurns: null },
      },
    };
    const ctx: AgentRunContext = {
      // step.maxTurns: 60 exists, but config.defaults.maxTurns: null takes precedence
      step: makeAgentStep({ maxTurns: 60 }),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    await runner.run(ctx);

    // config.defaults.maxTurns: null overrides step.maxTurns: 60
    // maxTurns is omitted from SDK options (unlimited)
    expect(capturedParams!.options?.maxTurns).toBeUndefined();
  });
});

describe("TC-020: ClaudeCodeRunner が解決済みの model を SDK に渡す", () => {
  it("config.steps.defaults.model: 'claude-opus-4' → step 定義の model より優先される", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { model: "claude-opus-4" },
      },
    };
    const ctx: AgentRunContext = {
      // step.agent.model is "claude-sonnet-4-5" but config overrides to "claude-opus-4"
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams!.options?.model).toBe("claude-opus-4");
  });
});

// ---------------------------------------------------------------------------
// TC-024: ClaudeCodeRunner does not import SessionClient / @anthropic-ai/sdk
// ---------------------------------------------------------------------------

describe("TC-024: ClaudeCodeRunner does not import SessionClient or @anthropic-ai/sdk", () => {
  it("claude-code/agent-runner.ts has no SessionClient import statement", async () => {
    const filePath = path.resolve(__dirname, "../../../../src/adapter/claude-code/agent-runner.ts");
    const content = await fs.readFile(filePath, "utf-8");
    const importLines = content
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => /import\s+.*SessionClient/.test(l));
    expect(importLines).toHaveLength(0);
  });

  it("claude-code/agent-runner.ts has no @anthropic-ai/sdk import statement", async () => {
    const filePath = path.resolve(__dirname, "../../../../src/adapter/claude-code/agent-runner.ts");
    const content = await fs.readFile(filePath, "utf-8");
    const importLines = content
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => /from\s+["']@anthropic-ai\/sdk/.test(l));
    expect(importLines).toHaveLength(0);
  });

  it("claude-code/agent-runner.ts imports from @anthropic-ai/claude-agent-sdk", async () => {
    const filePath = path.resolve(__dirname, "../../../../src/adapter/claude-code/agent-runner.ts");
    const content = await fs.readFile(filePath, "utf-8");
    const importLines = content
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => /from\s+["']@anthropic-ai\/claude-agent-sdk/.test(l));
    expect(importLines.length).toBeGreaterThan(0);
  });

  it("no file in src/adapter/claude-code/ has import statement for @anthropic-ai/sdk", async () => {
    const claudeCodeDir = path.resolve(__dirname, "../../../../src/adapter/claude-code");
    const entries = await fs.readdir(claudeCodeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        const content = await fs.readFile(path.join(claudeCodeDir, entry.name), "utf-8");
        const importLines = content
          .split("\n")
          .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
          .filter((line) => /import\s+.*@anthropic-ai\/sdk/.test(line) || /from\s+["']@anthropic-ai\/sdk/.test(line));
        expect(importLines).toHaveLength(0);
        const sessionClientImports = content
          .split("\n")
          .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
          .filter((line) => /import\s+.*SessionClient/.test(line));
        expect(sessionClientImports).toHaveLength(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TC-025: resultContent is fetched from fs (not GitHub API)
// ---------------------------------------------------------------------------

describe("TC-025: ClaudeCodeRunner reads resultContent from fs (not GitHub API)", () => {
  it("result file is read from local filesystem after query completes", async () => {
    const resultRelPath = specReviewResultPath("test-slug", 1);
    const expectedContent = "## Verdict\napproved";

    const queryFn = makeQueryFn({
      sideEffect: async (cwd) => {
        const filePath = path.join(cwd, resultRelPath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, expectedContent, "utf-8");
      },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const state = makeJobState("tc025-job");

    const ctx: AgentRunContext = {
      step: makeAgentStep({
        resultFilePath: () => resultRelPath,
        parseResult: () => ({ verdict: "approved" as const, findingsPath: resultRelPath }),
      }),
      state,
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
    expect(result.resultContent).toBe(expectedContent);
  });
});

// ---------------------------------------------------------------------------
// TC-026: additionalInstructions contains branch checkout instruction
// ---------------------------------------------------------------------------

describe("TC-026: ClaudeCodeRunner additionalInstructions contains branch info (D4: already created by CLI)", () => {
  it("query prompt includes branch name and does not contain register_branch", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const state = makeJobState("tc026-job");

    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state,
      branch: "feat/foo-bar",
      slug: "foo-bar",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams!.prompt).toContain("feat/foo-bar");
    expect(capturedParams!.prompt).not.toContain("register_branch");
  });
});

// ---------------------------------------------------------------------------
// TC-027: ClaudeCodeRunner does not import register_branch
// ---------------------------------------------------------------------------

describe("TC-027: ClaudeCodeRunner does not import register_branch", () => {
  it("no file in src/adapter/claude-code/ references register_branch as import", async () => {
    const claudeCodeDir = path.resolve(__dirname, "../../../../src/adapter/claude-code");
    const entries = await fs.readdir(claudeCodeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        const content = await fs.readFile(path.join(claudeCodeDir, entry.name), "utf-8");
        const importLines = content
          .split("\n")
          .filter((line) => line.trim().startsWith("import") && line.includes("register_branch"));
        expect(importLines).toHaveLength(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TC-028: requiresCommit guard — branch HEAD not advanced → error
// ---------------------------------------------------------------------------

describe("TC-028: ClaudeCodeRunner — no requiresCommit guard (moved to StepExecutor)", () => {
  it("does NOT return completionReason='error' for requiresCommit:true steps (guard removed from adapter)", async () => {
    // TC-028 updated: requiresCommit guard was removed from ClaudeCodeRunner.
    // StepExecutor.commitAndPush() now handles this via staged diff check.
    // The adapter should NOT trigger NO_COMMIT_DETECTED — it just runs the agent.
    const SHA = "sha-abc123deadbeef";

    const gitResponses = {
      "rev-parse": { stdout: SHA, exitCode: 0 },
      "branch": { stdout: "  feat/foo-bar", exitCode: 0 },
    };

    const spawnFn = makeGitSimulatingSpawnFn(gitResponses);
    const queryFn = makeQueryFn();

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn, _queryFn: queryFn });
    const state = makeJobState("tc028-job", "feat/foo-bar");

    const ctx: AgentRunContext = {
      step: makeAgentStep({
        name: "implementer",
        agent: {
          name: "specrunner-implementer",
          role: "implementer",
          model: "claude-sonnet-4-5",
          system: "implement",
          tools: [],
        },
        requiresCommit: true,
        resultFilePath: () => null,
      }),
      state,
      branch: "feat/foo-bar",
      slug: "foo-bar",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    // The adapter succeeds — commit+push check is StepExecutor's responsibility
    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// TC-029: branch does not exist after agent run → error
// ---------------------------------------------------------------------------

describe("TC-029: ClaudeCodeRunner — no requiresCommit guard (moved to StepExecutor)", () => {
  it("returns completionReason='success' regardless of branch state (adapter no longer checks requiresCommit)", async () => {
    // TC-029 updated: requiresCommit guard was removed from ClaudeCodeRunner.
    // StepExecutor.commitAndPush() now handles commit detection via staged diff check.
    const gitResponses = {
      "rev-parse": { stdout: "sha-abc123", exitCode: 0 },
      "branch": { stdout: "", exitCode: 0 },
    };

    const spawnFn = makeGitSimulatingSpawnFn(gitResponses);
    const queryFn = makeQueryFn();

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn, _queryFn: queryFn });
    const state = makeJobState("tc029-job", "feat/foo-bar");

    const ctx: AgentRunContext = {
      step: makeAgentStep({
        name: "design",
        agent: {
          name: "specrunner-design",
          role: "design",
          model: "claude-sonnet-4-5",
          system: "design",
          tools: [],
        },
        requiresCommit: true,
        resultFilePath: () => null,
      }),
      state,
      branch: "feat/foo-bar",
      slug: "foo-bar",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    // Adapter returns success — commit detection moved to StepExecutor
    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// SDK query error handling
// ---------------------------------------------------------------------------

describe("ClaudeCodeRunner SDK query error handling", () => {
  it("returns completionReason='error' when query result is error subtype", async () => {
    const queryFn = makeQueryFn({ result: "error" });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("error");
    expect(result.error?.code).toBe("CLAUDE_CODE_QUERY_FAILED");
  });

  it("returns completionReason='error' when query throws", async () => {
    const queryFn: QueryFn = async function* () {
      throw new Error("connection failed");
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("error");
    expect(result.error?.message).toContain("connection failed");
  });
});

// ---------------------------------------------------------------------------
// ClaudeCodeRunner follow-up 2-turn execution
// ---------------------------------------------------------------------------

describe("ClaudeCodeRunner follow-up 2-turn execution", () => {
  it("followUpPrompt 指定時に queryFn が 2 回呼ばれる", async () => {
    let callCount = 0;
    const callParams: Array<{ prompt: string; options?: Record<string, unknown> }> = [];

    const queryFn: QueryFn = async function* (params) {
      callCount++;
      callParams.push({ prompt: params.prompt as string, options: params.options });
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
        session_id: "sess-work",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ followUpPrompt: "fix the format" }),
      followUpPrompts: ["fix the format"],
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(2);
  });

  it("2 回目の queryFn options に resume: sessionId が含まれる", async () => {
    let callCount = 0;
    const callParams: Array<{ prompt: string; options?: Record<string, unknown> }> = [];

    const queryFn: QueryFn = async function* (params) {
      callCount++;
      callParams.push({ prompt: params.prompt as string, options: params.options });
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
        session_id: "sess-work-123",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ followUpPrompt: "fix the format" }),
      followUpPrompts: ["fix the format"],
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(callParams.length).toBe(2);
    // Second call should have resume: "sess-work-123"
    expect(callParams[1]!.options?.["resume"]).toBe("sess-work-123");
    // Second call prompt is the followUpPrompt
    expect(callParams[1]!.prompt).toBe("fix the format");
  });

  it("followUpPrompt 未指定時に queryFn が 1 回のみ呼ばれる", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
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
        session_id: "sess-work",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(), // no followUpPrompt
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);
    expect(callCount).toBe(1);
  });

  it("follow turn が error の場合 result.completionReason === 'error'", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
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
          session_id: "sess-work",
        } as unknown;
      } else {
        // follow turn returns error
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
          errors: ["follow error"],
          uuid: "test-uuid",
          session_id: "sess-work",
        } as unknown;
      }
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ followUpPrompt: "fix format" }),
      followUpPrompts: ["fix format"],
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("error");
    expect(result.error?.code).toBe("CLAUDE_CODE_QUERY_FAILED");
  });

  it("TC-25: work turn が abort されたとき follow turn が開始されず timeout が返る", async () => {
    let callCount = 0;
    const queryFn: QueryFn = async function* (params) {
      callCount++;
      const abortCtrl = params.options?.["abortController"] as AbortController | undefined;
      await new Promise<void>((_, reject) => {
        if (abortCtrl) {
          abortCtrl.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
          }, { once: true });
        }
      });
      yield {} as never; // never reached
    } as QueryFn;

    const config: SpecRunnerConfig = { ...makeConfig(), steps: { defaults: { timeoutMs: 50 } } };
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ followUpPrompt: "fix format" }),
      followUpPrompts: ["fix format"],
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("timeout");
    expect(callCount).toBe(1); // follow turn not started
  });

  it("modelUsage が作業 turn と follow turn の per-model 加算 (session 総量)", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      const modelUsage = callCount === 1
        ? {
            "claude-opus-4": {
              inputTokens: 100,
              outputTokens: 50,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          }
        : {
            // follow turn: 別 query invocation 単体の usage (= 累積ではない)
            "claude-opus-4": {
              inputTokens: 250,
              outputTokens: 120,
              cacheReadInputTokens: 10,
              cacheCreationInputTokens: 0,
            },
          };
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: callCount,
        stop_reason: "end_turn",
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage,
        permission_denials: [],
        uuid: "test-uuid",
        session_id: "sess-work",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ followUpPrompt: "fix format" }),
      followUpPrompts: ["fix format"],
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
    // 作業 turn (100/50/0) + follow turn (250/120/10) の per-model 加算
    expect(result.modelUsage?.["claude-opus-4"]?.inputTokens).toBe(350);
    expect(result.modelUsage?.["claude-opus-4"]?.outputTokens).toBe(170);
    expect(result.modelUsage?.["claude-opus-4"]?.cacheReadInputTokens).toBe(10);
  });

  it("followUpPrompts 2 件指定時に queryFn が 3 回呼ばれる (work + 2 follow)", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
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
        session_id: "sess-work",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      followUpPrompts: ["follow-rule-1", "follow-rule-2"],
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// modelUsage propagation
// ---------------------------------------------------------------------------

describe("ClaudeCodeRunner modelUsage propagation", () => {
  it("returns modelUsage from SDK success result", async () => {
    const queryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0.05,
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {
          "claude-opus-4-6": {
            inputTokens: 200,
            outputTokens: 100,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 5,
            webSearchRequests: 0,
            costUSD: 0.04,
            contextWindow: 200000,
            maxOutputTokens: 32000,
          },
          "claude-haiku-3-5": {
            inputTokens: 50,
            outputTokens: 20,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            webSearchRequests: 0,
            costUSD: 0.01,
            contextWindow: 200000,
            maxOutputTokens: 8192,
          },
        },
        permission_denials: [],
        uuid: "test-uuid",
        session_id: "test-session",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
    expect(result.modelUsage).toBeDefined();
    expect(result.modelUsage?.["claude-opus-4-6"]).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      cacheReadInputTokens: 10,
      cacheCreationInputTokens: 5,
    });
    expect(result.modelUsage?.["claude-haiku-3-5"]).toEqual({
      inputTokens: 50,
      outputTokens: 20,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });

  it("returns undefined modelUsage when SDK result has empty modelUsage", async () => {
    const queryFn = makeQueryFn({ result: "success" }); // makeQueryFn uses modelUsage: {}
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
    // Empty modelUsage {} is treated as absent — no value to record in state.
    expect(result.modelUsage).toBeUndefined();
  });

  it("does not include modelUsage on error path", async () => {
    const queryFn = makeQueryFn({ result: "error" });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("error");
    expect(result.modelUsage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-016: projectContext present → <project-context> tag in prompt
// TC-017: projectContext undefined → no <project-context> tag in prompt
// ---------------------------------------------------------------------------

describe("TC-016: ClaudeCodeRunner injects <project-context> when ctx.projectContext is set", () => {
  it("prompt includes <project-context> tag with projectContext content", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc016-job"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "base request content",
      config: makeConfig(),
      emit: vi.fn(),
      projectContext: "# Project\nStack: TypeScript",
    };

    await runner.run(ctx);

    expect(capturedParams).toBeDefined();
    expect(capturedParams!.prompt).toContain("<project-context>");
    expect(capturedParams!.prompt).toContain("# Project\nStack: TypeScript");
    expect(capturedParams!.prompt).toContain("</project-context>");
  });
});

// ---------------------------------------------------------------------------
// TC-032: timeoutMs triggers abort and returns timeout result
// TC-033: timeoutMs null means no timeout (default behavior)
// TC-034: step-level timeoutMs overrides defaults
// TC-035: timeoutMs: 0 disables timeout
// ---------------------------------------------------------------------------

describe("TC-032: timeoutMs triggers abort and returns timeout result", () => {
  it("returns completionReason='timeout' and error.code='STEP_TIMEOUT' when step exceeds timeoutMs", async () => {
    // queryFn that waits 200ms and throws if aborted (simulating real SDK behavior)
    const slowQueryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      const abortCtrl = params.options?.["abortController"] as AbortController | undefined;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 200);
        if (abortCtrl) {
          abortCtrl.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("AbortError");
            (err as { name: string }).name = "AbortError";
            reject(err);
          }, { once: true });
        }
      });
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 200,
        duration_api_ms: 180,
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
    } as QueryFn;

    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { timeoutMs: 50 },
      },
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: slowQueryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc032-job"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("timeout");
    expect((result.error as { code?: string })?.code).toBe("STEP_TIMEOUT");
  });
});

describe("TC-033: timeoutMs null means no timeout (default behavior)", () => {
  it("returns completionReason='success' when no timeout is configured", async () => {
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeQueryFn() });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc033-job"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(), // no steps → timeoutMs resolves to null
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
  });
});

describe("TC-034: step-level timeoutMs overrides defaults", () => {
  it("uses step-level timeoutMs (5000ms) over defaults (50ms) — step completes in 100ms without timeout", async () => {
    // queryFn that takes 100ms and respects abort — longer than defaults (50ms) but shorter than step-level (5000ms)
    const mediumQueryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      const abortCtrl = params.options?.["abortController"] as AbortController | undefined;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        if (abortCtrl) {
          abortCtrl.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("AbortError");
            (err as { name: string }).name = "AbortError";
            reject(err);
          }, { once: true });
        }
      });
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 100,
        duration_api_ms: 90,
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
    } as QueryFn;

    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { timeoutMs: 50 },
        "spec-review": { timeoutMs: 5000 },
      },
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: mediumQueryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ name: "spec-review" }),
      state: makeJobState("tc034-job"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
  });
});

describe("TC-035: timeoutMs: 0 disables timeout", () => {
  it("returns completionReason='success' when timeoutMs is 0 (timeout disabled)", async () => {
    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { timeoutMs: 0 },
      },
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeQueryFn() });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc035-job"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
  });
});

describe("TC-017: ClaudeCodeRunner omits <project-context> when ctx.projectContext is undefined", () => {
  it("prompt does not include <project-context> tag when projectContext is absent", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc017-job"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "base request content",
      config: makeConfig(),
      emit: vi.fn(),
      // projectContext intentionally absent
    };

    await runner.run(ctx);

    expect(capturedParams).toBeDefined();
    expect(capturedParams!.prompt).not.toContain("<project-context>");
  });
});

// ---------------------------------------------------------------------------
// TC-041: Non-timeout error is not misclassified as timeout (ClaudeCodeRunner)
// ---------------------------------------------------------------------------

describe("TC-041: Non-timeout error is not misclassified as timeout (ClaudeCodeRunner)", () => {
  it("returns completionReason='error' when queryFn throws non-abort error with timeoutMs configured", async () => {
    // queryFn that throws a regular error immediately (not an AbortError)
    const queryFn: QueryFn = async function* () {
      throw new Error("immediate non-abort error");
    } as QueryFn;

    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { timeoutMs: 5000 },
      },
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc041-job"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    // The error must NOT be classified as timeout even though timeoutMs is configured
    expect(result.completionReason).not.toBe("timeout");
    expect(result.completionReason).toBe("error");
    expect((result.error as { code?: string })?.code).toBe("CLAUDE_CODE_QUERY_FAILED");
  });
});

// ---------------------------------------------------------------------------
// TC-10-1: AbortController — abort 発火で残り follow turn が中断される
// ---------------------------------------------------------------------------

describe("TC-10-1: abort 発火で残り follow turn が中断される", () => {
  it("followUpPrompts 3 件のうち 1 件目実行中に abort → 残り 2 件は実行されない", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* (params) {
      callCount++;
      const abortCtrl = params.options?.["abortController"] as AbortController | undefined;

      if (callCount === 1) {
        // Work turn — succeeds immediately
        yield {
          type: "result" as const,
          subtype: "success" as const,
          result: "done",
          duration_ms: 10,
          duration_api_ms: 10,
          is_error: false,
          num_turns: 1,
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          uuid: "uuid-work",
          session_id: "sess-tc10-1",
        } as unknown;
      } else {
        // First follow turn — waits for abort signal; subsequent follow turns never reach here
        await new Promise<void>((_, reject) => {
          if (abortCtrl) {
            abortCtrl.signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
            }, { once: true });
          }
        });
        yield {} as never; // never reached
      }
    } as QueryFn;

    const config: SpecRunnerConfig = { ...makeConfig(), steps: { defaults: { timeoutMs: 50 } } };
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      followUpPrompts: ["a", "b", "c"],
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    // Abort fires during first follow turn → timeout
    expect(result.completionReason).toBe("timeout");
    // work turn (1) + first follow turn (2) only; "b" and "c" never started
    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Session continuity (T-06)
// ---------------------------------------------------------------------------

describe("ClaudeCodeRunner session continuity (resumeSessionId)", () => {
  it("passes resume option to queryFn when resumeSessionId is set", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
      resumeSessionId: "sess-abc",
    };

    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
    expect(capturedParams!.options?.["resume"]).toBe("sess-abc");
  });

  it("does NOT include resume option when resumeSessionId is not set", async () => {
    let capturedParams: { prompt: string; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
      // resumeSessionId intentionally absent
    };

    await runner.run(ctx);
    expect(capturedParams!.options?.["resume"]).toBeUndefined();
  });

  it("falls back to new session (no resume) and warns when session resume throws (non-timeout)", async () => {
    let callCount = 0;
    let secondCallOptions: Record<string, unknown> | undefined;
    const warnLines: string[] = [];

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      warnLines.push(String(chunk));
      return true;
    });

    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      callCount++;
      if (callCount === 1) {
        // First call (with resume) — throw to simulate session expired
        throw new Error("session not found");
      }
      // Second call (fallback without resume)
      secondCallOptions = params.options;
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
        session_id: "new-session",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
      resumeSessionId: "sess-expired",
    };

    const result = await runner.run(ctx);
    // Should succeed with fallback
    expect(result.completionReason).toBe("success");
    // Second call should NOT have resume option
    expect(secondCallOptions?.["resume"]).toBeUndefined();
    // Should have logged a warning
    expect(warnLines.some((l) => l.includes("warn") || l.includes("resume"))).toBe(true);
    // queryFn called twice
    expect(callCount).toBe(2);

    stderrSpy.mockRestore();
  });

  it("does NOT fallback (returns timeout) when resume throws due to abort/timeout", async () => {
    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: {
        defaults: { timeoutMs: 50 },
      },
    };

    // queryFn that respects abort and throws on abort
    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      const abortCtrl = params.options?.["abortController"] as AbortController | undefined;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 200);
        if (abortCtrl) {
          abortCtrl.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("AbortError");
            (err as { name: string }).name = "AbortError";
            reject(err);
          }, { once: true });
        }
      });
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config,
      emit: vi.fn(),
      resumeSessionId: "sess-abc",
    };

    const result = await runner.run(ctx);
    // Timeout — should NOT fallback to new session
    expect(result.completionReason).toBe("timeout");
    expect((result.error as { code?: string })?.code).toBe("STEP_TIMEOUT");
  });
});

// ---------------------------------------------------------------------------
// TC-EMIT-001: step:progress emit on tool_use in main stream loop
// TC-EMIT-002: no step:progress emit when no tool_use messages
// TC-EMIT-003: step:progress emit in follow-up loop
// ---------------------------------------------------------------------------

describe("TC-EMIT: ClaudeCodeRunner emits step:progress on tool_use messages", () => {
  it("TC-EMIT-001: emits step:progress when tool_use content_block_start appears in main stream", async () => {
    const emitFn = vi.fn();
    const queryFn: QueryFn = async function* () {
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Edit", input: { file_path: "src/foo.ts" } },
        },
      } as unknown;
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 10,
        duration_api_ms: 10,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        uuid: "u1",
        session_id: "s1",
      } as unknown;
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ name: "implementer" }),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: emitFn,
    };

    await runner.run(ctx);

    const progressCalls = emitFn.mock.calls.filter((c) => c[0] === "step:progress");
    expect(progressCalls).toHaveLength(1);
    expect(progressCalls[0]?.[1]).toMatchObject({ step: "implementer", tool: "Edit", target: "src/foo.ts" });
  });

  it("TC-EMIT-002: no step:progress when stream has no tool_use messages", async () => {
    const emitFn = vi.fn();
    const queryFn = makeQueryFn(); // yields only result message

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: emitFn,
    };

    await runner.run(ctx);

    const progressCalls = emitFn.mock.calls.filter((c) => c[0] === "step:progress");
    expect(progressCalls).toHaveLength(0);
  });

  it("TC-EMIT-003: emits step:progress in follow-up loop", async () => {
    const emitFn = vi.fn();
    const sessionId = "follow-session-id";
    let callCount = 0;

    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      callCount++;
      if (callCount === 1) {
        // Main turn: yields result with session_id
        yield {
          type: "result" as const,
          subtype: "success" as const,
          result: "done",
          duration_ms: 10,
          duration_api_ms: 10,
          is_error: false,
          num_turns: 1,
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          uuid: "u1",
          session_id: sessionId,
        } as unknown;
      } else {
        // Follow-up turn: yields tool_use then result
        yield {
          type: "stream_event",
          event: {
            type: "content_block_start",
            content_block: { type: "tool_use", name: "Bash", input: { command: "bun run test" } },
          },
        } as unknown;
        yield {
          type: "result" as const,
          subtype: "success" as const,
          result: "done",
          duration_ms: 10,
          duration_api_ms: 10,
          is_error: false,
          num_turns: 1,
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          uuid: "u2",
          session_id: sessionId,
        } as unknown;
      }
    } as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ name: "implementer" }),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: emitFn,
      followUpPrompts: ["verify your work"],
    };

    await runner.run(ctx);

    const progressCalls = emitFn.mock.calls.filter((c) => c[0] === "step:progress");
    expect(progressCalls).toHaveLength(1);
    expect(progressCalls[0]?.[1]).toMatchObject({ step: "implementer", tool: "Bash" });
  });
});

// ---------------------------------------------------------------------------
// TC-10c: resumePrompt injection (T-10c)
// ---------------------------------------------------------------------------

describe("TC-10c: ClaudeCodeRunner — resumePrompt injection", () => {
  it("ctx.resumePrompt が設定されているとき、fullPrompt に <resume-context> セクションが含まれる", async () => {
    let capturedPrompt: string | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedPrompt = params.prompt; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc10c-job-001"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "base request",
      config: makeConfig(),
      emit: vi.fn(),
      resumePrompt: "手動で foo.ts の import を修正済み",
    };

    await runner.run(ctx);

    expect(capturedPrompt).toBeDefined();
    expect(capturedPrompt).toContain("<resume-context>");
    expect(capturedPrompt).toContain("手動で foo.ts の import を修正済み");
    expect(capturedPrompt).toContain("</resume-context>");
  });

  it("ctx.resumePrompt が未設定のとき、fullPrompt に <resume-context> が含まれない", async () => {
    let capturedPrompt: string | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedPrompt = params.prompt; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc10c-job-002"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "base request",
      config: makeConfig(),
      emit: vi.fn(),
      // resumePrompt intentionally absent
    };

    await runner.run(ctx);

    expect(capturedPrompt).toBeDefined();
    expect(capturedPrompt).not.toContain("<resume-context>");
  });

  it("resumePrompt は baseMessage と additionalInstructions の間に挿入される", async () => {
    let capturedPrompt: string | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedPrompt = params.prompt; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep({ buildMessage: () => "BASE_MESSAGE" }),
      state: makeJobState("tc10c-job-003", "feat/branch"),
      branch: "feat/branch",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "base request",
      config: makeConfig(),
      emit: vi.fn(),
      resumePrompt: "RESUME_CONTEXT",
    };

    await runner.run(ctx);

    expect(capturedPrompt).toBeDefined();
    // resumePrompt appears before additionalInstructions (which contains RUNTIME INSTRUCTIONS)
    const resumeIdx = capturedPrompt!.indexOf("<resume-context>");
    const runtimeIdx = capturedPrompt!.indexOf("RUNTIME INSTRUCTIONS");
    expect(resumeIdx).toBeGreaterThan(-1);
    expect(runtimeIdx).toBeGreaterThan(-1);
    expect(resumeIdx).toBeLessThan(runtimeIdx);
  });
});
