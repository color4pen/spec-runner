/**
 * TC-FW-*: createWorkspaceToolGuard unit tests (write-scope-guard-redo)
 *
 * TC-FW-01: out-of-workspace absolute Write → deny with worktree-naming message
 * TC-FW-02: relative-escape Edit (../outside.txt) → deny
 * TC-FW-03: in-workspace Edit → allow
 * TC-FW-04: Bash / Read / MCP tool → allow each
 * TC-FW-05: Write with missing / non-string file_path → allow
 *
 * TC-FW-06: step-agent queryOptions freeze (no reportTool)
 * TC-FW-07: step-agent queryOptions freeze (with reportTool)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createWorkspaceToolGuard,
  ClaudeCodeRunner,
} from "../agent-runner.js";
import type { QueryFn, CreateMcpServerFn, WorkspaceToolGuard } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { ReportToolSpec } from "../../../core/port/report-result.js";
import { parseBaseReportInput } from "../../../core/port/report-result.js";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-guard-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeQueryFn(opts: {
  captureParams?: (params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) => void;
} = {}): QueryFn {
  const { captureParams } = opts;

  return async function* mockQuery(params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
    if (captureParams) captureParams(params);
    const sessionId = "test-session-id";
    yield {
      type: "result",
      subtype: "success",
      result: "",
      session_id: sessionId,
    };
  };
}

function makeReportTool(): ReportToolSpec {
  return {
    name: "report_result",
    description: "Report completion of this step.",
    zodSchema: {},
    parseInput: parseBaseReportInput,
  };
}

function makeMockCreateMcpServerFn(): CreateMcpServerFn {
  return ((opts: unknown) => {
    const o = opts as { name: string; tools: Array<{ name: string }> };
    return { type: "sdk" as const, name: o.name, instance: {} as unknown };
  }) as unknown as CreateMcpServerFn;
}

// Stub for CanUseTool options parameter (the 3rd arg, not used in pure tests)
const stubOptions = {
  signal: new AbortController().signal,
  toolUseID: "stub-tool-use-id",
};

// ---------------------------------------------------------------------------
// TC-FW-01..TC-FW-05: createWorkspaceToolGuard unit tests
// ---------------------------------------------------------------------------

describe("TC-FW-01: out-of-workspace absolute Write → deny", () => {
  it("denies Write with an absolute path outside cwd", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const outsidePath = path.join(os.tmpdir(), "outside-file.txt");
    const result = await guard("Write", { file_path: outsidePath }, stubOptions);
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toBeTruthy();
      expect(result.message.length).toBeGreaterThan(0);
      // Message must name the worktree (cwd) and contain workspace/worktree guidance
      const lowerMsg = result.message.toLowerCase();
      expect(lowerMsg.includes("worktree") || lowerMsg.includes("workspace")).toBe(true);
    }
  });

  it("denies Write with a path in a sibling directory", async () => {
    const siblingDir = path.join(path.dirname(tempDir), "sibling-dir");
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Write", { file_path: path.join(siblingDir, "file.txt") }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

describe("TC-FW-02: relative-escape Edit (../outside.txt) → deny", () => {
  it("denies Edit with ../outside.txt", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Edit", { file_path: "../outside.txt" }, stubOptions);
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toBeTruthy();
    }
  });

  it("denies Edit with ../../deep/escape.txt", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Edit", { file_path: "../../deep/escape.txt" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

describe("TC-FW-03: in-workspace Edit → allow", () => {
  it("allows Edit with path inside cwd", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const insidePath = path.join(tempDir, "subdir", "file.txt");
    const result = await guard("Edit", { file_path: insidePath }, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows Edit with relative path inside cwd", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Edit", { file_path: "subdir/file.ts" }, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows Write with path equal to cwd", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    // file_path pointing directly at cwd (edge case, resolves to "")
    const result = await guard("Write", { file_path: tempDir }, stubOptions);
    expect(result.behavior).toBe("allow");
  });
});

describe("TC-FW-04: Bash / Read / MCP tool → allow each", () => {
  it("allows Bash with any command", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git status" }, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows Read with any path (including outside cwd)", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Read", { file_path: "/etc/hosts" }, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows mcp__specrunner_report__report_result", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("mcp__specrunner_report__report_result", {}, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows Grep with any path", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Grep", { pattern: "foo", path: "/some/path" }, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows Glob with any pattern", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Glob", { pattern: "**/*.ts" }, stubOptions);
    expect(result.behavior).toBe("allow");
  });
});

describe("TC-FW-05: Write with missing / non-string file_path → allow", () => {
  it("allows Write with missing file_path", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Write", {}, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows Write with null file_path", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Write", { file_path: null }, stubOptions);
    expect(result.behavior).toBe("allow");
  });

  it("allows Edit with numeric file_path", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Edit", { file_path: 42 }, stubOptions);
    expect(result.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-06: step-agent queryOptions freeze (no reportTool)
// ---------------------------------------------------------------------------

describe("TC-FW-06: step-agent queryOptions freeze — no reportTool", () => {
  it("permissionMode === 'default', allowedTools excludes Edit/Write, includes canUseTool, sandbox.allowUnsandboxedCommands === false", async () => {
    let capturedParams: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc-fw-06"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      input: { requestContent: "content" },
      session: {},
      policy: {},
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams).toBeDefined();
    const options = capturedParams!.options;

    // permissionMode must be "default"
    expect(options?.permissionMode).toBe("default");

    // allowedTools must not contain Edit or Write
    const allowedTools = options?.allowedTools as string[];
    expect(allowedTools).not.toContain("Edit");
    expect(allowedTools).not.toContain("Write");

    // allowedTools must not contain any mcp__specrunner_report__* when no reportTool
    const hasMcpReportEntry = allowedTools.some((t) => t.startsWith("mcp__specrunner_report__"));
    expect(hasMcpReportEntry).toBe(false);

    // canUseTool must be a function
    expect(typeof options?.canUseTool).toBe("function");

    // sandbox.allowUnsandboxedCommands must be false
    const sandbox = options?.sandbox as Record<string, unknown>;
    expect(sandbox?.allowUnsandboxedCommands).toBe(false);
  });

  it("the wired canUseTool denies out-of-workspace Write and allows in-workspace Write", async () => {
    let capturedParams: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc-fw-06b"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      input: { requestContent: "content" },
      session: {},
      policy: {},
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    const canUseTool = capturedParams!.options?.canUseTool as (
      toolName: string,
      input: Record<string, unknown>,
      opts: { signal: AbortSignal; toolUseID: string },
    ) => Promise<{ behavior: string; message?: string }>;

    expect(typeof canUseTool).toBe("function");

    // Out-of-workspace Write → deny
    const outsideResult = await canUseTool(
      "Write",
      { file_path: path.join(os.tmpdir(), "outside.txt") },
      stubOptions,
    );
    expect(outsideResult.behavior).toBe("deny");

    // In-workspace Write → allow
    const insideResult = await canUseTool(
      "Write",
      { file_path: path.join(tempDir, "inside.txt") },
      stubOptions,
    );
    expect(insideResult.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-07: step-agent queryOptions freeze — with reportTool
// ---------------------------------------------------------------------------

describe("TC-FW-07: step-agent queryOptions freeze — with reportTool", () => {
  it("allowedTools contains mcp__specrunner_report__report_result when reportTool is configured", async () => {
    let capturedParams: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> } | undefined;

    const queryFn = makeQueryFn({
      captureParams: (params) => { capturedParams = params; },
    });

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: makeMockCreateMcpServerFn(),
    });

    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState("tc-fw-07"),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      input: { requestContent: "content" },
      session: {},
      policy: { reportTool: makeReportTool() },
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    expect(capturedParams).toBeDefined();
    const allowedTools = capturedParams!.options?.allowedTools as string[];

    // Must contain the MCP report tool pre-approval entry
    expect(allowedTools).toContain("mcp__specrunner_report__report_result");

    // Must still not contain Edit or Write
    expect(allowedTools).not.toContain("Edit");
    expect(allowedTools).not.toContain("Write");
  });
});
