/**
 * Tests for workspace-scoped sandbox settings in ClaudeCodeRunner.
 *
 * TC-SB-01: step agent query options carry workspace-scoped sandbox (filesystem.allowWrite contains cwd)
 * TC-SB-02: autoAllowBashIfSandboxed is true and Bash is NOT in allowedTools (canUseTool fires for Bash)
 * TC-SB-03: run continues with completionReason=success and emits exactly one sandbox warn on degradation
 * TC-SB-04: once-latch holds — warning emitted only once even when degradation signal fires multiple times
 * TC-037: allowedTools does not contain "Bash" (Bash is routed through canUseTool)
 * TC-038: agent step query options permissionMode is "default"
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner, isSandboxUnavailableWarning } from "../agent-runner.js";
import type { QueryFn } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-scope-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures (same pattern as TC-AR-01 in agent-redirect-integration.test.ts)
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

/** A minimal success result message matching the SDK shape. */
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

// ---------------------------------------------------------------------------
// TC-SB-01: sandbox settings are present and workspace-scoped
// ---------------------------------------------------------------------------

describe("TC-SB-01: sandbox settings in step-agent query options", () => {
  it("queryOptions.sandbox.enabled is true, failIfUnavailable is false, and allowWrite contains cwd", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-sb-01")));

    expect(capturedOptions).toBeDefined();
    const sandbox = capturedOptions!["sandbox"] as Record<string, unknown>;
    expect(sandbox).toBeDefined();
    expect(sandbox["enabled"]).toBe(true);
    expect(sandbox["failIfUnavailable"]).toBe(false);

    const filesystem = sandbox["filesystem"] as Record<string, unknown>;
    expect(filesystem).toBeDefined();
    const allowWrite = filesystem["allowWrite"] as string[];
    expect(allowWrite).toContain(tempDir);

    // D3: no read-restricting fields
    expect(filesystem["denyRead"]).toBeUndefined();
    expect(filesystem["allowRead"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-SB-02: Bash is NOT in allowedTools (canUseTool fires for Bash git calls)
// ---------------------------------------------------------------------------

describe("TC-SB-02: Bash is NOT in allowedTools — canUseTool fires for Bash", () => {
  it("autoAllowBashIfSandboxed is true and allowedTools does NOT contain Bash", async () => {
    // permission-layer-git-write-denial D1: Bash removed from allowedTools so
    // canUseTool fires for Bash calls. The guard's Bash branch enforces git mutation deny.
    // Read, Grep, Glob remain pre-approved.
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-sb-02")));

    expect(capturedOptions).toBeDefined();
    const sandbox = capturedOptions!["sandbox"] as Record<string, unknown>;
    // autoAllowBashIfSandboxed remains true so sandboxed Bash can execute once guard allows it
    expect(sandbox["autoAllowBashIfSandboxed"]).toBe(true);
    // Bash is NOT pre-approved — canUseTool must fire for git mutation classification
    expect((capturedOptions!["allowedTools"] as string[])).not.toContain("Bash");
  });
});

// ---------------------------------------------------------------------------
// TC-SB-03: fail-open continuation and single warning on degradation
// ---------------------------------------------------------------------------

describe("TC-SB-03: degraded run continues and warns exactly once", () => {
  it("completionReason is success and exactly one [specrunner] warn: sandbox line is emitted", async () => {
    const stderrCalls: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((data: unknown) => {
      stderrCalls.push(String(data));
      return true;
    });

    try {
      const queryFn: QueryFn = async function* (params) {
        // Simulate SDK emitting a sandbox-unavailable warning via the stderr callback
        const stderrCb = (params.options as Record<string, unknown>)["stderr"] as
          | ((data: string) => void)
          | undefined;
        if (stderrCb) {
          stderrCb("Warning: sandbox is unavailable on this platform, running unsandboxed\n");
        }
        yield makeSuccessResult() as unknown;
      };

      const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
      const result = await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-sb-03")));

      // Run continues — no new error path from degradation
      expect(result.completionReason).toBe("success");

      // Exactly one [specrunner] warn: line about sandbox degradation
      const warnLines = stderrCalls.filter(
        (d) => d.includes("[specrunner] warn:") && d.toLowerCase().includes("sandbox"),
      );
      expect(warnLines).toHaveLength(1);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-SB-04: once-latch holds across repeated degradation signals
// ---------------------------------------------------------------------------

describe("TC-SB-04: warning is emitted only once even with repeated degradation signals", () => {
  it("two degradation signals in the same run produce exactly one warning", async () => {
    const stderrCalls: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((data: unknown) => {
      stderrCalls.push(String(data));
      return true;
    });

    try {
      const queryFn: QueryFn = async function* (params) {
        const stderrCb = (params.options as Record<string, unknown>)["stderr"] as
          | ((data: string) => void)
          | undefined;
        if (stderrCb) {
          // Fire the degradation signal twice in the same query turn
          stderrCb("Warning: sandbox unavailable, running without sandbox\n");
          stderrCb("Warning: sandbox unavailable, running without sandbox\n");
        }
        yield makeSuccessResult() as unknown;
      };

      const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
      const result = await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-sb-04")));

      expect(result.completionReason).toBe("success");

      // Once-latch: despite two signals, exactly one warning
      const warnLines = stderrCalls.filter(
        (d) => d.includes("[specrunner] warn:") && d.toLowerCase().includes("sandbox"),
      );
      expect(warnLines).toHaveLength(1);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-037: allowedTools does not contain "Bash"
// ---------------------------------------------------------------------------

describe("TC-037: allowedTools に Bash が含まれない", () => {
  it("allowedTools does not contain 'Bash' — canUseTool must fire for Bash git calls", async () => {
    // permission-layer-git-write-denial D1 / request TC-037 (must):
    // Bash must NOT be on allowedTools so canUseTool fires and the guard's Bash branch
    // can deny git state-mutation commands. Any implementation that re-adds "Bash" to
    // allowedTools will cause this test to fail (breakage confirmation for TC-060).
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-037")));

    expect(capturedOptions).toBeDefined();
    const allowedTools = capturedOptions!["allowedTools"] as string[];
    expect(allowedTools).not.toContain("Bash");
  });

  it("allowedTools still contains Read, Grep, Glob (pre-approved non-mutation tools)", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-037b")));

    expect(capturedOptions).toBeDefined();
    const allowedTools = capturedOptions!["allowedTools"] as string[];
    expect(allowedTools).toContain("Read");
    expect(allowedTools).toContain("Grep");
    expect(allowedTools).toContain("Glob");
    // Edit and Write must also be absent (pre-existing requirement)
    expect(allowedTools).not.toContain("Edit");
    expect(allowedTools).not.toContain("Write");
  });
});

// ---------------------------------------------------------------------------
// TC-038: permissionMode is "default"
// ---------------------------------------------------------------------------

describe("TC-038: agent step query options の permissionMode が 'default' である", () => {
  it("permissionMode is 'default' — prerequisite for canUseTool to fire for unlisted tools", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield makeSuccessResult() as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    await runner.run(makeCtx(makeAgentStep(), makeJobState("tc-038")));

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!["permissionMode"]).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// isSandboxUnavailableWarning predicate unit tests
// ---------------------------------------------------------------------------

describe("isSandboxUnavailableWarning predicate", () => {
  it("returns true for representative sandbox-unavailable lines", () => {
    expect(isSandboxUnavailableWarning("sandbox is unavailable on this platform")).toBe(true);
    expect(isSandboxUnavailableWarning("Warning: sandbox not supported")).toBe(true);
    expect(isSandboxUnavailableWarning("sandbox dependencies missing")).toBe(true);
    expect(isSandboxUnavailableWarning("falling back to unsandboxed execution")).toBe(true);
    expect(isSandboxUnavailableWarning("running unsandboxed")).toBe(true);
    expect(isSandboxUnavailableWarning("Sandbox failed to start")).toBe(true);
    expect(isSandboxUnavailableWarning("sandbox disabled")).toBe(true);
    expect(isSandboxUnavailableWarning("Sandbox: cannot initialize")).toBe(true);
  });

  it("returns false for unrelated stderr lines", () => {
    expect(isSandboxUnavailableWarning("")).toBe(false);
    expect(isSandboxUnavailableWarning("Running agent for step implementer")).toBe(false);
    expect(isSandboxUnavailableWarning("Warning: git stash failed")).toBe(false);
    expect(isSandboxUnavailableWarning("Error: file not found")).toBe(false);
    expect(isSandboxUnavailableWarning("API timeout after 30000ms")).toBe(false);
  });
});
