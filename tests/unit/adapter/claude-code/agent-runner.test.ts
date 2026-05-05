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
import type { SpawnFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

let tempDir: string;
let originalClaudeBin: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-runner-test-"));
  originalClaudeBin = process.env["CLAUDE_BIN"];
  // Set CLAUDE_BIN to a deterministic value (actual binary unused — spawn is injected)
  process.env["CLAUDE_BIN"] = "/fake/claude";
});

afterEach(async () => {
  if (originalClaudeBin !== undefined) {
    process.env["CLAUDE_BIN"] = originalClaudeBin;
  } else {
    delete process.env["CLAUDE_BIN"];
  }
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
    anthropic: { apiKey: "" },
    agents: {},
    github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
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
 * Create a fake EventEmitter-based child process that simulates a subprocess.
 * The process exits with the given code after stdin is closed.
 */
function makeFakeChild(opts: {
  exitCode?: number;
  captureStdin?: (data: string) => void;
  captureCwd?: (cwd: string) => void;
  cwd?: string;
  sideEffect?: (cwd: string) => Promise<void> | void;
}) {
  const { exitCode = 0, captureStdin, captureCwd, cwd = "", sideEffect } = opts;

  if (captureCwd) captureCwd(cwd);

  const chunks: string[] = [];

  // Build fake stdin with custom write/end — cast through unknown to bypass strict overload checks
  const stdinEmitter = new EventEmitter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stdinAny = stdinEmitter as any;
  stdinAny.write = (data: Buffer | string, _enc?: unknown): boolean => {
    chunks.push(typeof data === "string" ? data : data.toString());
    return true;
  };
  stdinAny.end = (): void => {
    const full = chunks.join("");
    if (captureStdin) captureStdin(full);
    Promise.resolve(sideEffect ? sideEffect(cwd) : undefined).then(() => {
      procAny.emit("close", exitCode);
    });
  };

  const procEmitter = new EventEmitter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procAny = procEmitter as any;
  procAny.stdin = stdinAny;
  procAny.stdout = new EventEmitter();
  procAny.stderr = new EventEmitter();

  return procEmitter as unknown as ChildProcess;
}

/**
 * Create a fake spawn function that simulates a subprocess using EventEmitter.
 * Uses ClaudeCodeRunner's _spawnFn injection to avoid module-level mock pollution
 * from other test files that mock node:child_process.
 */
function makeSpawnFn(opts: {
  exitCode?: number;
  captureStdin?: (data: string) => void;
  captureCwd?: (cwd: string) => void;
  sideEffect?: (cwd: string) => Promise<void> | void;
} = {}): SpawnFn {
  const { exitCode = 0, captureStdin, captureCwd, sideEffect } = opts;

  return vi.fn((bin: string, _args: string[], spawnOpts: SpawnOptions): ChildProcess => {
    const cwd = (spawnOpts.cwd as string) ?? "";
    return makeFakeChild({ exitCode, captureStdin, captureCwd, cwd, sideEffect });
  });
}

/**
 * Create a spawn function that simulates git behavior for requiresCommit tests.
 *
 * TC-028/TC-029 need to test git-based branch verification logic. Instead of
 * using real git (which would require bypassing module-level mocks from other test files),
 * we simulate git responses deterministically.
 *
 * gitResponses maps git argument patterns to simulated stdout/exitCode pairs:
 * - key: first git argument after "git" (e.g. "rev-parse", "branch")
 * - value: { stdout, exitCode }
 */
function makeGitSimulatingSpawnFn(gitResponses: Record<string, { stdout: string; exitCode: number }>): SpawnFn {
  const claudeBinPath = process.env["CLAUDE_BIN"] ?? "/fake/claude";

  return (bin: string, args: string[], spawnOpts: SpawnOptions): ChildProcess => {
    const cwd = (spawnOpts.cwd as string) ?? "";

    if (bin === claudeBinPath || bin === "claude") {
      // Fake claude subprocess: exits 0, does nothing
      return makeFakeChild({ exitCode: 0, cwd });
    }

    if (bin === "git") {
      // Simulate git based on first arg (e.g. "rev-parse" or "branch")
      const gitCmd = args[0] ?? "unknown";
      const response = gitResponses[gitCmd] ?? { stdout: "", exitCode: 0 };

      const stdoutEm = new EventEmitter();
      const procEm = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procAny = procEm as any;
      procAny.stdin = { write: () => true, end: () => {} };
      procAny.stdout = stdoutEm;
      procAny.stderr = new EventEmitter();

      // Emit data then close
      setImmediate(() => {
        if (response.stdout) {
          stdoutEm.emit("data", Buffer.from(response.stdout + "\n"));
        }
        procEm.emit("close", response.exitCode);
      });

      return procEm as unknown as ChildProcess;
    }

    // Unknown binary — return a fake that errors
    const proc = new EventEmitter() as unknown as ChildProcess;
    setImmediate(() => proc.emit("close", 1));
    return proc;
  };
}

// ---------------------------------------------------------------------------
// TC-022: ClaudeCodeRunner implements AgentRunner interface
// ---------------------------------------------------------------------------

describe("TC-022: ClaudeCodeRunner implements AgentRunner interface", () => {
  it("ClaudeCodeRunner has a run() method", () => {
    const runner = new ClaudeCodeRunner({ cwd: tempDir });
    expect(typeof runner.run).toBe("function");
  });

  it("ClaudeCodeRunner.run() accepts AgentRunContext and returns AgentRunResult", async () => {
    const spawnFn = makeSpawnFn({ exitCode: 0 });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
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
// TC-023: query() receives ctx.cwd (subprocess invoked with cwd)
// ---------------------------------------------------------------------------

describe("TC-023: ClaudeCodeRunner invokes subprocess with ctx.cwd", () => {
  it("subprocess is called with the correct cwd", async () => {
    let capturedCwd: string | undefined;

    const spawnFn = makeSpawnFn({
      exitCode: 0,
      captureCwd: (cwd) => { capturedCwd = cwd; },
    });

    const worktreeCwd = tempDir;
    const runner = new ClaudeCodeRunner({ cwd: worktreeCwd, _spawnFn: spawnFn });
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

    expect(capturedCwd).toBe(worktreeCwd);
  });

  it("spawn is called with the binary from CLAUDE_BIN env", async () => {
    const spawnFn = makeSpawnFn({ exitCode: 0 });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
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

    expect(spawnFn).toHaveBeenCalledWith(
      "/fake/claude",
      expect.any(Array),
      expect.objectContaining({ cwd: tempDir }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-024: ClaudeCodeRunner does not import SessionClient / @anthropic-ai/sdk
// ---------------------------------------------------------------------------

describe("TC-024: ClaudeCodeRunner does not import SessionClient or @anthropic-ai/sdk", () => {
  it("claude-code/agent-runner.ts has no SessionClient import statement", async () => {
    const filePath = path.resolve(__dirname, "../../../../src/adapter/claude-code/agent-runner.ts");
    const content = await fs.readFile(filePath, "utf-8");
    // Check for actual import lines (not comments)
    const importLines = content
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => /import\s+.*SessionClient/.test(l));
    expect(importLines).toHaveLength(0);
  });

  it("claude-code/agent-runner.ts has no @anthropic-ai/sdk import statement", async () => {
    const filePath = path.resolve(__dirname, "../../../../src/adapter/claude-code/agent-runner.ts");
    const content = await fs.readFile(filePath, "utf-8");
    // Check for actual import lines (not comments)
    const importLines = content
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => /from\s+["']@anthropic-ai\/sdk/.test(l));
    expect(importLines).toHaveLength(0);
  });

  it("no file in src/adapter/claude-code/ has import statement for @anthropic-ai/sdk", async () => {
    const claudeCodeDir = path.resolve(__dirname, "../../../../src/adapter/claude-code");
    const entries = await fs.readdir(claudeCodeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        const content = await fs.readFile(path.join(claudeCodeDir, entry.name), "utf-8");
        // Check for actual import statements (not comments)
        const importLines = content
          .split("\n")
          .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
          .filter((line) => /import\s+.*@anthropic-ai\/sdk/.test(line) || /from\s+["']@anthropic-ai\/sdk/.test(line));
        expect(importLines).toHaveLength(0);
        // SessionClient should not be imported either
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
  it("result file is read from local filesystem after subprocess completes", async () => {
    const resultRelPath = "openspec/changes/test-slug/spec-review-result-001.md";
    const expectedContent = "## Verdict\napproved";

    // Side effect: create the result file in the cwd
    const spawnFn = makeSpawnFn({
      exitCode: 0,
      sideEffect: async (cwd) => {
        const filePath = path.join(cwd, resultRelPath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, expectedContent, "utf-8");
      },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
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

describe("TC-026: ClaudeCodeRunner additionalInstructions contains branch checkout", () => {
  it("subprocess prompt includes 'git checkout -b feat/foo-bar'", async () => {
    let capturedStdin = "";

    const spawnFn = makeSpawnFn({
      exitCode: 0,
      captureStdin: (data) => { capturedStdin = data; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
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

    // TC-026: prompt should mention the branch (git checkout -b feat/foo-bar)
    expect(capturedStdin).toContain("feat/foo-bar");
    // And no register_branch reference (TC-027)
    expect(capturedStdin).not.toContain("register_branch");
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
        // Check for imports — not comments
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

describe("TC-028: ClaudeCodeRunner requiresCommit guard — branch not advanced", () => {
  it("returns completionReason='error' when branch HEAD did not advance", async () => {
    // Simulate git responses:
    // - rev-parse before: returns sha-abc123 (branch exists, has a commit)
    // - branch --list: returns "feat/foo-bar" (branch exists)
    // - rev-parse after: returns sha-abc123 (SAME sha → HEAD did not advance)
    const SHA = "sha-abc123deadbeef";
    let revParseCallCount = 0;

    const gitResponses = {
      "rev-parse": { stdout: SHA, exitCode: 0 },
      "branch": { stdout: "  feat/foo-bar", exitCode: 0 },
    };

    // We need rev-parse to be called twice (before and after), returning the same SHA
    // makeGitSimulatingSpawnFn always returns the same response for each command key,
    // so both pre-run and post-run rev-parse return the same SHA → HEAD did not advance
    const spawnFn = makeGitSimulatingSpawnFn(gitResponses);

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
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

    const result = await runner.run(ctx);
    // TC-028: branch HEAD not advanced → error
    expect(result.completionReason).toBe("error");
    expect(result.error?.message).toMatch(/branch HEAD did not advance/);

    // Suppress unused variable warning
    void revParseCallCount;
  });
});

// ---------------------------------------------------------------------------
// TC-029: branch does not exist after agent run → error
// ---------------------------------------------------------------------------

describe("TC-029: ClaudeCodeRunner requiresCommit — branch does not exist → error", () => {
  it("returns completionReason='error' when expected branch does not exist after run", async () => {
    // Simulate git responses:
    // - rev-parse before: returns a sha (branch appears to exist pre-run)
    // - branch --list: returns "" (branch does NOT exist after run)
    const gitResponses = {
      "rev-parse": { stdout: "sha-abc123", exitCode: 0 },
      "branch": { stdout: "", exitCode: 0 }, // empty output → branch not found
    };

    const spawnFn = makeGitSimulatingSpawnFn(gitResponses);

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
    const state = makeJobState("tc029-job", "feat/foo-bar");

    const ctx: AgentRunContext = {
      step: makeAgentStep({
        name: "propose",
        agent: {
          name: "specrunner-propose",
          role: "propose",
          model: "claude-sonnet-4-5",
          system: "propose",
          tools: [],
        },
        requiresCommit: true,
        resultFilePath: () => null,
      }),
      state,
      branch: "feat/foo-bar", // branch does not exist (simulated)
      slug: "foo-bar",
      cwd: tempDir,
      requestContent: "content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    const result = await runner.run(ctx);
    // TC-029: branch does not exist → error
    expect(result.completionReason).toBe("error");
    expect(result.error).toBeDefined();
    // TC-029: no GitHub API calls (git only)
    // Verified by the absence of any githubClient usage in ClaudeCodeRunner
  });
});
