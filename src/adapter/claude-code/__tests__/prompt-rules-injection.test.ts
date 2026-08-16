/**
 * Tests for rules-delivery prompt injection in claude-code adapter.
 *
 * TC-003: prompt ルールが resume context の後・completion directive の前に置かれる
 * TC-005: prompt ルールが postWorkPrompts から除外される
 * TC-019: promptRules が undefined のとき prompt が現行と同一
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
// Capture helpers
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedQuery {
  prompt: string;
  options?: Record<string, unknown>;
}

function makeCaptureQueryFn(): { queryFn: QueryFn; capturedQueries: CapturedQuery[] } {
  const capturedQueries: CapturedQuery[] = [];
  const queryFn: QueryFn = async function* (params) {
    if (typeof params.prompt === "string") {
      capturedQueries.push({ prompt: params.prompt, options: params.options ? { ...params.options } : undefined });
    }
    yield { type: "result", subtype: "success", result: "done", session_id: "sess-prompt-rules" };
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
    agent: { name: "specrunner-implementer", role: "implementer", model: "claude-sonnet-4-6", system: "implement", tools: [] },
    toolHandlers: undefined,
    buildMessage: () => BASE_MESSAGE,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeCtx(cwd: string, slug = "test-slug", extraPolicy: Partial<AgentRunContext["policy"]> = {}): AgentRunContext {
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

const SAMPLE_PROMPT_RULES = "<project-rules>\ntest rule content\n</project-rules>";
const RESUME_PROMPT = "resume context content";

let tempDir: string;
beforeEach(async () => { tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-prompt-rules-test-")); });
afterEach(async () => { await fs.rm(tempDir, { recursive: true, force: true }); });

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: prompt ルールが resume context の後・completion directive の前に置かれる
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-003: promptRules が resume context の後・completion directive の前に置かれる", () => {
  it("resume context → promptRules → completion directive の順序になる", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx = makeCtx(tempDir, "test-slug", {
      promptRules: SAMPLE_PROMPT_RULES,
      reportTool: mockReportTool,
    });
    // inject resume prompt
    (ctx.session as { resumePrompt?: string }).resumePrompt = RESUME_PROMPT;

    await runner.run(ctx);

    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = capturedQueries[0]!.prompt;

    const resumeIdx = firstPrompt.indexOf(RESUME_PROMPT);
    const rulesIdx = firstPrompt.indexOf(SAMPLE_PROMPT_RULES);
    const REPORT_MCP_SERVER_NAME = "specrunner_report";
    const directive = buildReportToolCompletionDirective(
      `mcp__${REPORT_MCP_SERVER_NAME}__${mockReportTool.name}`,
    );
    const directiveIdx = firstPrompt.indexOf(directive);

    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(resumeIdx);
    expect(directiveIdx).toBeGreaterThan(rulesIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: prompt ルールが postWorkPrompts から除外される
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-005: promptRules が postWorkPrompts から除外される", () => {
  it("promptRules 本文が main prompt に現れ、follow-up (postWorkPrompts) 経路に現れない", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const postWorkContent = "follow-up-only content";
    const ctx = makeCtx(tempDir, "test-slug", {
      promptRules: SAMPLE_PROMPT_RULES,
      postWorkPrompts: [postWorkContent],
      reportTool: mockReportTool,
    });

    await runner.run(ctx);

    // First query = main work turn prompt
    const firstPrompt = capturedQueries[0]!.prompt;
    expect(firstPrompt).toContain(SAMPLE_PROMPT_RULES);

    // postWorkPrompts turn must NOT contain promptRules content
    // (it should only contain postWorkContent)
    const followUpPrompts = capturedQueries.slice(1).map((q) => q.prompt);
    for (const fp of followUpPrompts) {
      expect(fp).not.toContain(SAMPLE_PROMPT_RULES);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-019: promptRules が undefined のとき prompt が現行と同一
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-019: promptRules が undefined のとき prompt が現行と同一", () => {
  it("promptRules 未設定時は追加テキストなし（no artifacts, no reportTool）", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx = makeCtx(tempDir);
    // promptRules は undefined (既定)
    await runner.run(ctx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    expect(capturedQueries[0]!.prompt).toBe(`${BASE_MESSAGE}\n\n${additionalInstructions}`);
    expect(capturedQueries[0]!.prompt).not.toContain("<project-rules>");
  });
});
