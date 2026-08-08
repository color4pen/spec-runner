/**
 * Integration tests verifying that buildArtifactBundle output reaches the claude-code query prompt.
 *
 * TC-013: claude-code adapter prompt includes bundled-change-artifacts when design.md exists
 * TC-014: when no artifacts exist the claude-code baseFullPrompt is byte-identical to pre-injection
 * TC-016: completion directive remains at the end of fullPrompt when artifactSection is non-empty
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../agent-runner.js";
import type { QueryFn } from "../agent-runner.js";
import { buildReportToolCompletionDirective } from "../completion-directive.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";
import type { ReportToolSpec, BaseReportResult } from "../../../core/port/report-result.js";
import { buildAdditionalInstructions } from "../../shared/prompt-builder.js";
import { string } from "zod/v4-mini";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: capture both prompt and options from the injected queryFn
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedQuery {
  prompt: string;
  options?: Record<string, unknown>;
}

/**
 * Extended capture helper: captures params.prompt (in addition to params.options).
 * Needed for TC-013/TC-014/TC-016 assertions on the assembled fullPrompt.
 */
function makeCaptureQueryFnWithPrompt(): {
  queryFn: QueryFn;
  capturedQueries: CapturedQuery[];
} {
  const capturedQueries: CapturedQuery[] = [];

  const queryFn: QueryFn = async function* (params) {
    if (typeof params.prompt === "string") {
      capturedQueries.push({
        prompt: params.prompt,
        options: params.options ? { ...params.options } : undefined,
      });
    }
    yield {
      type: "result",
      subtype: "success",
      result: "done",
      session_id: "sess-123",
    };
  };

  return { queryFn, capturedQueries };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

interface TestReportResult extends BaseReportResult {
  verdict: string;
}

const mockReportTool: ReportToolSpec<TestReportResult> = {
  name: "report_result",
  description: "Report completion",
  zodSchema: { verdict: string() },
  parseInput: (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, missingFields: ["verdict"], rawInput: raw };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj["verdict"] !== "string") {
      return { ok: false, missingFields: ["verdict"], rawInput: raw };
    }
    return { ok: true, value: { ok: true, verdict: obj["verdict"] } as TestReportResult };
  },
};

function makeJobState(slug = "test-slug"): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug },
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
  return { version: 1, runtime: "local", agents: {} };
}

const BASE_MESSAGE = "implement this";

function makeAgentStep(): AgentStep {
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
    buildMessage: () => BASE_MESSAGE,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeCtx(
  cwd: string,
  slug = "test-slug",
  extraPolicy: Partial<AgentRunContext["policy"]> = {},
): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(slug),
    branch: "feat/test",
    slug,
    cwd,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: { ...extraPolicy },
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  } as AgentRunContext;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-artifact-inject-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: claude-code adapter prompt includes bundled-change-artifacts
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-013: claude-code adapter — prompt includes bundled-change-artifacts when design.md exists", () => {
  it("first query prompt contains bundled-change-artifacts tag, path header, and file content", async () => {
    const slug = "test-slug";
    const changeDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "design.md"), "DESIGN_CONTENT");

    const { queryFn, capturedQueries } = makeCaptureQueryFnWithPrompt();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    await runner.run(makeCtx(tempDir, slug));

    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = capturedQueries[0]!.prompt;
    expect(firstPrompt).toContain("<bundled-change-artifacts>");
    expect(firstPrompt).toContain(`specrunner/changes/${slug}/design.md`);
    expect(firstPrompt).toContain("DESIGN_CONTENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-014: when no artifacts exist, claude-code baseFullPrompt is byte-identical to pre-injection
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-014: claude-code — no artifacts → baseFullPrompt is byte-identical to pre-injection formula", () => {
  it("prompt equals baseMessage + additionalInstructions when change folder is absent and no reportTool", async () => {
    // tempDir has no specrunner/changes/<slug>/ → buildArtifactBundle returns ""
    const { queryFn, capturedQueries } = makeCaptureQueryFnWithPrompt();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    // No reportTool → no firstTurnCompletionDirective; fullPrompt == baseFullPrompt
    const ctx = makeCtx(tempDir);
    await runner.run(ctx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    // artifactBundle == "" → artifactSection == "" → prompt identical to pre-injection formula
    expect(capturedQueries[0]!.prompt).toBe(`${BASE_MESSAGE}\n\n${additionalInstructions}`);
    expect(capturedQueries[0]!.prompt).not.toContain("<bundled-change-artifacts>");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: completion directive is at the end of fullPrompt even when artifactSection is non-empty
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-016: completion directive remains at the end of fullPrompt after artifactSection insertion", () => {
  it("fullPrompt ends with firstTurnCompletionDirective when artifacts exist and reportTool is set", async () => {
    const slug = "test-slug";
    const changeDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "design.md"), "DESIGN_CONTENT");

    const { queryFn, capturedQueries } = makeCaptureQueryFnWithPrompt();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    // reportTool set → firstTurnCompletionDirective is appended
    const ctx = makeCtx(tempDir, slug, { reportTool: mockReportTool });
    await runner.run(ctx);

    const REPORT_MCP_SERVER_NAME = "specrunner_report";
    const expectedDirective = buildReportToolCompletionDirective(
      `mcp__${REPORT_MCP_SERVER_NAME}__${mockReportTool.name}`,
    );

    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = capturedQueries[0]!.prompt;

    // Artifact section must be present (change folder has design.md)
    expect(firstPrompt).toContain("<bundled-change-artifacts>");

    // Completion directive must still be at the very end of fullPrompt
    expect(firstPrompt.endsWith(expectedDirective)).toBe(true);
  });
});
