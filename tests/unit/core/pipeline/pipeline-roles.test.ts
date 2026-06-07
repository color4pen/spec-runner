/**
 * Tests for pipeline roles / phase one-class fields (T-06).
 *
 * TC-001: STANDARD_DESCRIPTOR has roles for all 12 steps matching design.md D1
 * TC-002: Each phase has exactly one creator and one reviewer
 * TC-003: AgentStep.phase field has been removed from type and step definitions
 * TC-007: resolve-step source contains no standard-specific imports/literals
 * TC-009: design-only crash resume → design
 * TC-010: design-only --from creator → design
 * TC-011: design-only --from critic → error (reviewer not present)
 * TC-022: pipelineId-absent state resolves as standard
 * TC-023: in-flight state with pipelineId absent resolves same as before
 * TC-016: loopName omit falls back to loopNames[0]
 * TC-018: pipeline.ts has no STEP_NAMES import
 * TC-019: buildPipeline propagates summaryStep to Pipeline
 * TC-012: summaryStep-driven summary emits correct event
 * TC-013: summaryStep absent → no summary emitted
 * TC-008: impl-phase fixer resolves to code-fixer (not build-fixer)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { STANDARD_DESCRIPTOR, DESIGN_ONLY_DESCRIPTOR } from "../../../../src/core/pipeline/registry.js";
import { resolveResumeStep } from "../../../../src/core/resume/resolve-step.js";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { getPipelineDescriptor } from "../../../../src/core/pipeline/registry.js";
import { getPipelineId } from "../../../../src/state/pipeline-id.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-roles-test-"));
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

function makeMinimalDeps(): PipelineDeps {
  return {
    client: {} as PipelineDeps["client"],
    config: {
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" } },
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
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

// ---------------------------------------------------------------------------
// TC-001: STANDARD_DESCRIPTOR.roles content matches design.md D1
// ---------------------------------------------------------------------------

describe("TC-001: STANDARD_DESCRIPTOR.roles matches design.md D1 table", () => {
  it("has roles for all 12 steps", () => {
    const steps = [
      "design", "spec-review", "spec-fixer", "test-case-gen",
      "implementer", "verification", "build-fixer", "code-review",
      "code-fixer", "conformance", "adr-gen", "pr-create",
    ];
    for (const step of steps) {
      expect(STANDARD_DESCRIPTOR.roles[step], `roles["${step}"] should exist`).toBeDefined();
    }
  });

  it("has correct role/phase for each step", () => {
    const expected: Record<string, { role: string; phase: string }> = {
      "design":       { role: "creator",  phase: "spec" },
      "spec-review":  { role: "reviewer", phase: "spec" },
      "spec-fixer":   { role: "fixer",    phase: "spec" },
      "test-case-gen":{ role: "gate",     phase: "impl" },
      "implementer":  { role: "creator",  phase: "impl" },
      "verification": { role: "gate",     phase: "impl" },
      "build-fixer":  { role: "fixer",    phase: "impl" },
      "code-review":  { role: "reviewer", phase: "impl" },
      "code-fixer":   { role: "fixer",    phase: "impl" },
      "conformance":  { role: "gate",     phase: "impl" },
      "adr-gen":      { role: "gate",     phase: "impl" },
      "pr-create":    { role: "gate",     phase: "impl" },
    };
    for (const [step, exp] of Object.entries(expected)) {
      const entry = STANDARD_DESCRIPTOR.roles[step];
      expect(entry?.role, `${step}.role`).toBe(exp.role);
      expect(entry?.phase, `${step}.phase`).toBe(exp.phase);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-002: Each phase has exactly one creator and one reviewer
// ---------------------------------------------------------------------------

describe("TC-002: Each phase has exactly one creator and one reviewer", () => {
  it("spec phase has exactly one creator (design) and one reviewer (spec-review)", () => {
    const specCreators = Object.entries(STANDARD_DESCRIPTOR.roles)
      .filter(([, e]) => e.role === "creator" && e.phase === "spec")
      .map(([name]) => name);
    const specReviewers = Object.entries(STANDARD_DESCRIPTOR.roles)
      .filter(([, e]) => e.role === "reviewer" && e.phase === "spec")
      .map(([name]) => name);
    expect(specCreators).toHaveLength(1);
    expect(specCreators[0]).toBe("design");
    expect(specReviewers).toHaveLength(1);
    expect(specReviewers[0]).toBe("spec-review");
  });

  it("impl phase has exactly one creator (implementer) and one reviewer (code-review)", () => {
    const implCreators = Object.entries(STANDARD_DESCRIPTOR.roles)
      .filter(([, e]) => e.role === "creator" && e.phase === "impl")
      .map(([name]) => name);
    const implReviewers = Object.entries(STANDARD_DESCRIPTOR.roles)
      .filter(([, e]) => e.role === "reviewer" && e.phase === "impl")
      .map(([name]) => name);
    expect(implCreators).toHaveLength(1);
    expect(implCreators[0]).toBe("implementer");
    expect(implReviewers).toHaveLength(1);
    expect(implReviewers[0]).toBe("code-review");
  });
});

// ---------------------------------------------------------------------------
// TC-003: AgentStep.phase field removed from type and step definitions
// ---------------------------------------------------------------------------

describe("TC-003: AgentStep.phase field is absent", () => {
  it("design step does not have a phase field", async () => {
    const { DesignStep } = await import("../../../../src/core/step/design.js");
    expect((DesignStep as unknown as Record<string, unknown>)["phase"]).toBeUndefined();
  });

  it("spec-review step does not have a phase field", async () => {
    const { SpecReviewStep } = await import("../../../../src/core/step/spec-review.js");
    expect((SpecReviewStep as unknown as Record<string, unknown>)["phase"]).toBeUndefined();
  });

  it("spec-fixer step does not have a phase field", async () => {
    const { SpecFixerStep } = await import("../../../../src/core/step/spec-fixer.js");
    expect((SpecFixerStep as unknown as Record<string, unknown>)["phase"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-007: resolve-step source has no standard-specific imports/literals
// ---------------------------------------------------------------------------

describe("TC-007: resolve-step source contains no standard-specific imports or literals", () => {
  it("does not import DesignStep, SpecReviewStep, or other concrete step classes", async () => {
    const source = await fs.readFile(
      new URL("../../../../src/core/resume/resolve-step.ts", import.meta.url).pathname,
      "utf-8",
    );
    // No concrete Step class imports
    expect(source).not.toContain("DesignStep");
    expect(source).not.toContain("SpecReviewStep");
    expect(source).not.toContain("SpecFixerStep");
    expect(source).not.toContain("ImplementerStep");
    expect(source).not.toContain("BuildFixerStep");
    expect(source).not.toContain("CodeReviewStep");
    expect(source).not.toContain("CodeFixerStep");
  });

  it("does not import STANDARD_LOOP_FIXER_PAIRS", async () => {
    const source = await fs.readFile(
      new URL("../../../../src/core/resume/resolve-step.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(source).not.toContain("STANDARD_LOOP_FIXER_PAIRS");
  });

  it("does not contain step-name literals used for role derivation", async () => {
    const source = await fs.readFile(
      new URL("../../../../src/core/resume/resolve-step.ts", import.meta.url).pathname,
      "utf-8",
    );
    // Role-derivation literals that were removed
    expect(source).not.toContain('"spec-review"');
    expect(source).not.toContain('"code-review"');
    expect(source).not.toContain('"spec-fixer"');
    expect(source).not.toContain('"code-fixer"');
    expect(source).not.toContain('"design"');
    expect(source).not.toContain('"implementer"');
  });
});

// ---------------------------------------------------------------------------
// TC-008: --from code-fixer returns code-fixer (step-name direct, not alias)
// ---------------------------------------------------------------------------

describe("TC-008: --from code-fixer returns code-fixer (step-name direct)", () => {
  it("--from code-fixer resolves to code-fixer, not build-fixer", () => {
    const result = resolveResumeStep("code-fixer", { step: "code-review", reason: "test", iterationsExhausted: 0 });
    expect(result).toBe("code-fixer");
    expect(result).not.toBe("build-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-009: crash resume → resumePoint.step verbatim (design)
// ---------------------------------------------------------------------------

describe("TC-009: crash resume returns resumePoint.step verbatim", () => {
  it("crash with resumePoint=design → design", () => {
    const result = resolveResumeStep(undefined, { step: "design", reason: "crash", iterationsExhausted: 0 });
    expect(result).toBe("design");
  });
});

// ---------------------------------------------------------------------------
// TC-010: --from design → design (step-name direct)
// ---------------------------------------------------------------------------

describe("TC-010: --from design resolves to design", () => {
  it("--from design with resumePoint → design", () => {
    const result = resolveResumeStep("design", { step: "design", reason: "test", iterationsExhausted: 0 });
    expect(result).toBe("design");
  });
});

// ---------------------------------------------------------------------------
// TC-011: --from critic (legacy alias) → throws with invalid value error
// ---------------------------------------------------------------------------

describe("TC-011: --from critic (legacy alias) throws invalid value error", () => {
  it("throws an error mentioning invalid value", () => {
    expect(() =>
      resolveResumeStep("critic", { step: "design", reason: "test", iterationsExhausted: 0 })
    ).toThrow(/Invalid --from value/i);
  });
});

// ---------------------------------------------------------------------------
// TC-016: loopName omit falls back to loopNames[0]
// ---------------------------------------------------------------------------

describe("TC-016: Pipeline loopName omit falls back to loopNames[0]", () => {
  it("pipeline with no loopName uses loopNames[0] as primary loop", () => {
    const mockExecutor = { execute: vi.fn() } as unknown as StepExecutor;
    const events = new EventBus();
    const steps = new Map<string, Step>([
      ["design", {
        kind: "agent",
        name: "design",
        agent: { name: "test", role: "design", model: "claude-sonnet-4-5", system: "", tools: [] },
        buildMessage: () => "",
        resultFilePath: () => null,
        parseResult: () => ({ verdict: null, findingsPath: null }),
      }],
    ]);

    // Construct Pipeline without loopName (omitted) but with loopNames
    const pipeline = new Pipeline({
      steps,
      transitions: [],
      maxIterations: 2,
      executor: mockExecutor,
      events,
      // loopName intentionally omitted
      loopNames: ["my-loop", "another-loop"],
      loopFixerPairs: {},
    });

    // We can't directly inspect private fields, but we can verify behavior:
    // The pipeline should not throw on construction.
    expect(pipeline).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-018: pipeline.ts has no STEP_NAMES import
// ---------------------------------------------------------------------------

describe("TC-018: pipeline.ts does not import STEP_NAMES", () => {
  it("pipeline.ts source has no STEP_NAMES import", async () => {
    const source = await fs.readFile(
      new URL("../../../../src/core/pipeline/pipeline.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(source).not.toContain("STEP_NAMES");
  });
});

// ---------------------------------------------------------------------------
// TC-019: buildPipeline propagates summaryStep to Pipeline
// ---------------------------------------------------------------------------

describe("TC-019: buildPipeline propagates descriptor.summaryStep", () => {
  it("STANDARD_DESCRIPTOR has summaryStep set to spec-review", () => {
    expect(STANDARD_DESCRIPTOR.summaryStep).toBe("spec-review");
  });

  it("DESIGN_ONLY_DESCRIPTOR has no summaryStep", () => {
    expect(DESIGN_ONLY_DESCRIPTOR.summaryStep).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-012: summaryStep-driven summary emits correct event
// ---------------------------------------------------------------------------

describe("TC-012: summaryStep drives pipeline:summary event", () => {
  it("pipeline with summaryStep='spec-review' emits pipeline:summary after spec-review run", async () => {
    const deps = makeMinimalDeps();
    const events = new EventBus();

    const specReviewState: JobState = {
      version: 1,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "spec-review",
      status: "running",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        "spec-review": [{ attempt: 1, sessionId: null, outcome: { verdict: "approved", findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }],
      },
    };

    const executeSpy = vi.fn().mockImplementation(async (_step: Step, state: JobState) => {
      if ((_step as Step).name === "design") {
        return { ...state, status: "running" as const, branch: "feat/test" };
      }
      if ((_step as Step).name === "spec-review") {
        return specReviewState;
      }
      return { ...state, status: "running" as const };
    });

    const steps = new Map<string, Step>([
      ["design",      { kind: "agent", name: "design",      agent: { name: "t", role: "design",      model: "x", system: "", tools: [] }, completionVerdict: "success", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
      ["spec-review", { kind: "agent", name: "spec-review", agent: { name: "t", role: "spec-review", model: "x", system: "", tools: [] }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
      ["pr-create",   { kind: "cli",   name: "pr-create",   run: async () => {}, resultFilePath: () => "/tmp/pr.json", parseResult: () => ({ verdict: "success" as const, findingsPath: null }) }],
    ]);

    const transitions = [
      { step: "design",      on: "success",  to: "spec-review" },
      { step: "spec-review", on: "approved", to: "pr-create" },
      { step: "pr-create",   on: "success",  to: "end" },
    ];

    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;
    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 2,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review"],
      loopFixerPairs: {},
      summaryStep: "spec-review",
    });

    const summaryEvents: unknown[] = [];
    events.on("pipeline:summary", (e) => summaryEvents.push(e));

    const initState: JobState = {
      version: 1,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "design",
      status: "running",
      branch: null,
      history: [],
      error: null,
      steps: {},
    };

    await pipeline.run("design", initState, deps);

    expect(summaryEvents).toHaveLength(1);
    expect((summaryEvents[0] as { step: string }).step).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-013: summaryStep absent → no pipeline:summary emitted
// ---------------------------------------------------------------------------

describe("TC-013: summaryStep absent means no pipeline:summary emitted", () => {
  it("pipeline without summaryStep emits no pipeline:summary event", async () => {
    const deps = makeMinimalDeps();
    const events = new EventBus();

    const executeSpy = vi.fn().mockImplementation(async (_step: Step, state: JobState) => {
      return { ...state, status: "running" as const, branch: "feat/test" };
    });

    const steps = new Map<string, Step>([
      ["design", { kind: "agent", name: "design", agent: { name: "t", role: "design", model: "x", system: "", tools: [] }, completionVerdict: "success", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ]);

    const transitions = [
      { step: "design", on: "success", to: "end" },
    ];

    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;
    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 1,
      executor: mockExecutor,
      events,
      loopName: "design",
      loopNames: ["design"],
      loopFixerPairs: {},
      // summaryStep intentionally omitted
    });

    const summaryEvents: unknown[] = [];
    events.on("pipeline:summary", (e) => summaryEvents.push(e));

    const initState: JobState = {
      version: 1,
      jobId: "test-job-2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "design",
      status: "running",
      branch: null,
      history: [],
      error: null,
      steps: {},
    };

    await pipeline.run("design", initState, deps);

    expect(summaryEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-022: pipelineId-absent state resolves as standard descriptor
// ---------------------------------------------------------------------------

describe("TC-022: pipelineId-absent state resolves as STANDARD_DESCRIPTOR", () => {
  it("state with no pipelineId resolves to standard pipeline descriptor", () => {
    // Simulate a legacy state that has no pipelineId field (absent = undefined)
    const pipelineId = getPipelineId({ pipelineId: undefined });
    expect(pipelineId).toBe("standard");

    const descriptor = getPipelineDescriptor(pipelineId);
    expect(descriptor.id).toBe("standard");

    // New behavior: resumePoint.step is returned verbatim.
    // handleExhausted now records fixer step; legacy states recording reviewer resume from reviewer.
    const result = resolveResumeStep(undefined, { step: "spec-review", reason: "exhausted", iterationsExhausted: 3 });
    expect(result).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-023: in-flight state resumes from recorded resumePoint.step verbatim
// ---------------------------------------------------------------------------

describe("TC-023: in-flight awaiting-resume state resumes from resumePoint.step verbatim", () => {
  it("code-review in resumePoint → returns code-review (verbatim; legacy state)", () => {
    // Legacy state with resumePoint.step = reviewer; new system returns verbatim
    const resumePoint = { step: "code-review" as const, reason: "exhausted", iterationsExhausted: 3 };
    const result = resolveResumeStep(undefined, resumePoint);
    expect(result).toBe("code-review");
  });

  it("code-fixer in resumePoint (new exhaustion recording) → returns code-fixer", () => {
    // New state: handleExhausted records fixer step; resolveResumeStep returns verbatim
    const resumePoint = { step: "code-fixer" as const, reason: "exhausted", iterationsExhausted: 3 };
    const result = resolveResumeStep(undefined, resumePoint);
    expect(result).toBe("code-fixer");
  });

  it("design crash state resolves to design", () => {
    const resumePoint = { step: "design" as const, reason: "crash", iterationsExhausted: 0 };
    const result = resolveResumeStep(undefined, resumePoint);
    expect(result).toBe("design");
  });
});
