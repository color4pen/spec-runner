/**
 * AgentRunner shared contract tests.
 *
 * Applies a shared suite of behavioral contracts to all local AgentRunner adapters.
 * New adapters with agent-runner.ts must be added to REGISTERED_LOCAL_RUNNERS or the
 * registration completeness test will fail.
 *
 * Contracts tested per adapter:
 *   C1 — resumePrompt:     main-turn prompt contains <resume-context> block
 *   C2 — reportTool:       toolResult is non-null and ok=true when agent reports
 *   C3 — transient retry:  retries on ECONNREFUSED, emits step:retry
 *   C4 — logPath:          JSONL file created at logPath with ≥1 parseable line
 *   C5 — postWorkPrompts:  SDK invoked ≥ 1+N times for N postWorkPrompts
 */

import * as path from "node:path";
import * as url from "node:url";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { boolean } from "zod/v4-mini";
import { ClaudeCodeRunner } from "../../../src/adapter/claude-code/agent-runner.js";
import type { QueryFn, CreateMcpServerFn } from "../../../src/adapter/claude-code/agent-runner.js";
import { CodexAgentRunner } from "../../../src/adapter/codex/agent-runner.js";
import type { CodexThread, CodexInstance } from "../../../src/adapter/codex/agent-runner.js";
import type {
  AgentRunner,
  AgentRunContext,
  AgentRunSession,
  AgentRunPolicy,
} from "../../../src/core/port/agent-runner.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { ReportToolSpec } from "../../../src/core/port/report-result.js";

// ---------------------------------------------------------------------------
// Root path (for registration completeness test)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FixtureOpts {
  tempDir: string;
  sleepFn: (ms: number) => Promise<void>;
}

export interface RunnerFixture {
  name: string;
  makeCapturingPrompt(opts: FixtureOpts): {
    runner: AgentRunner;
    getCapturedMainTurnPrompt(): string | undefined;
  };
  makeMinimalRunner(opts: FixtureOpts): AgentRunner;
  makeWithReportToolSuccess(opts: FixtureOpts): AgentRunner;
  makeWithTransientError(opts: FixtureOpts): AgentRunner;
  makeCountingInvocations(opts: FixtureOpts): {
    runner: AgentRunner;
    getCallCount(): number;
  };
}

// ---------------------------------------------------------------------------
// Shared report tool spec used by contract 2 (reportTool)
// ---------------------------------------------------------------------------

const REPORT_TOOL: ReportToolSpec = {
  name: "report_result",
  description: "Report completion",
  zodSchema: { ok: boolean() },
  parseInput: (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false as const, missingFields: ["ok"], rawInput: raw };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj["ok"] !== "boolean") {
      return { ok: false as const, missingFields: ["ok"], rawInput: raw };
    }
    return { ok: true as const, value: { ok: obj["ok"] as boolean } };
  },
};

// ---------------------------------------------------------------------------
// ClaudeCodeRunner helpers
// ---------------------------------------------------------------------------

/** Yield a minimal successful SDK result. */
async function* claudeSuccessStream(): AsyncGenerator<unknown, void> {
  yield {
    type: "result",
    subtype: "success",
    result: "",
    session_id: "test-session",
    modelUsage: {},
  };
}

/**
 * Create a mock `createSdkMcpServer` function that captures the tool handler
 * registered by ClaudeCodeRunner so the queryFn can call it directly.
 */
function makeMockCreateMcpServerFn(): {
  createMcpServerFn: CreateMcpServerFn;
  getHandler: () => ((args: unknown) => Promise<unknown>) | null;
} {
  let capturedHandler: ((args: unknown) => Promise<unknown>) | null = null;
  const createMcpServerFn: CreateMcpServerFn = (params: Record<string, unknown>) => {
    const tools = params["tools"] as
      | Array<{ handler: (args: unknown) => Promise<unknown> }>
      | undefined;
    if (tools?.[0]) {
      capturedHandler = tools[0].handler;
    }
    return {};
  };
  return {
    createMcpServerFn,
    getHandler: () => capturedHandler,
  };
}

// ---------------------------------------------------------------------------
// Codex helpers
// ---------------------------------------------------------------------------

function _makeSuccessCodexThread(): CodexThread {
  return {
    id: "mock-thread-id",
    runStreamed: async (_prompt: string, _opts?: unknown) => {
      async function* generate() {
        yield { type: "item.completed", item: { type: "agent_message", text: "" } };
        yield { type: "turn.completed" };
      }
      return { events: generate() };
    },
  };
}

function makeCodexInstance(thread: CodexThread): CodexInstance {
  return {
    startThread: (_opts) => thread,
    resumeThread: (_threadId) => thread,
  };
}

// ---------------------------------------------------------------------------
// claudeCodeFixture
// ---------------------------------------------------------------------------

const claudeCodeFixture: RunnerFixture = {
  name: "claude-code",

  makeCapturingPrompt(opts) {
    let capturedPrompt: string | undefined;
    const queryFn: QueryFn = async function* (params) {
      capturedPrompt = params.prompt as string;
      yield* claudeSuccessStream();
    };
    const runner = new ClaudeCodeRunner({
      cwd: opts.tempDir,
      _queryFn: queryFn,
      _sleepFn: opts.sleepFn,
    });
    return {
      runner,
      getCapturedMainTurnPrompt: () => capturedPrompt,
    };
  },

  makeMinimalRunner(opts) {
    const queryFn: QueryFn = async function* (_params) {
      yield* claudeSuccessStream();
    };
    return new ClaudeCodeRunner({
      cwd: opts.tempDir,
      _queryFn: queryFn,
      _sleepFn: opts.sleepFn,
    });
  },

  makeWithReportToolSuccess(opts) {
    const { createMcpServerFn, getHandler } = makeMockCreateMcpServerFn();
    const queryFn: QueryFn = async function* (_params) {
      // ClaudeCodeRunner registers the handler before calling queryFn,
      // so getHandler() is non-null by this point.
      const handler = getHandler();
      if (handler) await handler({ ok: true });
      yield* claudeSuccessStream();
    };
    return new ClaudeCodeRunner({
      cwd: opts.tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
      _sleepFn: opts.sleepFn,
    });
  },

  makeWithTransientError(opts) {
    let callCount = 0;
    const queryFn: QueryFn = async function* (_params) {
      callCount++;
      if (callCount === 1) throw new Error("ECONNREFUSED");
      yield* claudeSuccessStream();
    };
    return new ClaudeCodeRunner({
      cwd: opts.tempDir,
      _queryFn: queryFn,
      _sleepFn: opts.sleepFn,
    });
  },

  makeCountingInvocations(opts) {
    let callCount = 0;
    const queryFn: QueryFn = async function* (_params) {
      callCount++;
      yield* claudeSuccessStream();
    };
    const runner = new ClaudeCodeRunner({
      cwd: opts.tempDir,
      _queryFn: queryFn,
      _sleepFn: opts.sleepFn,
    });
    return { runner, getCallCount: () => callCount };
  },
};

// ---------------------------------------------------------------------------
// codexFixture
// ---------------------------------------------------------------------------

const codexFixture: RunnerFixture = {
  name: "codex",

  makeCapturingPrompt(opts) {
    let capturedPrompt: string | undefined;
    const thread: CodexThread = {
      id: "mock-thread-id",
      runStreamed: async (prompt: string, _opts?: unknown) => {
        if (capturedPrompt === undefined) capturedPrompt = prompt;
        async function* generate() {
          yield { type: "item.completed", item: { type: "agent_message", text: "" } };
          yield { type: "turn.completed" };
        }
        return { events: generate() };
      },
    };
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeCodexInstance(thread),
      _sleepFn: opts.sleepFn,
    });
    return {
      runner,
      getCapturedMainTurnPrompt: () => capturedPrompt,
    };
  },

  makeMinimalRunner(opts) {
    const thread = _makeSuccessCodexThread();
    return new CodexAgentRunner({
      _codexFactory: () => makeCodexInstance(thread),
      _sleepFn: opts.sleepFn,
    });
  },

  makeWithReportToolSuccess(opts) {
    // CodexAgentRunner parses the agent_message text as the completion report JSON.
    const thread: CodexThread = {
      id: "mock-thread-id",
      runStreamed: async (_prompt: string, _opts?: unknown) => {
        async function* generate() {
          yield {
            type: "item.completed",
            item: { type: "agent_message", text: '{"ok":true}' },
          };
          yield { type: "turn.completed" };
        }
        return { events: generate() };
      },
    };
    return new CodexAgentRunner({
      _codexFactory: () => makeCodexInstance(thread),
      _sleepFn: opts.sleepFn,
    });
  },

  makeWithTransientError(opts) {
    let callCount = 0;
    const thread: CodexThread = {
      id: "mock-thread-id",
      runStreamed: async (_prompt: string, _opts?: unknown) => {
        callCount++;
        if (callCount === 1) throw new Error("ECONNREFUSED");
        async function* generate() {
          yield { type: "item.completed", item: { type: "agent_message", text: "" } };
          yield { type: "turn.completed" };
        }
        return { events: generate() };
      },
    };
    return new CodexAgentRunner({
      _codexFactory: () => makeCodexInstance(thread),
      _sleepFn: opts.sleepFn,
    });
  },

  makeCountingInvocations(opts) {
    let callCount = 0;
    const thread: CodexThread = {
      id: "mock-thread-id",
      runStreamed: async (_prompt: string, _opts?: unknown) => {
        callCount++;
        async function* generate() {
          yield { type: "item.completed", item: { type: "agent_message", text: "" } };
          yield { type: "turn.completed" };
        }
        return { events: generate() };
      },
    };
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeCodexInstance(thread),
      _sleepFn: opts.sleepFn,
    });
    return { runner, getCallCount: () => callCount };
  },
};

// ---------------------------------------------------------------------------
// Registered local runners
// New local adapters with agent-runner.ts must be added here.
// ---------------------------------------------------------------------------

const REGISTERED_LOCAL_RUNNERS: Record<string, RunnerFixture> = {
  "claude-code": claudeCodeFixture,
  "codex": codexFixture,
};

// ---------------------------------------------------------------------------
// Shared context builder
// ---------------------------------------------------------------------------

function makeMinCtx(overrides: {
  tempDir: string;
  session?: AgentRunSession;
  policy?: AgentRunPolicy;
  config?: SpecRunnerConfig;
  emit?: AgentRunContext["emit"];
}): AgentRunContext {
  const step: AgentStep = {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-6",
      system: "implement",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "test",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };

  const state: JobState = {
    version: 2,
    jobId: "contract-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };

  return {
    step,
    state,
    branch: "feat/test",
    slug: "test-slug",
    cwd: overrides.tempDir,
    config: overrides.config ?? { version: 1, runtime: "local", agents: {} },
    input: { requestContent: "test request" },
    session: overrides.session ?? {},
    policy: overrides.policy ?? {},
    emit: overrides.emit ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// tempDir lifecycle
// ---------------------------------------------------------------------------

let tempDir: string;
const sleepFn = async (_ms: number): Promise<void> => {};

beforeEach(async () => {
  tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "contract-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fsp.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Registration completeness test
// ---------------------------------------------------------------------------

describe("AgentRunner contract suite — registration completeness", () => {
  it("all local adapter directories with agent-runner.ts are registered", () => {
    const NON_LOCAL_DIRS = new Set(["managed-agent", "github", "shared", "dispatching"]);
    const adapterRoot = path.resolve(ROOT, "src/adapter");
    const dirs = fs
      .readdirSync(adapterRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !NON_LOCAL_DIRS.has(d.name))
      .filter((d) => fs.existsSync(path.join(adapterRoot, d.name, "agent-runner.ts")))
      .map((d) => d.name);
    for (const dir of dirs) {
      expect(
        Object.keys(REGISTERED_LOCAL_RUNNERS),
        `${dir} must be in REGISTERED_LOCAL_RUNNERS`,
      ).toContain(dir);
    }
  });

  it("managed-agent is not present in REGISTERED_LOCAL_RUNNERS", () => {
    expect(Object.keys(REGISTERED_LOCAL_RUNNERS)).not.toContain("managed-agent");
  });
});

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

function describeAgentRunnerContracts(fixture: RunnerFixture): void {
  describe(`AgentRunner contract [${fixture.name}] — resumePrompt`, () => {
    it("main-turn prompt contains <resume-context> when resumePrompt is set", async () => {
      const { runner, getCapturedMainTurnPrompt } = fixture.makeCapturingPrompt({
        tempDir,
        sleepFn,
      });
      const ctx = makeMinCtx({ tempDir, session: { resumePrompt: "extra context" } });
      await runner.run(ctx);
      const prompt = getCapturedMainTurnPrompt();
      expect(prompt).toContain("<resume-context>");
      expect(prompt).toContain("extra context");
    });
  });

  describe(`AgentRunner contract [${fixture.name}] — reportTool`, () => {
    it("result.toolResult is non-null and ok=true when agent reports", async () => {
      const runner = fixture.makeWithReportToolSuccess({ tempDir, sleepFn });
      const ctx = makeMinCtx({ tempDir, policy: { reportTool: REPORT_TOOL } });
      const result = await runner.run(ctx);
      expect(result.toolResult).not.toBeNull();
      expect(result.toolResult!.ok).toBe(true);
    });
  });

  describe(`AgentRunner contract [${fixture.name}] — transient retry`, () => {
    it("retries on ECONNREFUSED, emits step:retry, returns transientRetryAttempts >= 1", async () => {
      const runner = fixture.makeWithTransientError({ tempDir, sleepFn });
      const emittedEvents: string[] = [];
      const ctx = makeMinCtx({
        tempDir,
        config: {
          version: 1,
          runtime: "local" as const,
          agents: {},
          transientRetry: { maxRetries: 1 },
        },
        emit: (event) => {
          emittedEvents.push(event);
        },
      });
      const result = await runner.run(ctx);
      expect(result.completionReason).toBe("success");
      expect(result.transientRetryAttempts).toBeGreaterThanOrEqual(1);
      expect(emittedEvents).toContain("step:retry");
    });
  });

  describe(`AgentRunner contract [${fixture.name}] — logPath`, () => {
    it("creates JSONL file at logPath and writes at least one line", async () => {
      const logPath = path.join(tempDir, "agent-session.jsonl");
      const runner = fixture.makeMinimalRunner({ tempDir, sleepFn });
      const ctx = makeMinCtx({ tempDir, session: { logPath } });
      await runner.run(ctx);
      expect(fs.existsSync(logPath)).toBe(true);
      const lines = (await fsp.readFile(logPath, "utf-8"))
        .split("\n")
        .filter((l) => l.trim());
      expect(lines.length).toBeGreaterThan(0);
      expect(() => JSON.parse(lines[0]!)).not.toThrow();
    });
  });

  describe(`AgentRunner contract [${fixture.name}] — postWorkPrompts`, () => {
    it("invokes SDK at least 1 + N times for N postWorkPrompts", async () => {
      const { runner, getCallCount } = fixture.makeCountingInvocations({ tempDir, sleepFn });
      const ctx = makeMinCtx({ tempDir, policy: { postWorkPrompts: ["cleanup please"] } });
      await runner.run(ctx);
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });
  });
}

// ---------------------------------------------------------------------------
// Apply contracts to all registered runners
// ---------------------------------------------------------------------------

for (const fixture of Object.values(REGISTERED_LOCAL_RUNNERS)) {
  describeAgentRunnerContracts(fixture);
}
