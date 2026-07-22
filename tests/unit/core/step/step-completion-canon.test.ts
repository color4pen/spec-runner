/**
 * Tests for escalationReason causal attribution in deriveStepCompletion.
 *
 * TC-023: 非 canon 由来 escalation で StepCompletion.escalationReason は未設定
 *   - ok=false escalation + 正典 fixable finding 共存 → escalationReason 未設定
 *   - decision-needed escalation + 正典 fixable finding 共存 → escalationReason 未設定
 *   - 正典 fixable finding のみ → escalationReason が設定される（対照テスト）
 *
 * Design: escalationReason は verdict が canon 由来で escalation になった場合のみ設定される。
 * ok=false, vacuous check, decision-needed 等の高優先 escalation 経路では設定されてはならない。
 */
import { describe, it, expect, vi } from "vitest";
import { deriveStepCompletion } from "../../../../src/core/step/step-completion.js";
import { JUDGE_REPORT_TOOL } from "../../../../src/core/step/report-tool.js";
import type { AgentStep } from "../../../../src/core/port/step-types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { Finding } from "../../../../src/kernel/report-result.js";
import type { JudgeReportResult } from "../../../../src/core/port/report-result.js";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const SLUG = "test-slug";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(slug = SLUG): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: {
      path: `specrunner/changes/${slug}/request.md`,
      title: "Test",
      type: "bug-fix",
      slug,
    },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "code-review",
    status: "running",
    branch: `feat/${slug}`,
    history: [],
    error: null,
    steps: {},
  } as unknown as JobState;
}

/**
 * Minimal PipelineDeps for deriveStepCompletion.
 * No runtimeStrategy → finding-ref verification is skipped.
 * No permissionScope → computeExtraScopeFindings returns [].
 */
function makeDeps(slug = SLUG): PipelineDeps {
  return {
    slug,
    config: { version: 1, runtime: "managed", agents: {} } as PipelineDeps["config"],
    request: {
      type: "bug-fix",
      title: "Test",
      slug,
      baseBranch: "main",
      content: "# Test",
      adr: false,
      path: `specrunner/changes/${slug}/request.md`,
    },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "o",
    repo: "r",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: () => ({}) as PipelineDeps["storeFactory"],
  } as unknown as PipelineDeps;
}

/** Minimal AgentStep wired as a judge step (uses JUDGE_REPORT_TOOL). */
function makeJudgeStep(): AgentStep {
  return {
    kind: "agent",
    name: "code-review",
    agent: {
      name: "specrunner-code-review",
      role: "code-review",
      model: "claude-sonnet-4-5",
      system: "review",
      tools: [],
    },
    buildMessage: () => "review",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    reportTool: JUDGE_REPORT_TOOL,
  } as AgentStep;
}

/** A fixable finding on test-cases.md (unroutable via judge path: code-fixer cannot write it). */
function makeCanonFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "low",
    resolution: "fixable",
    file: `specrunner/changes/${SLUG}/test-cases.md`,
    title: "TC Category 誤分類",
    rationale: "Category フィールドが誤っている",
    ...overrides,
  };
}

/** A decision-needed finding on a non-canon file. */
function makeDecisionNeededFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "decision-needed",
    file: "src/core/foo.ts",
    title: "Human decision required",
    rationale: "Cannot auto-resolve",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-023: 非 canon 由来 escalation で escalationReason は未設定
// ---------------------------------------------------------------------------

describe("TC-023: 非 canon 由来 escalation で escalationReason は未設定", () => {
  it("ok=false + 正典 fixable finding 共存 → verdict=escalation だが escalationReason は未設定", async () => {
    // GIVEN: ok=false (highest-priority escalation) with a co-present unroutable canon finding
    // The verdict function returns escalation at priority #1 (ok=false) before reaching canon check.
    const canonFinding = makeCanonFinding();
    const state = makeState();
    const deps = makeDeps();
    const step = makeJudgeStep();

    // Suppress stderr warnings
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // WHEN: deriveStepCompletion with ok=false and a co-present canon finding
    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      {
        toolResult: {
          ok: false,  // <-- triggers priority #1 escalation
          findings: [canonFinding],
        } as JudgeReportResult,
      },
      undefined, // no permissionScope → computeExtraScopeFindings returns []
    );

    vi.restoreAllMocks();

    // THEN: verdict is escalation (from ok=false), but escalationReason must NOT be set
    // because the escalation was not caused by the unroutable canon finding
    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeUndefined();
  });

  it("decision-needed finding + 正典 fixable finding 共存 → verdict=escalation だが escalationReason は未設定", async () => {
    // GIVEN: a decision-needed finding (priority #3) co-present with an unroutable canon finding
    // The verdict function returns escalation at priority #3 before reaching canon check (#4).
    const decisionNeededFinding = makeDecisionNeededFinding();
    const canonFinding = makeCanonFinding();
    const state = makeState();
    const deps = makeDeps();
    const step = makeJudgeStep();

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // WHEN: deriveStepCompletion with ok=true but decision-needed finding + canon finding
    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      {
        toolResult: {
          ok: true,
          findings: [decisionNeededFinding, canonFinding],
        } as JudgeReportResult,
      },
      undefined,
    );

    vi.restoreAllMocks();

    // THEN: verdict is escalation (from decision-needed), but escalationReason must NOT be set
    // because the escalation was not caused by the unroutable canon finding
    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeUndefined();
  });

  it("[対照] 正典 fixable finding のみ（ok=true, decision-needed なし）→ escalationReason が設定される", async () => {
    // GIVEN: only an unroutable canon finding (no ok=false, no decision-needed)
    // The verdict function reaches canon check (priority #4) and returns escalation.
    const canonFinding = makeCanonFinding();
    const state = makeState();
    const deps = makeDeps();
    const step = makeJudgeStep();

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // WHEN: deriveStepCompletion with ok=true and only the canon finding
    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      {
        toolResult: {
          ok: true,
          findings: [canonFinding],
        } as JudgeReportResult,
      },
      undefined,
    );

    vi.restoreAllMocks();

    // THEN: verdict is escalation AND escalationReason IS set (canon finding caused it)
    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
    expect(completion.escalationReason).toContain(`specrunner/changes/${SLUG}/test-cases.md`);
  });

  it("ok=false のみ（正典 finding なし）→ escalationReason は未設定", async () => {
    // GIVEN: ok=false with no findings at all — baseline ok=false case
    const state = makeState();
    const deps = makeDeps();
    const step = makeJudgeStep();

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      {
        toolResult: {
          ok: false,
          findings: [],
        } as JudgeReportResult,
      },
      undefined,
    );

    vi.restoreAllMocks();

    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeUndefined();
  });
});
