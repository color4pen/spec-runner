/**
 * Unit tests for Pipeline transition table and loop guard
 *
 * TC-012: 7 新エッジが STANDARD_TRANSITIONS に存在する
 * TC-013: LOOP_ERROR_CODES — spec-review cycle
 * TC-014: LOOP_ERROR_CODES — verification cycle
 * TC-015: loop guard → VERIFICATION_RETRIES_EXHAUSTED で escalation (integration)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STANDARD_TRANSITIONS, LOOP_ERROR_CODES } from "../../../../src/core/pipeline/types.js";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-transitions-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalState(jobId: string = "test-job"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    client: {} as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
    },
  };
}

function makeStepObject(name: string, kind: "agent" | "cli" = "agent"): Step {
  if (kind === "cli") {
    return {
      kind: "cli",
      name,
      run: vi.fn().mockResolvedValue(undefined),
      resultFilePath: () => `openspec/changes/test-slug/${name}-result.md`,
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };
  }
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../../src/state/schema.js").StepName,
      model: "claude-sonnet-4-5",
      system: `system for ${name}`,
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    completionVerdict: "success" as const,
  };
}

// TC-012: STANDARD_TRANSITIONS に必要なエッジが含まれる
describe("TC-012: STANDARD_TRANSITIONS に必要なエッジが存在する", () => {
  const requiredEdges = [
    { step: "spec-review",  on: "approved",   to: "implementer" },
    { step: "implementer",  on: "success",     to: "verification" },
    { step: "implementer",  on: "error",       to: "escalate" },
    { step: "verification", on: "passed",      to: "code-review" },
    { step: "verification", on: "failed",      to: "build-fixer" },
    { step: "verification", on: "escalation",  to: "escalate" },
    { step: "build-fixer",  on: "success",     to: "verification" },
    { step: "build-fixer",  on: "error",       to: "escalate" },
  ];

  for (const edge of requiredEdges) {
    it(`transition: ${edge.step} --${edge.on}→ ${edge.to}`, () => {
      const found = STANDARD_TRANSITIONS.find(
        (t) => t.step === edge.step && t.on === edge.on && t.to === edge.to,
      );
      expect(found).toBeDefined();
    });
  }
});

// TC-011: verification passed → code-review (新 transition)
describe("TC-011: verification passed → code-review transition が存在する", () => {
  it("STANDARD_TRANSITIONS has verification --passed→ code-review", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "code-review",
    );
    expect(found).toBeDefined();
  });

  it("STANDARD_TRANSITIONS does NOT have verification --passed→ end (removed)", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "end",
    );
    expect(found).toBeUndefined();
  });
});

// TC-012 (new code-review transitions): TC-012 / TC-013 / TC-014 / TC-015 / TC-029
describe("TC-012-015, TC-029: code-review / code-fixer transition rows", () => {
  const codeReviewEdges = [
    { step: "code-review", on: "approved",   to: "end",         label: "TC-012: code-review approved → end" },
    { step: "code-review", on: "needs-fix",  to: "code-fixer",  label: "TC-013: code-review needs-fix → code-fixer" },
    { step: "code-review", on: "escalation", to: "escalate",    label: "TC-015: code-review escalation → escalate" },
    { step: "code-fixer",  on: "approved",   to: "code-review", label: "TC-014: code-fixer approved → code-review" },
    { step: "code-fixer",  on: "error",      to: "escalate",    label: "TC-029: code-fixer error → escalate" },
  ];

  for (const edge of codeReviewEdges) {
    it(`${edge.label}`, () => {
      const found = STANDARD_TRANSITIONS.find(
        (t) => t.step === edge.step && t.on === edge.on && t.to === edge.to,
      );
      expect(found).toBeDefined();
    });
  }
});

// TC-030: STANDARD_TRANSITIONS テーブルが全 transition を含む
describe("TC-030: STANDARD_TRANSITIONS テーブルが仕様に定義された全 transition を含む", () => {
  it("has 19 rows total (14 original - 1 modified + 6 new code-review/code-fixer = 19)", () => {
    // 14 original rows, but verification --passed→ end replaced by --passed→ code-review
    // + 5 new code-review/code-fixer rows = 19
    expect(STANDARD_TRANSITIONS.length).toBe(19);
  });

  it("verification --passed→ end does NOT exist", () => {
    const oldRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "end",
    );
    expect(oldRow).toBeUndefined();
  });
});

// TC-016: LOOP_ERROR_CODES に code-review エントリが追加されている
describe("TC-016: LOOP_ERROR_CODES に code-review エントリが追加されている", () => {
  it("LOOP_ERROR_CODES['code-review'].code === 'CODE_REVIEW_RETRIES_EXHAUSTED'", () => {
    const entry = LOOP_ERROR_CODES["code-review"];
    expect(entry).toBeDefined();
    expect(entry!.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
  });

  it("message(3) === 'code-review did not approve after 3 iterations'", () => {
    const entry = LOOP_ERROR_CODES["code-review"];
    expect(entry!.message(3)).toBe("code-review did not approve after 3 iterations");
  });

  it("hint('003') contains 'review-feedback-003.md'", () => {
    const entry = LOOP_ERROR_CODES["code-review"];
    expect(entry!.hint("003")).toContain("review-feedback-003.md");
  });
});

// TC-013: LOOP_ERROR_CODES — spec-review cycle
describe("TC-013: LOOP_ERROR_CODES — spec-review cycle", () => {
  it("LOOP_ERROR_CODES['spec-review'].code === 'SPEC_REVIEW_RETRIES_EXHAUSTED'", () => {
    const entry = LOOP_ERROR_CODES["spec-review"];
    expect(entry).toBeDefined();
    expect(entry!.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });

  it("LOOP_ERROR_CODES['spec-review'].message references maxIterations", () => {
    const entry = LOOP_ERROR_CODES["spec-review"];
    const msg = entry!.message(3);
    expect(msg).toContain("3");
    expect(msg.toLowerCase()).toContain("spec-review");
  });
});

// TC-014: LOOP_ERROR_CODES — verification cycle
describe("TC-014: LOOP_ERROR_CODES — verification cycle", () => {
  it("LOOP_ERROR_CODES['verification'].code === 'VERIFICATION_RETRIES_EXHAUSTED'", () => {
    const entry = LOOP_ERROR_CODES["verification"];
    expect(entry).toBeDefined();
    expect(entry!.code).toBe("VERIFICATION_RETRIES_EXHAUSTED");
  });

  it("message matches 'verification did not pass after N iterations'", () => {
    const entry = LOOP_ERROR_CODES["verification"];
    const msg = entry!.message(3);
    expect(msg).toMatch(/verification did not pass after 3 iterations/);
  });

  it("hint starts with 'Review verification-result-'", () => {
    const entry = LOOP_ERROR_CODES["verification"];
    const hint = entry!.hint("001");
    expect(hint).toMatch(/^Review verification-result-001\.md/);
  });
});

// TC-015: loop guard → VERIFICATION_RETRIES_EXHAUSTED
describe("TC-015: verification ↔ build-fixer loop guard → VERIFICATION_RETRIES_EXHAUSTED", () => {
  it("verification が 3 回 failed → VERIFICATION_RETRIES_EXHAUSTED で escalation", async () => {
    const maxIterations = 3;

    const jobState = makeMinimalState("test-loop-guard");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();
    let verificationCallCount = 0;

    // Mock executor: verification always returns failed, build-fixer always returns success
    const executeSpy = vi.fn().mockImplementation(async (step: Step, state: JobState): Promise<JobState> => {
      if (step.name === "verification") {
        verificationCallCount++;
        return {
          ...state,
          status: "success",
          step: "verification",
          steps: {
            ...state.steps,
            verification: [
              ...(state.steps?.["verification"] ?? []),
              {
                attempt: verificationCallCount,
                sessionId: null,
                outcome: { verdict: "failed" as const, findingsPath: `openspec/changes/test-slug/verification-result.md`, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      if (step.name === "build-fixer") {
        return {
          ...state,
          status: "success",
          step: "build-fixer",
          steps: {
            ...state.steps,
            "build-fixer": [
              ...(state.steps?.["build-fixer"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "success" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["verification", makeStepObject("verification")],
        ["build-fixer",  makeStepObject("build-fixer")],
      ]),
      transitions: [
        { step: "verification", on: "passed",    to: "end" },
        { step: "verification", on: "failed",    to: "build-fixer" },
        { step: "verification", on: "escalation", to: "escalate" },
        { step: "build-fixer",  on: "success",   to: "verification" },
        { step: "build-fixer",  on: "error",     to: "escalate" },
      ],
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: "verification",
      loopNames: ["verification"],
    });

    const result = await pipeline.run("verification", jobState, makeMinimalDeps());

    expect(result.error?.code).toBe("VERIFICATION_RETRIES_EXHAUSTED");
    expect(result.error?.message).toContain("3");
  });
});

// TC-017: code-review ↔ code-fixer サイクルが maxIterations に達すると CODE_REVIEW_RETRIES_EXHAUSTED で終了する
describe("TC-017: code-review ↔ code-fixer loop guard → CODE_REVIEW_RETRIES_EXHAUSTED", () => {
  it("code-review が 3 回 needs-fix → CODE_REVIEW_RETRIES_EXHAUSTED で escalation", async () => {
    const maxIterations = 3;

    const jobState = makeMinimalState("test-code-review-loop-guard");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();
    let codeReviewCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, state: JobState): Promise<JobState> => {
      if (step.name === "code-review") {
        codeReviewCallCount++;
        return {
          ...state,
          status: "success",
          step: "code-review",
          steps: {
            ...state.steps,
            "code-review": [
              ...(state.steps?.["code-review"] ?? []),
              {
                attempt: codeReviewCallCount,
                sessionId: null,
                outcome: {
                  verdict: "needs-fix" as const,
                  findingsPath: `openspec/changes/test-slug/review-feedback-${String(codeReviewCallCount).padStart(3, "0")}.md`,
                  error: null,
                },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      if (step.name === "code-fixer") {
        return {
          ...state,
          status: "success",
          step: "code-fixer",
          steps: {
            ...state.steps,
            "code-fixer": [
              ...(state.steps?.["code-fixer"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "approved" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["code-review", makeStepObject("code-review")],
        ["code-fixer",  makeStepObject("code-fixer")],
      ]),
      transitions: [
        { step: "code-review", on: "approved",   to: "end" },
        { step: "code-review", on: "needs-fix",  to: "code-fixer" },
        { step: "code-review", on: "escalation", to: "escalate" },
        { step: "code-fixer",  on: "approved",   to: "code-review" },
        { step: "code-fixer",  on: "error",      to: "escalate" },
      ],
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: "code-review",
      loopNames: ["code-review"],
    });

    const result = await pipeline.run("code-review", jobState, makeMinimalDeps());

    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
    expect(result.error?.message).toBe("code-review did not approve after 3 iterations");
    // state.steps["code-review"] の末尾 verdict が "escalation" に書き換わる
    const codeReviewSteps = result.steps?.["code-review"] ?? [];
    const lastStep = codeReviewSteps[codeReviewSteps.length - 1];
    expect(lastStep?.outcome?.verdict).toBe("escalation");
  });
});

// TC-024: Pipeline.loopNames 既定値に "code-review" が含まれる (via run.ts)
describe("TC-024: runPipeline の loopNames に code-review が含まれる", () => {
  it("STANDARD_TRANSITIONS includes code-review as a loop step (code-fixer approved → code-review)", () => {
    // Verify the loop structure is present in STANDARD_TRANSITIONS
    const codeFixerToCodeReview = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-fixer" && t.on === "approved" && t.to === "code-review",
    );
    expect(codeFixerToCodeReview).toBeDefined();

    const codeReviewNeedsFixToCodeFixer = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "needs-fix" && t.to === "code-fixer",
    );
    expect(codeReviewNeedsFixToCodeFixer).toBeDefined();
  });
});
