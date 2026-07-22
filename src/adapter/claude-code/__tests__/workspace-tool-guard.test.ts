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
import type { QueryFn, CreateMcpServerFn } from "../agent-runner.js";
import type { AgentRunContext, AgentWriteScope } from "../../../core/port/agent-runner.js";
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
  it("allows Bash with a read-only git command (mutations are denied by the classifier branch)", async () => {
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

describe("allow results carry updatedInput (SDK Zod schema requires it)", () => {
  // Measured 2026-07-11: the SDK validates the permission result against a union whose
  // allow branch REQUIRES updatedInput as a record. A bare { behavior: "allow" } fails
  // with "Tool permission request failed: ZodError" and the tool call is rejected —
  // i.e. in-workspace writes would be effectively denied. These tests freeze the
  // pass-through contract: allow must return the original input as updatedInput.
  it("in-workspace Write: updatedInput equals the original input", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { file_path: path.join(tempDir, "a.txt"), content: "x" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("non-guarded tool (Bash): updatedInput equals the original input", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "bun run test" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("malformed file_path (missing): updatedInput equals the original input", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = {};
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("deny result carries no updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Write", { file_path: "/etc/evil.txt" }, stubOptions);
    expect(result.behavior).toBe("deny");
    expect("updatedInput" in result).toBe(false);
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

// ---------------------------------------------------------------------------
// Helpers for scope-aware guard tests (TC-011..TC-036)
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-slug";

/**
 * Build a scoped AgentWriteScope for the given declared write paths.
 * Mirrors what buildStepContext produces for a scoped step (e.g. spec-review).
 */
function makeScopedScope(declaredRelPaths: string[]): AgentWriteScope {
  return {
    stepName: "spec-review",
    slug: TEST_SLUG,
    declaredWritePaths: declaredRelPaths,
    stagingMode: "scoped",
    managedPaths: [
      `specrunner/changes/${TEST_SLUG}/state.json`,
      `specrunner/changes/${TEST_SLUG}/events.jsonl`,
      `specrunner/changes/${TEST_SLUG}/usage.json`,
      `specrunner/changes/${TEST_SLUG}/bite-evidence-result.md`,
    ],
    forbiddenPaths: [], // unused in scoped mode
  };
}

/** All protected canon paths for TEST_SLUG (mirrors protectedCanonPaths). */
const CANON_PATHS = [
  `specrunner/changes/${TEST_SLUG}/request.md`,
  `specrunner/changes/${TEST_SLUG}/spec.md`,
  `specrunner/changes/${TEST_SLUG}/design.md`,
  `specrunner/changes/${TEST_SLUG}/tasks.md`,
  `specrunner/changes/${TEST_SLUG}/test-cases.md`,
  `specrunner/changes/${TEST_SLUG}/request-review-attestation.json`,
];

/**
 * Build a guarded AgentWriteScope for the given declared write paths.
 * Mirrors what buildStepContext produces for a guarded step (e.g. implementer).
 */
function makeGuardedScope(declaredRelPaths: string[]): AgentWriteScope {
  const declared = new Set(declaredRelPaths);
  return {
    stepName: "implementer",
    slug: TEST_SLUG,
    declaredWritePaths: declaredRelPaths,
    stagingMode: "guarded",
    managedPaths: [
      `specrunner/changes/${TEST_SLUG}/state.json`,
      `specrunner/changes/${TEST_SLUG}/events.jsonl`,
      `specrunner/changes/${TEST_SLUG}/usage.json`,
      `specrunner/changes/${TEST_SLUG}/bite-evidence-result.md`,
    ],
    forbiddenPaths: CANON_PATHS.filter((p) => !declared.has(p)),
  };
}

// ---------------------------------------------------------------------------
// TC-011: guard が状態変更 git の Bash call を deny する
// ---------------------------------------------------------------------------

describe("TC-011: guard が状態変更 git の Bash call を deny する", () => {
  it("denies 'git commit -m x'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git commit -m x" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'git push origin main'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git push origin main" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'git add .'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git add ." }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'git reset --hard HEAD'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git reset --hard HEAD" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'git checkout main'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git checkout main" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'git merge feature'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git merge feature" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'git rebase main'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git rebase main" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'git stash' (bare — mutation)", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git stash" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-012: deny message が「commit は pipeline が合成する」と「読み取り系は許可」を含む
// ---------------------------------------------------------------------------

describe("TC-012: deny message が commit は pipeline が合成する と 読み取り系は許可 を含む", () => {
  it("deny message mentions pipeline synthesis and read-only git permission", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git commit -m msg" }, stubOptions);
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      // Message must mention that commit is done by the pipeline
      expect(result.message).toMatch(/pipeline/i);
      // Message must mention that read-only git is allowed
      expect(result.message).toMatch(/読み取り|read/i);
    }
  });

  it("deny message contains the denied command (truncated to 60 chars)", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git push origin main" }, stubOptions);
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("git push origin main");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-013: guard が読み取り git の Bash call を allow し updatedInput を返す
// ---------------------------------------------------------------------------

describe("TC-013: guard が読み取り git の Bash call を allow し updatedInput を返す", () => {
  it("allows 'git status' and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "git status" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows 'git diff HEAD' and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "git diff HEAD" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows 'git log --oneline' and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "git log --oneline" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows 'git stash list' (read sub-action) and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "git stash list" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });
});

// ---------------------------------------------------------------------------
// TC-014: guard が非 git の Bash call を allow し updatedInput を返す
// ---------------------------------------------------------------------------

describe("TC-014: guard が非 git の Bash call を allow し updatedInput を返す", () => {
  it("allows 'bun test' and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "bun test" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows 'echo hello' and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "echo hello" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows 'bun run typecheck' and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "bun run typecheck" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows Bash with non-string command and returns updatedInput", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: 42 };
    const result = await guard("Bash", input as Record<string, unknown>, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });
});

// ---------------------------------------------------------------------------
// TC-015: guard が mutation セグメントを含む複合コマンドを deny する
// ---------------------------------------------------------------------------

describe("TC-015: guard が mutation セグメントを含む複合コマンドを deny する", () => {
  it("denies 'git status && git commit -m x'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git status && git commit -m x" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'bun test; git push'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "bun test; git push" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies 'echo ok | git add -A'", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "echo ok | git add -A" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-017: state.json への Write が deny される
// ---------------------------------------------------------------------------

describe("TC-017: state.json への Write が deny される", () => {
  it("denies Write to state.json (pipeline-managed path)", async () => {
    const scope = makeScopedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const stateJsonPath = `specrunner/changes/${TEST_SLUG}/state.json`;
    const result = await guard("Write", { file_path: stateJsonPath }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("deny message mentions pipeline-managed path", async () => {
    const scope = makeScopedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: `specrunner/changes/${TEST_SLUG}/state.json` }, stubOptions);
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message.toLowerCase()).toMatch(/pipeline|state\.json/);
    }
  });

  it("denies Write to state.json from guarded step as well", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: `specrunner/changes/${TEST_SLUG}/state.json` }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-018: .specrunner 配下への Write が deny される
// ---------------------------------------------------------------------------

describe("TC-018: .specrunner 配下への Write が deny される", () => {
  it("denies Write to .specrunner/local/config.json", async () => {
    const scope = makeScopedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: ".specrunner/local/config.json" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies Write directly to .specrunner (top-level)", async () => {
    const scope = makeScopedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: ".specrunner" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies Edit to .specrunner/marker.txt", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Edit", { file_path: ".specrunner/marker.txt" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-022: scoped step で宣言外 Write が deny される
// ---------------------------------------------------------------------------

describe("TC-022: scoped step で宣言外 Write が deny される", () => {
  it("denies Write to src/foo.ts when not in declaredWritePaths", async () => {
    const declared = [`specrunner/changes/${TEST_SLUG}/spec-review-result-001.md`];
    const scope = makeScopedScope(declared);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: "src/foo.ts" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("denies Write to any path outside declaredWritePaths in scoped mode", async () => {
    const declared = [`specrunner/changes/${TEST_SLUG}/spec-review-result-001.md`];
    const scope = makeScopedScope(declared);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: "README.md" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("deny message for scoped undeclared write mentions declared paths", async () => {
    const declared = [`specrunner/changes/${TEST_SLUG}/spec-review-result-001.md`];
    const scope = makeScopedScope(declared);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: "src/undeclared.ts" }, stubOptions);
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      // Message should mention scoped mode and what is allowed
      expect(result.message.toLowerCase()).toMatch(/scoped|declared/);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-023: scoped step で宣言外 Edit が deny される
// ---------------------------------------------------------------------------

describe("TC-023: scoped step で宣言外 Edit が deny される", () => {
  it("denies Edit to src/agent-runner.ts when not in declaredWritePaths", async () => {
    const declared = [`specrunner/changes/${TEST_SLUG}/spec-review-result-001.md`];
    const scope = makeScopedScope(declared);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Edit", { file_path: "src/agent-runner.ts" }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-025: scoped step で宣言内 Write が allow され updatedInput を返す
// ---------------------------------------------------------------------------

describe("TC-025: scoped step で宣言内 Write が allow され updatedInput を返す", () => {
  it("allows Write to a declared path and returns updatedInput", async () => {
    const declaredPath = `specrunner/changes/${TEST_SLUG}/spec-review-result-001.md`;
    const scope = makeScopedScope([declaredPath]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: declaredPath, content: "review result" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });
});

// ---------------------------------------------------------------------------
// TC-026: scoped step で宣言内 Edit が allow され updatedInput を返す
// ---------------------------------------------------------------------------

describe("TC-026: scoped step で宣言内 Edit が allow され updatedInput を返す", () => {
  it("allows Edit to a declared path and returns updatedInput", async () => {
    const declaredPath = `specrunner/changes/${TEST_SLUG}/spec-review-result-001.md`;
    const scope = makeScopedScope([declaredPath]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: declaredPath, old_string: "old", new_string: "new" };
    const result = await guard("Edit", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });
});

// ---------------------------------------------------------------------------
// TC-027: guarded step で宣言していない保護正典（design.md 等）への Write が deny される
// ---------------------------------------------------------------------------

describe("TC-027: guarded step で宣言していない保護正典への Write が deny される", () => {
  it("denies Write to design.md (protected canon) when not declared", async () => {
    const scope = makeGuardedScope([]); // no declarations → all canon paths are forbidden
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: `specrunner/changes/${TEST_SLUG}/design.md` }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("deny message for guarded protected canon write mentions protected canon", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: `specrunner/changes/${TEST_SLUG}/design.md` }, stubOptions);
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message.toLowerCase()).toMatch(/protect|canon|guarded|forbidden/);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-028: guarded step で spec.md / tasks.md / test-cases.md / request.md / attestation への Write が deny される
// ---------------------------------------------------------------------------

describe("TC-028: guarded step で各保護正典への Write が deny される", () => {
  const canonPaths = [
    `specrunner/changes/${TEST_SLUG}/request.md`,
    `specrunner/changes/${TEST_SLUG}/spec.md`,
    `specrunner/changes/${TEST_SLUG}/tasks.md`,
    `specrunner/changes/${TEST_SLUG}/test-cases.md`,
    `specrunner/changes/${TEST_SLUG}/request-review-attestation.json`,
  ];

  for (const canonPath of canonPaths) {
    it(`denies Write to ${canonPath}`, async () => {
      const scope = makeGuardedScope([]);
      const guard = createWorkspaceToolGuard(tempDir, scope);
      const result = await guard("Write", { file_path: canonPath }, stubOptions);
      expect(result.behavior).toBe("deny");
    });
  }
});

// ---------------------------------------------------------------------------
// TC-029: guarded step で保護正典以外の worktree パスへの Write が allow される
// ---------------------------------------------------------------------------

describe("TC-029: guarded step で保護正典以外の worktree パスへの Write が allow される", () => {
  it("allows Write to src/foo.ts (not in forbiddenPaths)", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: "src/foo.ts", content: "code" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows Write to tests/foo.test.ts", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: "tests/foo.test.ts", content: "test" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows Edit to src/util/helper.ts", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: "src/util/helper.ts", old_string: "old", new_string: "new" };
    const result = await guard("Edit", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });
});

// ---------------------------------------------------------------------------
// TC-033: allow 結果に updatedInput が含まれ元 input と同一である (scope-aware paths)
// ---------------------------------------------------------------------------

describe("TC-033: allow 結果に updatedInput が含まれ元 input と同一である（scope-aware パス）", () => {
  it("scoped declared Write: updatedInput equals original input", async () => {
    const declaredPath = `specrunner/changes/${TEST_SLUG}/spec-review-result-001.md`;
    const scope = makeScopedScope([declaredPath]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: declaredPath, content: "result content" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("guarded non-protected Write (src/): updatedInput equals original input", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: "src/new-feature.ts", content: "export const x = 1;" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("read-only git Bash: updatedInput equals original input", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "git log --oneline -5" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("non-git Bash (bun test): updatedInput equals original input", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const input = { command: "bun run test" };
    const result = await guard("Bash", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("deny result carries no updatedInput (TC-034)", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git commit -m x" }, stubOptions);
    expect(result.behavior).toBe("deny");
    expect("updatedInput" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-019: events.jsonl / usage.json / bite-evidence-result.md への Write が deny される
// ---------------------------------------------------------------------------

describe("TC-019: events.jsonl / usage.json / bite-evidence-result.md への Write が deny される", () => {
  const managedPaths = [
    `specrunner/changes/${TEST_SLUG}/events.jsonl`,
    `specrunner/changes/${TEST_SLUG}/usage.json`,
    `specrunner/changes/${TEST_SLUG}/bite-evidence-result.md`,
  ];

  for (const managedPath of managedPaths) {
    it(`denies Write to ${managedPath} (pipeline-managed)`, async () => {
      const scope = makeScopedScope([]);
      const guard = createWorkspaceToolGuard(tempDir, scope);
      const result = await guard("Write", { file_path: managedPath }, stubOptions);
      expect(result.behavior).toBe("deny");
    });
  }
});

// ---------------------------------------------------------------------------
// TC-021: pipeline 管理パス deny が scoped step と guarded step の両方で適用される
// ---------------------------------------------------------------------------

describe("TC-021: pipeline 管理パス deny が scoped step と guarded step の両方で適用される", () => {
  const stateJsonPath = `specrunner/changes/${TEST_SLUG}/state.json`;

  it("scoped step denies Write to state.json", async () => {
    const scope = makeScopedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: stateJsonPath }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("guarded step denies Write to state.json", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: stateJsonPath }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("scoped step denies Write to events.jsonl", async () => {
    const scope = makeScopedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: `specrunner/changes/${TEST_SLUG}/events.jsonl` }, stubOptions);
    expect(result.behavior).toBe("deny");
  });

  it("guarded step denies Write to events.jsonl", async () => {
    const scope = makeGuardedScope([]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const result = await guard("Write", { file_path: `specrunner/changes/${TEST_SLUG}/events.jsonl` }, stubOptions);
    expect(result.behavior).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// TC-030: guarded step が宣言した保護正典パスへの Write は allow される
// ---------------------------------------------------------------------------

describe("TC-030: guarded step が宣言した保護正典パスへの Write は allow される", () => {
  it("allows Write to design.md when declared as output", async () => {
    const designMdPath = `specrunner/changes/${TEST_SLUG}/design.md`;
    const scope = makeGuardedScope([designMdPath]); // design.md is declared → not in forbiddenPaths
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: designMdPath, content: "# Design" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("allows Write to spec.md when declared as output", async () => {
    const specMdPath = `specrunner/changes/${TEST_SLUG}/spec.md`;
    const scope = makeGuardedScope([specMdPath]);
    const guard = createWorkspaceToolGuard(tempDir, scope);
    const input = { file_path: specMdPath, content: "# Spec" };
    const result = await guard("Write", input, stubOptions);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  it("denies Write to undeclared canon (tasks.md) while declared canon (design.md) is allowed", async () => {
    const designMdPath = `specrunner/changes/${TEST_SLUG}/design.md`;
    const tasksMdPath = `specrunner/changes/${TEST_SLUG}/tasks.md`;
    // Only design.md declared — tasks.md stays in forbiddenPaths
    const scope = makeGuardedScope([designMdPath]);
    const guard = createWorkspaceToolGuard(tempDir, scope);

    const allowResult = await guard("Write", { file_path: designMdPath }, stubOptions);
    expect(allowResult.behavior).toBe("allow");

    const denyResult = await guard("Write", { file_path: tasksMdPath }, stubOptions);
    expect(denyResult.behavior).toBe("deny");
  });
});
