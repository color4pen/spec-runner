/**
 * Integration tests: claude-code adapter prompt injection of touched-files section.
 *
 * TC-017: claude-code adapter の prompt 組成で先行 step 記録ありのとき注入セクションが含まれる
 * TC-018: claude-code adapter 空記録時の first prompt が注入前と byte 同一
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../agent-runner.js";
import type { QueryFn } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";
import { buildAdditionalInstructions } from "../../shared/prompt-builder.js";

// ---------------------------------------------------------------------------
// Helpers: capture the first prompt sent to queryFn
// ---------------------------------------------------------------------------

interface CapturedQuery {
  prompt: string;
}

function makeCaptureQueryFn(): { queryFn: QueryFn; capturedQueries: CapturedQuery[] } {
  const capturedQueries: CapturedQuery[] = [];

  const queryFn: QueryFn = async function* (params) {
    if (typeof params.prompt === "string") {
      capturedQueries.push({ prompt: params.prompt });
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeJobState(
  slug = "test-slug",
  touchedFiles?: Record<string, string[]>,
): JobState {
  const state: JobState = {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
  if (touchedFiles !== undefined) {
    state.touchedFiles = touchedFiles;
  }
  return state;
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

const BASE_MESSAGE = "review the implementation";

function makeAgentStep(name = "code-review"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "review",
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
  touchedFiles?: Record<string, string[]>,
): AgentRunContext {
  return {
    step: makeAgentStep("code-review"),
    state: makeJobState(slug, touchedFiles),
    branch: "feat/test",
    slug,
    cwd,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: {},
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  } as AgentRunContext;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-tf-inject-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-017: prior step records → injection section appears in first prompt
// ---------------------------------------------------------------------------

describe("TC-017: claude-code adapter — prior step touchedFiles → injection in first prompt", () => {
  it("first prompt includes prior step name and file list from touchedFiles", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx = makeCtx(tempDir, "test-slug", {
      implementer: ["src/core/foo.ts", "src/adapter/bar.ts"],
    });

    await runner.run(ctx);

    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = capturedQueries[0]!.prompt;

    // Section must include prior step name
    expect(firstPrompt).toContain("implementer");
    // Section must include file paths
    expect(firstPrompt).toContain("src/core/foo.ts");
    expect(firstPrompt).toContain("src/adapter/bar.ts");
  });

  it("first prompt includes restriction-forbidden wording from touched-files section", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx = makeCtx(tempDir, "test-slug", {
      implementer: ["src/core/foo.ts"],
    });

    await runner.run(ctx);

    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = capturedQueries[0]!.prompt;

    // Must include the restriction-forbidden wording
    expect(firstPrompt).toMatch(/制限してはならない|must not.*restrict|do not.*restrict|restrict.*must not/i);
  });

  it("current step (code-review) files are not in the injected section", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    const ctx = makeCtx(tempDir, "test-slug", {
      implementer: ["src/core/impl.ts"],
      "code-review": ["src/core/notes.md"], // current step — should not be injected
    });

    await runner.run(ctx);

    const firstPrompt = capturedQueries[0]!.prompt;
    expect(firstPrompt).toContain("src/core/impl.ts");
    expect(firstPrompt).not.toContain("src/core/notes.md");
  });
});

// ---------------------------------------------------------------------------
// TC-018: empty touchedFiles → first prompt is byte-identical to pre-injection
// ---------------------------------------------------------------------------

describe("TC-018: claude-code adapter — empty touchedFiles → prompt byte-identical to pre-injection", () => {
  it("prompt is identical to base formula when no prior step records exist", async () => {
    // tempDir has no specrunner/changes/<slug>/ → buildArtifactBundle returns ""
    const { queryFn: qFn1, capturedQueries: q1 } = makeCaptureQueryFn();
    const runner1 = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: qFn1 });

    // With NO touchedFiles
    const ctxNoTouched = makeCtx(tempDir);
    await runner1.run(ctxNoTouched);

    const { queryFn: qFn2, capturedQueries: q2 } = makeCaptureQueryFn();
    const runner2 = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: qFn2 });

    // With empty touchedFiles object
    const ctxEmptyTouched = makeCtx(tempDir, "test-slug", {});
    await runner2.run(ctxEmptyTouched);

    expect(q1[0]!.prompt).toBe(q2[0]!.prompt);
  });

  it("prompt matches pre-injection formula: baseMessage + additionalInstructions", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    // No touchedFiles (no injection)
    const ctx = makeCtx(tempDir);
    await runner.run(ctx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    expect(capturedQueries.length).toBeGreaterThanOrEqual(1);
    expect(capturedQueries[0]!.prompt).toBe(`${BASE_MESSAGE}\n\n${additionalInstructions}`);
  });

  it("touchedFiles with only current step entries → prompt equals pre-injection formula", async () => {
    const { queryFn, capturedQueries } = makeCaptureQueryFn();
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });

    // Only the current step's own records (should be excluded from injection)
    const ctx = makeCtx(tempDir, "test-slug", {
      "code-review": ["src/some-file.ts"],
    });
    await runner.run(ctx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    expect(capturedQueries[0]!.prompt).toBe(`${BASE_MESSAGE}\n\n${additionalInstructions}`);
  });
});
