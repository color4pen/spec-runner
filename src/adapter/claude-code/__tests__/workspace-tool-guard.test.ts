/**
 * Tests for the workspace write guard and its wiring into step-agent query options.
 *
 * TC-FW-01: out-of-workspace absolute Write → behavior: "deny" with worktree-naming message
 * TC-FW-02: relative-escape Edit (../outside.txt) → behavior: "deny"
 * TC-FW-03: in-workspace Edit (path under cwd) → behavior: "allow"
 * TC-FW-04: Bash, Read, report_result MCP tool → behavior: "allow" for each
 * TC-FW-05: step-agent queryOptions.canUseTool is a function, permissionMode is "dontAsk",
 *           allowedTools and disallowedTools are unchanged
 * TC-FW-06: step-agent queryOptions.sandbox.allowUnsandboxedCommands === false (T-04 adopted)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createWorkspaceToolGuard, ClaudeCodeRunner } from "../agent-runner.js";
import type { QueryFn } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-guard-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures (same pattern as TC-SB-01 / TC-AR-01)
// ---------------------------------------------------------------------------

function makeJobState(jobId = "test-job"): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test",
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
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-6",
      system: "implement this",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    ...overrides,
  };
}

function makeCtx(step: AgentStep, state: JobState): AgentRunContext {
  return {
    step,
    state,
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: {},
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  };
}

function makeSuccessResult(): unknown {
  return {
    type: "result",
    subtype: "success",
    result: "done",
    duration_ms: 100,
    duration_api_ms: 80,
    is_error: false,
    num_turns: 1,
    stop_reason: "end_turn",
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "test-uuid",
    session_id: "test-session",
  };
}

/** Minimal opts object matching the shape the SDK passes to canUseTool. */
const minimalOpts: Record<string, unknown> = {
  signal: new AbortController().signal,
  toolUseID: "test-tool-use-id",
};

// ---------------------------------------------------------------------------
// TC-FW-01: out-of-workspace absolute Write → deny with worktree-naming message
// ---------------------------------------------------------------------------

describe("TC-FW-01: out-of-workspace absolute Write is denied", () => {
  it("returns behavior=deny, non-empty message containing 'worktree' or 'workspace'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Write", { file_path: "/etc/passwd" }, minimalOpts);

    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message.length).toBeGreaterThan(0);
      const lower = result.message.toLowerCase();
      expect(lower.includes("worktree") || lower.includes("workspace")).toBe(true);
    }
  });

  it("denies Write to a path in a sibling directory", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    // Construct an absolute path outside tempDir
    const outsidePath = path.join(path.dirname(tempDir), "other-dir", "file.txt");
    const result = await guard("Write", { file_path: outsidePath }, minimalOpts);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-02: relative-escape Edit → deny
// ---------------------------------------------------------------------------

describe("TC-FW-02: relative-escape Edit is denied", () => {
  it("denies Edit with file_path='../outside.txt'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Edit", { file_path: "../outside.txt" }, minimalOpts);
    expect(result.behavior).toBe("deny");
  });

  it("denies Edit with file_path='../../deep/escape.ts'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Edit", { file_path: "../../deep/escape.ts" }, minimalOpts);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-03: in-workspace Edit is allowed
// ---------------------------------------------------------------------------

describe("TC-FW-03: in-workspace Edit is allowed", () => {
  it("allows Edit for an absolute path inside cwd", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const insidePath = path.join(tempDir, "src", "foo.ts");
    const result = await guard("Edit", { file_path: insidePath }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });

  it("allows Edit for a relative path inside cwd", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Edit", { file_path: "src/bar.ts" }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });

  it("allows Write for a file_path exactly equal to cwd", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    // D6: relative path is "" (resolved == cwd) → inside
    const result = await guard("Write", { file_path: tempDir }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });

  it("allows Write when file_path is missing (undefined)", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    // D6: missing/non-string file_path → allow, let the tool fail on its own
    const result = await guard("Write", { /* no file_path */ }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });

  it("allows Write when file_path is null (non-string)", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Write", { file_path: null as unknown as string }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-04: Bash, Read, and MCP tool are allowed regardless
// ---------------------------------------------------------------------------

describe("TC-FW-04: non-write tools are always allowed", () => {
  it("Bash with any command is allowed", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "rm -rf /etc/passwd" }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });

  it("Read with an out-of-workspace path is allowed (reads are unrestricted)", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Read", { file_path: "/etc/passwd" }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });

  it("report_result MCP tool is allowed", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("report_result", { verdict: "approved" }, minimalOpts);
    expect(result.behavior).toBe("allow");
  });

  it("Grep and Glob are allowed", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const grepResult = await guard("Grep", { pattern: "foo", path: "/etc" }, minimalOpts);
    expect(grepResult.behavior).toBe("allow");

    const globResult = await guard("Glob", { pattern: "**/*.ts" }, minimalOpts);
    expect(globResult.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-05: step-agent queryOptions carries canUseTool, correct permissionMode,
//           unchanged allowedTools and disallowedTools
// ---------------------------------------------------------------------------

describe("TC-FW-05: step-agent queryOptions carries the workspace guard and dontAsk mode", () => {
  it("canUseTool is a function, permissionMode is 'dontAsk', tools unchanged", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-fw-05")));

    expect(capturedOptions).toBeDefined();

    // canUseTool is present and is a function (the workspace guard)
    expect(typeof capturedOptions!["canUseTool"]).toBe("function");

    // permissionMode is "dontAsk" (Branch B: bypassPermissions skips canUseTool)
    expect(capturedOptions!["permissionMode"]).toBe("dontAsk");

    // allowedTools and disallowedTools are unchanged from before this change
    expect(capturedOptions!["allowedTools"]).toEqual(["Read", "Edit", "Write", "Bash", "Grep", "Glob"]);
    expect(capturedOptions!["disallowedTools"]).toEqual(["Agent", "Task"]);
  });

  it("the wired canUseTool guard denies an out-of-workspace write", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-fw-05b")));

    expect(capturedOptions).toBeDefined();
    const canUseTool = capturedOptions!["canUseTool"] as
      | ((toolName: string, input: Record<string, unknown>, opts: Record<string, unknown>) => Promise<{ behavior: string }>)
      | undefined;
    expect(typeof canUseTool).toBe("function");

    // Confirm it is the workspace guard: denies out-of-workspace Write
    const denyResult = await canUseTool!("Write", { file_path: "/etc/passwd" }, minimalOpts);
    expect(denyResult.behavior).toBe("deny");

    // And allows in-workspace Write
    const allowResult = await canUseTool!("Write", { file_path: path.join(tempDir, "out.txt") }, minimalOpts);
    expect(allowResult.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-06: step-agent queryOptions.sandbox.allowUnsandboxedCommands === false
// ---------------------------------------------------------------------------

describe("TC-FW-06: sandbox escape hatch is closed (allowUnsandboxedCommands: false)", () => {
  it("queryOptions.sandbox.allowUnsandboxedCommands is false", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-fw-06")));

    expect(capturedOptions).toBeDefined();
    const sandbox = capturedOptions!["sandbox"] as Record<string, unknown>;
    expect(sandbox).toBeDefined();
    expect(sandbox["allowUnsandboxedCommands"]).toBe(false);

    // D3: no read-restricting fields and no network restrictions
    const filesystem = sandbox["filesystem"] as Record<string, unknown>;
    expect(filesystem["denyRead"]).toBeUndefined();
    expect(filesystem["allowRead"]).toBeUndefined();
    expect(sandbox["network"]).toBeUndefined();
  });
});
