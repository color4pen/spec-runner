/**
 * Tests for request-review step-completion evidence handling.
 *
 * Source: tasks.md > T-04 Acceptance Criteria
 *
 * TC-019: checked=0 検知時に stderr へ診断が出力される (should)
 * TC-020: evidence が persistToolResult に伝搬され state に永続化される (should)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deriveStepCompletion } from "../step-completion.js";
import { REQUEST_REVIEW_REPORT_TOOL } from "../report-tool.js";
import type { Step } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRequestReviewStep(name: string = "request-review"): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "review request",
      tools: [],
    },
    toolHandlers: undefined,
    reportTool: REQUEST_REVIEW_REPORT_TOOL,
    buildMessage: () => "review the request",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as Step;
}

function makeMinimalState(step: string = "request-review"): JobState {
  return {
    version: 2,
    jobId: "rr-step-completion-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "specrunner/changes/test/request.md", title: "Test", type: "bug-fix", slug: "test" },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step,
    status: "running",
    branch: "change/test-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    slug: "test",
    cwd: "/tmp",
    config: { version: 1, agents: {} } as unknown as PipelineDeps["config"],
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test",
      baseBranch: "main",
      content: "content",
      adr: false,
      path: "specrunner/changes/test/request.md",
    },
    githubClient: {} as unknown as PipelineDeps["githubClient"],
    owner: "octo",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: (() => ({})) as unknown as PipelineDeps["storeFactory"],
    runner: {} as unknown as PipelineDeps["runner"],
    // runtimeStrategy absent → finding ref verification and scope check are skipped
  } as unknown as PipelineDeps;
}

// ---------------------------------------------------------------------------
// TC-019: checked=0 検知時に stderr へ診断が出力される
// Source: tasks.md > T-04 Acceptance Criteria (should priority)
// ---------------------------------------------------------------------------

describe("TC-019: checked=0 in request-review step causes diagnostic to be written to stderr", () => {
  let stderrMessages: string[] = [];

  beforeEach(() => {
    stderrMessages = [];
    vi.spyOn(process.stderr, "write").mockImplementation((msg: unknown) => {
      stderrMessages.push(String(msg));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-019: request-review step with checked=0 → verdict is 'needs-discussion' AND stderr diagnostic is written", async () => {
    const step = makeMinimalRequestReviewStep("request-review");
    const state = makeMinimalState("request-review");
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [],
        evidence: { checked: 0, skipped: 3, unverified: 0 },
      } as unknown as import("../../../state/schema.js").StepOutcome["toolResult"],
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(step, state, deps, agentResult, undefined);

    // TC-019 (primary): verdict must be needs-discussion for checked=0 vacuous check
    expect(completion.verdict).toBe("needs-discussion");

    // TC-019 (secondary): diagnostic must be written to stderr
    const allStderr = stderrMessages.join("\n");
    const hasCheckedZeroMention =
      allStderr.includes("checked=0") ||
      allStderr.includes("checked: 0");
    const hasVacuousMention =
      allStderr.includes("検証実績ゼロ") ||
      allStderr.includes("vacuous") ||
      allStderr.includes("判定不能") ||
      allStderr.includes("needs-discussion");
    // Either a checked=0 mention or a vacuous/needs-discussion mention qualifies
    expect(hasCheckedZeroMention || hasVacuousMention).toBe(true);
  });

  it("TC-019: request-review step with checked>0 → verdict is 'approve' AND no checked=0 diagnostic", async () => {
    const step = makeMinimalRequestReviewStep("request-review");
    const state = makeMinimalState("request-review");
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [],
        evidence: { checked: 5, skipped: 0, unverified: 0 },
      } as unknown as import("../../../state/schema.js").StepOutcome["toolResult"],
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(step, state, deps, agentResult, undefined);

    // When checked > 0, verdict is approve (no vacuous check triggered)
    expect(completion.verdict).toBe("approve");

    // No zero-checked diagnostic should be emitted
    const allStderr = stderrMessages.join("\n");
    const hasVacuousDiagnostic =
      allStderr.includes("検証実績ゼロ") || allStderr.includes("vacuous");
    expect(hasVacuousDiagnostic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-020: evidence が persistToolResult に伝搬され state に永続化される
// Source: tasks.md > T-04 Acceptance Criteria (should priority)
// ---------------------------------------------------------------------------

describe("TC-020: evidence が persistToolResult に伝搬され state に永続化される", () => {
  it("TC-020: request-review step with evidence → persistToolResult contains evidence", async () => {
    const step = makeMinimalRequestReviewStep("request-review");
    const state = makeMinimalState("request-review");
    const deps = makeMinimalDeps();
    const evidence = { checked: 3, skipped: 0, unverified: 0 };

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [],
        evidence,
      } as unknown as import("../../../state/schema.js").StepOutcome["toolResult"],
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(step, state, deps, agentResult, undefined);

    // TC-020: evidence must be present in persistToolResult
    const persistedEvidence = (completion.persistToolResult as unknown as { evidence?: typeof evidence })?.evidence;
    expect(persistedEvidence).toEqual(evidence);
  });

  it("TC-020: request-review step with checked=0 evidence → persistToolResult still contains evidence", async () => {
    const step = makeMinimalRequestReviewStep("request-review");
    const state = makeMinimalState("request-review");
    const deps = makeMinimalDeps();
    const evidence = { checked: 0, skipped: 5, unverified: 0 };

    // Suppress stderr for this test
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [],
        evidence,
      } as unknown as import("../../../state/schema.js").StepOutcome["toolResult"],
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(step, state, deps, agentResult, undefined);

    // Even for checked=0, evidence is persisted (persistence is evidence-value-neutral)
    const persistedEvidence = (completion.persistToolResult as unknown as { evidence?: typeof evidence })?.evidence;
    expect(persistedEvidence).toEqual(evidence);

    vi.restoreAllMocks();
  });
});
