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
import type { SpawnFn } from "../../../../src/util/spawn.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { changeFolderPath, verificationResultPath, reviewFeedbackPath, conformanceResultPath } from "../../../../src/util/paths.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";

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
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    },
    owner: "user",
    repo: "repo",
    spawn: (async () => ({ exitCode: 0, stdout: "", stderr: "" })) as SpawnFn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

function makeStepObject(name: string, kind: "agent" | "cli" = "agent"): Step {
  if (kind === "cli") {
    return {
      kind: "cli",
      name,
      run: vi.fn().mockResolvedValue(undefined),
      resultFilePath: () => `${changeFolderPath("test-slug")}/${name}-result.md`,
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };
  }
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../../src/state/schema.js").AgentStepName,
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
    { step: "request-review", on: "approve",           to: "design" },
    { step: "request-review", on: "needs-discussion",  to: "escalate" },
    { step: "request-review", on: "reject",            to: "escalate" },
    { step: "request-review", on: "error",             to: "escalate" },
    { step: "spec-review",   on: "approved",   to: "test-case-gen" },
    { step: "test-case-gen", on: "success",    to: "implementer" },
    { step: "test-case-gen", on: "error",      to: "escalate" },
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

// TC-012 (new code-review transitions): TC-012 / TC-013 / TC-014 / TC-029
// Note: TC-015 (code-review escalation → escalate) removed in R3 cutover.
describe("TC-012-015, TC-029: code-review / code-fixer transition rows", () => {
  const codeReviewEdges = [
    // TC-012: code-review approved routes to conformance (not adr-gen directly)
    { step: "code-review", on: "approved",   to: "conformance", label: "TC-012: code-review approved → conformance" },
    { step: "code-review", on: "needs-fix",  to: "code-fixer",  label: "TC-013: code-review needs-fix → code-fixer" },
    // TC-015: code-review escalation → escalate REMOVED in R3 (judge halt via loop exhaustion only)
    { step: "code-fixer",  on: "approved",   to: "code-review", label: "TC-014: code-fixer approved → code-review" },
    { step: "code-fixer",  on: "error",      to: "escalate",    label: "TC-029: code-fixer error → escalate" },
    // adr-gen transitions
    { step: "adr-gen",     on: "success",    to: "pr-create",   label: "TC-ADR-INT: adr-gen success → pr-create" },
    { step: "adr-gen",     on: "error",      to: "escalate",    label: "TC-ADR-INT: adr-gen error → escalate" },
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

// TC-001: code-review approved (no fixable) → conformance
// TC-002: code-fixer approved after observation-fix → conformance
// TC-005: no direct edge from code-review to adr-gen
// TC-006: no direct edge from code-fixer to adr-gen
// TC-007: conformance needs-fix → implementer
// TC-015: conformance approved → adr-gen
describe("TC-001/002/005/006/007/015: conformance transition rows", () => {
  it("TC-001: code-review approved (no fixable) → conformance", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "conformance",
    );
    expect(found).toBeDefined();
  });

  it("TC-002: code-fixer approved (observation-fix) → conformance (with when predicate)", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-fixer" && t.on === "approved" && t.to === "conformance",
    );
    expect(found).toBeDefined();
    expect(found!.when).toBeDefined();
  });

  it("TC-005: no direct edge from code-review to adr-gen", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(found).toBeUndefined();
  });

  it("TC-006: no direct edge from code-fixer to adr-gen", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-fixer" && t.to === "adr-gen",
    );
    expect(found).toBeUndefined();
  });

  it("TC-007: conformance needs-fix → implementer", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "conformance" && t.on === "needs-fix" && t.to === "implementer",
    );
    expect(found).toBeDefined();
  });

  it("TC-015: conformance approved → adr-gen", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(found).toBeDefined();
  });
});

// TC-030: STANDARD_TRANSITIONS テーブルが全 transition を含む
// TC-022: R3 cutover: 33 → 31 (removed spec-review escalation + code-review escalation)
describe("TC-030: STANDARD_TRANSITIONS テーブルが仕様に定義された全 transition を含む", () => {
  it("has 31 rows total (request-review adds 4 rows, conformance adds 2 rows)", () => {
    // 25 previous + 2 (conformance) + 4 (request-review)
    expect(STANDARD_TRANSITIONS.length).toBe(31);
  });

  it("verification --passed→ end does NOT exist", () => {
    const oldRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "end",
    );
    expect(oldRow).toBeUndefined();
  });

  // R3 cutover: spec-review and code-review escalation transitions removed
  it("spec-review --escalation→ escalate does NOT exist (R3 cutover)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "spec-review" && t.on === "escalation",
    );
    expect(row).toBeUndefined();
  });

  it("code-review --escalation→ escalate does NOT exist (R3 cutover)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "escalation",
    );
    expect(row).toBeUndefined();
  });

  it("delta-spec-validation --escalation→ escalate does NOT exist (step removed)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "escalation" && t.to === "escalate",
    );
    expect(row).toBeUndefined();
  });

  it("verification --escalation→ escalate still exists (grounded step, maintained)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "escalation" && t.to === "escalate",
    );
    expect(row).toBeDefined();
  });

  it("code-review --approved→ end does NOT exist (TC-021: regression guard)", () => {
    const oldRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "end",
    );
    expect(oldRow).toBeUndefined();
  });

  it("pr-create --success→ end exists (TC-019)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "pr-create" && t.on === "success" && t.to === "end",
    );
    expect(row).toBeDefined();
  });

  it("pr-create --error→ escalate exists (TC-020)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "pr-create" && t.on === "error" && t.to === "escalate",
    );
    expect(row).toBeDefined();
  });

  it("code-review --approved→ delta-spec-validation does NOT exist (step removed)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "delta-spec-validation",
    );
    expect(row).toBeUndefined();
  });

  it("code-review --approved→ conformance exists (conditional, no `when` for no-fixable path)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "conformance",
    );
    expect(row).toBeDefined();
  });

  it("code-review --approved→ pr-create does NOT exist (direct route removed)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "pr-create",
    );
    expect(row).toBeUndefined();
  });

  it("delta-spec-validation --approved→ adr-gen does NOT exist (step removed)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(row).toBeUndefined();
  });

  it("delta-spec-validation --approved→ spec-review does NOT exist (step removed)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "approved" && t.to === "spec-review",
    );
    expect(row).toBeUndefined();
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
          status: "running",
          step: "verification",
          steps: {
            ...state.steps,
            verification: [
              ...(state.steps?.["verification"] ?? []),
              {
                attempt: verificationCallCount,
                sessionId: null,
                outcome: { verdict: "failed" as const, findingsPath: verificationResultPath("test-slug"), error: null },
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
          status: "running",
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
          status: "running",
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
                  findingsPath: reviewFeedbackPath("test-slug", codeReviewCallCount),
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
          status: "running",
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
      loopFixerPairs: { "code-review": "code-fixer" },
    });

    const result = await pipeline.run("code-review", jobState, makeMinimalDeps());

    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
    expect(result.error?.message).toBe("code-review did not approve after 3 iterations");
    // state.steps["code-review"] の末尾 verdict が "escalation" に書き換わる
    const codeReviewSteps = result.steps?.["code-review"] ?? [];
    const lastStep = codeReviewSteps[codeReviewSteps.length - 1];
    expect(lastStep?.outcome?.verdict).toBe("escalation");
    // TC-009: code-review 枯渇後の resumePoint は code-fixer を指す（reviewer 再実行を避ける）
    expect(result.resumePoint?.step).toBe("code-fixer");
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

// TC-023: loopNames — pr-create が loopNames に含まれない
// TC-016: conformance が STANDARD_LOOP_NAMES に含まれる
describe("TC-023/016: Pipeline loopNames — pr-create が含まれない、conformance が含まれる", () => {
  it("STANDARD_LOOP_NAMES に conformance が含まれ、pr-create が含まれない", async () => {
    const { STANDARD_LOOP_NAMES } = await import("../../../../src/core/pipeline/run.js");
    expect(STANDARD_LOOP_NAMES).toContain("conformance");
    expect(STANDARD_LOOP_NAMES).not.toContain("pr-create");
  });
});

// TC-024b: LOOP_ERROR_CODES — pr-create が含まれない
describe("TC-024: LOOP_ERROR_CODES — pr-create が含まれない", () => {
  it("LOOP_ERROR_CODES keys include conformance and do not include pr-create or delta-spec-validation", () => {
    const keys = Object.keys(LOOP_ERROR_CODES);
    expect(keys).toContain("spec-review");
    expect(keys).toContain("verification");
    expect(keys).toContain("code-review");
    expect(keys).toContain("conformance");
    expect(keys).not.toContain("delta-spec-validation");
    expect(keys).not.toContain("pr-create");
    expect(keys).toHaveLength(4);
  });
});

// TC-008: conformance loop guard → CONFORMANCE_RETRIES_EXHAUSTED
describe("TC-008: conformance loop guard → CONFORMANCE_RETRIES_EXHAUSTED", () => {
  it("conformance が 3 回 needs-fix → CONFORMANCE_RETRIES_EXHAUSTED で escalation", async () => {
    const maxIterations = 3;

    const jobState = makeMinimalState("test-conformance-loop-guard");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();
    let conformanceCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, state: JobState): Promise<JobState> => {
      if (step.name === "conformance") {
        conformanceCallCount++;
        return {
          ...state,
          status: "running",
          step: "conformance",
          steps: {
            ...state.steps,
            "conformance": [
              ...(state.steps?.["conformance"] ?? []),
              {
                attempt: conformanceCallCount,
                sessionId: null,
                outcome: {
                  verdict: "needs-fix" as const,
                  findingsPath: conformanceResultPath("test-slug", conformanceCallCount),
                  error: null,
                },
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
        ["conformance", makeStepObject("conformance")],
      ]),
      transitions: [
        { step: "conformance", on: "approved",  to: "end" },
        { step: "conformance", on: "needs-fix", to: "conformance" },
      ],
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: "conformance",
      loopNames: ["conformance"],
    });

    const result = await pipeline.run("conformance", jobState, makeMinimalDeps());

    expect(result.error?.code).toBe("CONFORMANCE_RETRIES_EXHAUSTED");
    expect(result.error?.message).toBe("conformance did not approve after 3 iterations");
    const conformanceSteps = result.steps?.["conformance"] ?? [];
    const lastStep = conformanceSteps[conformanceSteps.length - 1];
    expect(lastStep?.outcome?.verdict).toBe("escalation");
  });
});

// TC-014: LOOP_ERROR_CODES — conformance cycle
describe("TC-014-conformance: LOOP_ERROR_CODES — conformance cycle", () => {
  it("LOOP_ERROR_CODES['conformance'].code === 'CONFORMANCE_RETRIES_EXHAUSTED'", () => {
    const entry = LOOP_ERROR_CODES["conformance"];
    expect(entry).toBeDefined();
    expect(entry!.code).toBe("CONFORMANCE_RETRIES_EXHAUSTED");
  });

  it("message(3) === 'conformance did not approve after 3 iterations'", () => {
    const entry = LOOP_ERROR_CODES["conformance"];
    expect(entry!.message(3)).toBe("conformance did not approve after 3 iterations");
  });

  it("hint('003') contains 'conformance-result-003.md'", () => {
    const entry = LOOP_ERROR_CODES["conformance"];
    expect(entry!.hint("003")).toContain("conformance-result-003.md");
  });
});

// TC-NEW-05: handleExhausted → status が awaiting-resume になり resumePoint が設定される
describe("TC-NEW-05: handleExhausted → status: awaiting-resume + resumePoint", () => {
  it("loop exhaustion sets status to awaiting-resume with resumePoint", async () => {
    const maxIterations = 2;
    const jobState = makeMinimalState("test-exhausted-resume");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();
    let callCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, state: JobState): Promise<JobState> => {
      if (step.name === "spec-review") {
        callCount++;
        return {
          ...state,
          status: "running",
          step: "spec-review",
          steps: {
            ...state.steps,
            "spec-review": [
              ...(state.steps?.["spec-review"] ?? []),
              {
                attempt: callCount,
                sessionId: null,
                outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      if (step.name === "spec-fixer") {
        return {
          ...state,
          status: "running",
          step: "spec-fixer",
          steps: {
            ...state.steps,
            "spec-fixer": [
              ...(state.steps?.["spec-fixer"] ?? []),
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
        ["spec-review", makeStepObject("spec-review")],
        ["spec-fixer", makeStepObject("spec-fixer")],
      ]),
      transitions: [
        { step: "spec-review", on: "approved",  to: "end" },
        { step: "spec-review", on: "needs-fix", to: "spec-fixer" },
        { step: "spec-review", on: "escalation", to: "escalate" },
        { step: "spec-fixer",  on: "approved",  to: "spec-review" },
        { step: "spec-fixer",  on: "error",     to: "escalate" },
      ],
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review"],
      loopFixerPairs: { "spec-review": "spec-fixer" },
    });

    const result = await pipeline.run("spec-review", jobState, makeMinimalDeps());

    expect(result.status).toBe("awaiting-resume");
    expect(result.resumePoint).toBeDefined();
    // handleExhausted now records the fixer step (spec-fixer) for spec-review exhaustion
    expect(result.resumePoint?.step).toBe("spec-fixer");
    expect(result.resumePoint?.iterationsExhausted).toBe(maxIterations);
  });
});

// TC-NEW-06: Pipeline escalate terminal → awaiting-resume に遷移する
describe("TC-NEW-06: Pipeline escalate terminal → status: awaiting-resume", () => {
  it("escalation verdict results in awaiting-resume status", async () => {
    const maxIterations = 3;
    const jobState = makeMinimalState("test-escalate-resume");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();

    const executeSpy = vi.fn().mockImplementation(async (step: Step, state: JobState): Promise<JobState> => {
      if (step.name === "spec-review") {
        return {
          ...state,
          status: "running",
          step: "spec-review",
          steps: {
            ...state.steps,
            "spec-review": [
              ...(state.steps?.["spec-review"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "escalation" as const, findingsPath: null, error: null },
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
        ["spec-review", makeStepObject("spec-review")],
      ]),
      transitions: [
        { step: "spec-review", on: "approved",   to: "end" },
        { step: "spec-review", on: "needs-fix",  to: "escalate" },
        { step: "spec-review", on: "escalation", to: "escalate" },
      ],
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review"],
    });

    const result = await pipeline.run("spec-review", jobState, makeMinimalDeps());

    expect(result.status).toBe("awaiting-resume");
    expect(result.resumePoint).toBeDefined();
    expect(result.resumePoint?.step).toBe("spec-review");
  });

  it("fatal error code keeps status as failed", async () => {
    const maxIterations = 3;
    const jobState = makeMinimalState("test-fatal-error");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();

    // Executor throws a fatal error
    const executeSpy = vi.fn().mockImplementation(async (_step: Step, state: JobState): Promise<JobState> => {
      const failedState: JobState = {
        ...state,
        status: "failed",
        error: { code: "SESSION_CREATE_FAILED", message: "Session create failed", hint: "Check API key" },
      };
      const err = new Error("Session create failed") as Error & { state?: JobState };
      err.state = failedState;
      throw err;
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["design", makeStepObject("design")],
      ]),
      transitions: [
        { step: "design", on: "success", to: "end" },
        { step: "design", on: "error",   to: "escalate" },
      ],
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review"],
    });

    const result = await pipeline.run("design", jobState, makeMinimalDeps());

    // Fatal error → status stays "failed"
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("SESSION_CREATE_FAILED");
    // resumePoint should NOT be set for fatal errors
    expect(result.resumePoint).toBeUndefined();
  });
});
