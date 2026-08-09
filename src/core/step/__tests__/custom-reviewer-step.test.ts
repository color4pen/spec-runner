/**
 * T-04 / T-05: Custom reviewer step tests.
 *
 * T-04: customReviewerResultPath dispatch, output templates for unknown step names.
 * T-05: createCustomReviewerStep — reportTool identity, resultFilePath, buildMessage.
 *
 * Added for custom-reviewer-round-context:
 * TC-001: iteration ≥ 2 で前周 findings + 変更 file + 再指摘プロトコルが注入される (must)
 * TC-002: iteration 1 では前周 context block を注入しない (must)
 * TC-023: iteration 1 かつ decisions が存在するとき前周 context block は注入されないが裁定 block は注入される (should)
 */
import { describe, it, expect } from "vitest";
import { createCustomReviewerStep } from "../custom-reviewer.js";
import { JUDGE_REPORT_TOOL } from "../report-tool.js";
import type { ReviewerSnapshot } from "../../reviewers/types.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../types.js";
import { getOutputTemplates } from "../../../templates/step-output-templates.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<ReviewerSnapshot> = {}): ReviewerSnapshot {
  return {
    name: "security",
    maxIterations: 3,
    purpose: "セキュリティ観点の検査",
    criteria: "認証・認可の確認",
    judgment: "CRITICAL/HIGH が 0 件なら approved",
    freeText: "",
    ...overrides,
  };
}

function makeState(steps: Record<string, unknown[]> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "my-change" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "security",
    status: "running",
    branch: "feat/my-change-abc12345",
    history: [],
    error: null,
    steps: steps as JobState["steps"],
  };
}

function makeDeps(slug = "my-change"): StepDeps {
  return {
    slug,
    request: { title: "T", type: "bug-fix", slug, content: "Original request content.", baseBranch: "main", adr: false },
    config: {} as StepDeps["config"],
  };
}

// ---------------------------------------------------------------------------
// T-04: unknown step name → output templates returns []
// ---------------------------------------------------------------------------

describe("T-04: getOutputTemplates for custom reviewer step name", () => {
  it("returns [] for a custom reviewer step name (not in switch)", () => {
    const state = makeState();
    expect(getOutputTemplates("security", "my-change", state)).toEqual([]);
  });

  it("returns [] for any arbitrary reviewer step name", () => {
    const state = makeState();
    expect(getOutputTemplates("perf-check", "my-change", state)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-05: createCustomReviewerStep — reportTool identity
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — reportTool", () => {
  it("reportTool is exactly JUDGE_REPORT_TOOL (=== identity)", () => {
    const step = createCustomReviewerStep(makeSnapshot());
    expect(step.reportTool).toBe(JUDGE_REPORT_TOOL);
  });
});

// ---------------------------------------------------------------------------
// T-05: resultFilePath uses reviewer name
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — resultFilePath", () => {
  it("resultFilePath includes reviewer name in path", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps();
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("security");
  });

  it("resultFilePath uses slug from deps", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps("my-slug");
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("my-slug");
  });

  it("resultFilePath starts at iteration 001 for fresh state", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "sec" }));
    const state = makeState();
    const deps = makeDeps();
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("-001.md");
  });

  it("resultFilePath increments on second run", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "sec" }));
    const state = makeState({ sec: [{ sessionId: null, outcome: { verdict: "needs-fix" }, startedAt: "", endedAt: "" }] });
    const deps = makeDeps();
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("-002.md");
  });
});

// ---------------------------------------------------------------------------
// T-05: buildMessage contains reviewer name
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — buildMessage", () => {
  it("buildMessage contains reviewer name", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps();
    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("security");
  });

  it("buildMessage contains reviewer purpose", () => {
    const step = createCustomReviewerStep(makeSnapshot({ purpose: "unique-purpose-xyz" }));
    const state = makeState();
    const deps = makeDeps();
    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("unique-purpose-xyz");
  });

  it("buildMessage contains result file path", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps();
    const msg = step.buildMessage(state, deps);
    // result path should be embedded in the message
    expect(msg).toContain("security-result-001.md");
  });

  it("buildMessage contains change folder path", () => {
    const step = createCustomReviewerStep(makeSnapshot());
    const state = makeState();
    const deps = makeDeps("my-slug");
    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("specrunner/changes/my-slug");
  });
});

// ---------------------------------------------------------------------------
// T-05: step name
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — step name", () => {
  it("step.name equals snapshot.name", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "perf" }));
    expect(step.name).toBe("perf");
  });

  it("step.kind is 'agent'", () => {
    const step = createCustomReviewerStep(makeSnapshot());
    expect(step.kind).toBe("agent");
  });
});

// ---------------------------------------------------------------------------
// Timestamps for round-context test fixtures
// ---------------------------------------------------------------------------
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T01:00:00.000Z";

// ---------------------------------------------------------------------------
// TC-001 (must): iteration ≥ 2 で前周 findings + 変更 file + 再指摘プロトコルが注入される
//
// Tests that buildMessage includes the prior-round context block when
// dynamicContext.customReviewerPriorRound is populated (injected by prepareRoundContext).
// ---------------------------------------------------------------------------

describe("TC-001: iteration ≥ 2 で buildMessage に前周 context block が含まれる", () => {
  it("TC-001: buildMessage includes prior-round-context block when customReviewerPriorRound is set", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));

    // iteration 2 state: reviewer has run once
    const state = makeState({
      security: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [{ severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Missing guard", rationale: "x" }],
            },
          },
          startedAt: T0,
          endedAt: T1,
        },
      ],
    });

    // Simulate what prepareRoundContext injects into dynamicContext
    const deps: StepDeps = {
      ...makeDeps(),
      dynamicContext: {
        gitLog: "",
        diffStat: "",
        changesList: [],
        customReviewerPriorRound: {
          findings: [{ severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Missing guard" }],
          changedFiles: ["src/auth.ts"],
        },
      } as StepDeps["dynamicContext"],
    };

    const msg = step.buildMessage(state, deps);

    // Must contain prior-round context block
    expect(msg).toContain("<prior-round-context>");
    expect(msg).toContain("</prior-round-context>");
  });

  it("TC-001: prior-round-context block contains findings projection fields", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState({
      security: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [{ severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Missing guard", rationale: "x" }],
            },
          },
          startedAt: T0,
          endedAt: T1,
        },
      ],
    });

    const deps: StepDeps = {
      ...makeDeps(),
      dynamicContext: {
        gitLog: "",
        diffStat: "",
        changesList: [],
        customReviewerPriorRound: {
          findings: [{ severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Missing guard" }],
          changedFiles: ["src/auth.ts", "src/utils.ts"],
        },
      } as StepDeps["dynamicContext"],
    };

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("high");
    expect(msg).toContain("src/auth.ts");
    expect(msg).toContain("Missing guard");
    // Changed files must appear
    expect(msg).toContain("src/utils.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-002 (must): iteration 1 では前周 context block を注入しない
//
// Tests that buildMessage does NOT include the prior-round context block when
// dynamicContext.customReviewerPriorRound is absent (iteration 1 — no prior round).
// ---------------------------------------------------------------------------

describe("TC-002: iteration 1 では buildMessage に前周 context block を含まない", () => {
  it("TC-002: buildMessage does not include <prior-round-context> when customReviewerPriorRound is absent", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));

    // iteration 1 state: no prior runs
    const state = makeState();

    const deps: StepDeps = {
      ...makeDeps(),
      dynamicContext: {
        gitLog: "",
        diffStat: "",
        changesList: [],
        // No customReviewerPriorRound field — iteration 1
      } as StepDeps["dynamicContext"],
    };

    const msg = step.buildMessage(state, deps);
    expect(msg).not.toContain("<prior-round-context>");
  });

  it("TC-002: buildMessage does not include prior-round-context block when dynamicContext is absent", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps(); // no dynamicContext

    const msg = step.buildMessage(state, deps);
    expect(msg).not.toContain("<prior-round-context>");
  });
});

// ---------------------------------------------------------------------------
// Tests for operator adjudication block injection (TC-016/TC-017 at message level)
// ---------------------------------------------------------------------------

describe("operator adjudication block in buildMessage", () => {
  it("buildMessage includes <operator-adjudication> block when operatorAdjudicationContext is set", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();

    const deps: StepDeps = {
      ...makeDeps(),
      dynamicContext: {
        gitLog: "",
        diffStat: "",
        changesList: [],
        operatorAdjudicationContext: {
          adjudications: [{ text: "do not revert auth", step: "security", recordedAt: T1 }],
          decisions: [],
        },
      } as StepDeps["dynamicContext"],
    };

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("<operator-adjudication>");
    expect(msg).toContain("</operator-adjudication>");
  });

  it("buildMessage does not include <operator-adjudication> block when operatorAdjudicationContext is absent", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps(); // no dynamicContext

    const msg = step.buildMessage(state, deps);
    expect(msg).not.toContain("<operator-adjudication>");
  });
});

// ---------------------------------------------------------------------------
// TC-023 (should): iteration 1 かつ decisions が存在するとき前周 context block は注入されないが
// 裁定 block は注入される
// ---------------------------------------------------------------------------

describe("TC-023 (should): iteration 1 かつ decisions → 前周 context block なし・裁定 block あり", () => {
  it("TC-023: buildMessage has no <prior-round-context> but has <operator-adjudication> at iteration 1 with decisions", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));

    // iteration 1: no prior reviewer runs
    const state = makeState();

    // dynamicContext has no customReviewerPriorRound (not injected for iteration 1)
    // but has operatorAdjudicationContext (decisions exist)
    const deps: StepDeps = {
      ...makeDeps(),
      dynamicContext: {
        gitLog: "",
        diffStat: "",
        changesList: [],
        // customReviewerPriorRound is absent — iteration 1
        operatorAdjudicationContext: {
          adjudications: [],
          decisions: [
            {
              step: "security",
              title: "Auth bypass",
              file: "src/auth.ts",
              selectedOption: "accept-as-is",
              consequence: "No action needed",
              rationale: "Security team approved",
            },
          ],
        },
      } as StepDeps["dynamicContext"],
    };

    const msg = step.buildMessage(state, deps);

    // Prior context block must NOT be present (iteration 1)
    expect(msg).not.toContain("<prior-round-context>");

    // Adjudication block MUST be present (decisions exist)
    expect(msg).toContain("<operator-adjudication>");
    expect(msg).toContain("</operator-adjudication>");
  });
});

// ---------------------------------------------------------------------------
// prepareRoundContext behavior tests
// ---------------------------------------------------------------------------

describe("createCustomReviewerStep — prepareRoundContext", () => {
  it("prepareRoundContext exists as a function on the step object", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    // After implementation, prepareRoundContext should be a function
    expect(typeof (step as unknown as { prepareRoundContext?: unknown }).prepareRoundContext).toBe("function");
  });

  it("prepareRoundContext returns null for iteration 1 (no prior run) without throwing", async () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const prepareRoundContext = (step as unknown as {
      prepareRoundContext?: (state: JobState, cwd: string, runtimeStrategy: unknown) => Promise<unknown>;
    }).prepareRoundContext;

    // If prepareRoundContext is not yet implemented, skip gracefully
    if (!prepareRoundContext) return;

    const state = makeState(); // no prior runs → iteration 1
    let threw = false;
    let result: unknown;
    try {
      result = await prepareRoundContext(state, "/tmp/cwd", undefined);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // iteration 1: both derive functions return null → prepareRoundContext returns null
    expect(result).toBeNull();
  });

  it("prepareRoundContext does not throw even when runtimeStrategy is missing", async () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const prepareRoundContext = (step as unknown as {
      prepareRoundContext?: (state: JobState, cwd: string, runtimeStrategy: unknown) => Promise<unknown>;
    }).prepareRoundContext;

    if (!prepareRoundContext) return;

    // State with prior run (iteration 2 candidate) but no runtimeStrategy
    const state = makeState({
      security: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
          startedAt: T0,
          endedAt: T1,
        },
      ],
    });

    let threw = false;
    try {
      await prepareRoundContext(state, "/tmp/cwd", undefined);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});
