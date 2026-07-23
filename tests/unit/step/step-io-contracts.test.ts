/**
 * Unit tests for step reads/writes declarations (T-03, T-07)
 * Verifies:
 * - All standard steps implement reads/writes
 * - Paths are derived from util/paths (no hardcoded new path strings)
 * - Fixer reads match producer resultFilePath
 * - Iteration resolution correctness
 */
import { describe, it, expect } from "vitest";
import { DesignStep } from "../../../src/core/step/design.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { TestCaseGenStep } from "../../../src/core/step/test-case-gen.js";
import { TestMaterializeStep } from "../../../src/core/step/test-materialize.js";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import { VerificationStep } from "../../../src/core/step/verification.js";
import { BuildFixerStep } from "../../../src/core/step/build-fixer.js";
import { CodeReviewStep } from "../../../src/core/step/code-review.js";
import { CodeFixerStep } from "../../../src/core/step/code-fixer.js";
import { ConformanceStep } from "../../../src/core/step/conformance.js";
import { AdrGenStep } from "../../../src/core/step/adr-gen.js";
import { PrCreateStep } from "../../../src/core/step/pr-create.js";
import type { Step } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import {
  requestMdPath,
  changeFolderPath,
  specReviewResultPath,
  reviewFeedbackPath,
  verificationResultPath,
  conformanceResultPath,
  prCreateResultPath,
} from "../../../src/util/paths.js";

const ALL_STEPS: Step[] = [
  DesignStep,
  SpecReviewStep,
  SpecFixerStep,
  TestCaseGenStep,
  TestMaterializeStep,
  ImplementerStep,
  VerificationStep,
  BuildFixerStep,
  CodeReviewStep,
  CodeFixerStep,
  ConformanceStep,
  AdrGenStep,
  PrCreateStep,
];

const SLUG = "my-change";

function makeState(stepCounts: Record<string, number> = {}, branch = "feat/my-change"): JobState {
  const steps: JobState["steps"] = {};
  for (const [name, count] of Object.entries(stepCounts)) {
    steps[name] = Array.from({ length: count }, (_, i) => ({
      attempt: i + 1,
      sessionId: null,
      outcome: { verdict: null, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
    }));
  }
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch,
    history: [],
    error: null,
    steps,
  };
}

function makeDeps(overrides: Partial<StepDeps> = {}): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "spec-change",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "Test request.",
      adr: true,
    },
    slug: SLUG,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// All 12 steps implement reads/writes
// ---------------------------------------------------------------------------

describe("All 12 standard steps implement reads and writes", () => {
  const state = makeState();
  const deps = makeDeps();

  for (const step of ALL_STEPS) {
    it(`${step.name} has reads() method`, () => {
      expect(typeof step.reads).toBe("function");
    });

    it(`${step.name} has writes() method`, () => {
      expect(typeof step.writes).toBe("function");
    });

    it(`${step.name}.reads() returns IoRef[]`, () => {
      const result = step.reads!(state, deps);
      expect(Array.isArray(result)).toBe(true);
      for (const ref of result) {
        expect(typeof ref.path).toBe("string");
        if (ref.required !== undefined) expect(typeof ref.required).toBe("boolean");
        if (ref.artifact !== undefined) expect(["file", "gitState"]).toContain(ref.artifact);
      }
    });

    it(`${step.name}.writes() returns IoRef[]`, () => {
      const result = step.writes!(state, deps);
      expect(Array.isArray(result)).toBe(true);
      for (const ref of result) {
        expect(typeof ref.path).toBe("string");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// design step
// ---------------------------------------------------------------------------

describe("DesignStep reads/writes", () => {
  it("reads request.md", () => {
    const refs = DesignStep.reads!(makeState(), makeDeps());
    const paths = refs.map(r => r.path);
    expect(paths).toContain(requestMdPath(SLUG));
  });

  it("writes design.md, tasks.md, spec.md", () => {
    const refs = DesignStep.writes!(makeState(), makeDeps());
    const paths = refs.map(r => r.path);
    const folder = changeFolderPath(SLUG);
    expect(paths).toContain(`${folder}/design.md`);
    expect(paths).toContain(`${folder}/tasks.md`);
    expect(paths).toContain(`${folder}/spec.md`);
  });
});

// ---------------------------------------------------------------------------
// spec-review step
// ---------------------------------------------------------------------------

describe("SpecReviewStep reads/writes", () => {
  it("reads spec.md, design.md, tasks.md", () => {
    const refs = SpecReviewStep.reads!(makeState(), makeDeps());
    const paths = refs.map(r => r.path);
    const folder = changeFolderPath(SLUG);
    expect(paths).toContain(`${folder}/spec.md`);
    expect(paths).toContain(`${folder}/design.md`);
    expect(paths).toContain(`${folder}/tasks.md`);
  });

  it("writes spec-review-result at next iteration", () => {
    const state = makeState({ "spec-review": 1 });
    const refs = SpecReviewStep.writes!(state, makeDeps());
    expect(refs.map(r => r.path)).toContain(specReviewResultPath(SLUG, 2));
  });

  it("writes spec-review-result-001.md on first run", () => {
    const refs = SpecReviewStep.writes!(makeState(), makeDeps());
    expect(refs.map(r => r.path)).toContain(specReviewResultPath(SLUG, 1));
  });
});

// ---------------------------------------------------------------------------
// spec-fixer step (D4 reads = producer's result)
// ---------------------------------------------------------------------------

describe("SpecFixerStep reads/writes", () => {
  it("reads spec-review-result at latestIteration of spec-review", () => {
    const state = makeState({ "spec-review": 2 });
    const refs = SpecFixerStep.reads!(state, makeDeps());
    expect(refs.map(r => r.path)).toContain(specReviewResultPath(SLUG, 2));
  });

  it("reads spec-review-result-000.md when spec-review has not run", () => {
    const state = makeState({});
    const refs = SpecFixerStep.reads!(state, makeDeps());
    expect(refs.map(r => r.path)).toContain(specReviewResultPath(SLUG, 0));
  });

  it("reads path matches spec-review resultFilePath for same iteration", () => {
    const state = makeState({ "spec-review": 1 });
    const deps = makeDeps();
    const fixerReads = SpecFixerStep.reads!(state, deps).map(r => r.path);
    // spec-review resultFilePath uses nextIteration logic: iteration = past count + 1
    // When spec-review has run once, the result is at iteration 1
    // spec-fixer reads latestIteration = 1 → same path
    expect(fixerReads).toContain(specReviewResultPath(SLUG, 1));
  });

  it("writes design.md, spec.md, and tasks.md", () => {
    const refs = SpecFixerStep.writes!(makeState(), makeDeps());
    const paths = refs.map(r => r.path);
    const folder = changeFolderPath(SLUG);
    expect(paths).toContain(`${folder}/design.md`);
    expect(paths).toContain(`${folder}/spec.md`);
    expect(paths).toContain(`${folder}/tasks.md`);
  });

  it("all reads are required by default", () => {
    const refs = SpecFixerStep.reads!(makeState({ "spec-review": 1 }), makeDeps());
    for (const ref of refs) {
      expect(ref.required).not.toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// code-review step
// ---------------------------------------------------------------------------

describe("CodeReviewStep reads/writes", () => {
  it("reads design.md, tasks.md, test-cases.md, and gitState", () => {
    const refs = CodeReviewStep.reads!(makeState(), makeDeps());
    const paths = refs.map(r => r.path);
    const folder = changeFolderPath(SLUG);
    expect(paths).toContain(`${folder}/design.md`);
    expect(paths).toContain(`${folder}/tasks.md`);
    expect(paths).toContain(`${folder}/test-cases.md`);
    const gitRefs = refs.filter(r => r.artifact === "gitState");
    expect(gitRefs.length).toBeGreaterThan(0);
  });

  // T-07: test-cases.md must be a soft (optional) read after T-01 change
  it("test-cases.md read is soft (required: false)", () => {
    const refs = CodeReviewStep.reads!(makeState(), makeDeps());
    const folder = changeFolderPath(SLUG);
    const testCasesRef = refs.find(r => r.path === `${folder}/test-cases.md`);
    expect(testCasesRef).toBeDefined();
    expect(testCasesRef?.required).toBe(false);
  });

  // T-07: design.md and tasks.md must remain required reads
  it("design.md and tasks.md reads are required (not soft)", () => {
    const refs = CodeReviewStep.reads!(makeState(), makeDeps());
    const folder = changeFolderPath(SLUG);
    const designRef = refs.find(r => r.path === `${folder}/design.md`);
    const tasksRef = refs.find(r => r.path === `${folder}/tasks.md`);
    expect(designRef?.required).not.toBe(false);
    expect(tasksRef?.required).not.toBe(false);
  });

  it("writes review-feedback at next iteration", () => {
    const state = makeState({ "code-review": 1 });
    const refs = CodeReviewStep.writes!(state, makeDeps());
    expect(refs.map(r => r.path)).toContain(reviewFeedbackPath(SLUG, 2));
  });
});

// ---------------------------------------------------------------------------
// code-fixer step (D4 reads = producer's result)
// ---------------------------------------------------------------------------

describe("CodeFixerStep reads/writes", () => {
  it("reads review-feedback at latestIteration of code-review", () => {
    const state = makeState({ "code-review": 2 });
    const refs = CodeFixerStep.reads!(state, makeDeps());
    expect(refs.map(r => r.path)).toContain(reviewFeedbackPath(SLUG, 2));
  });

  it("reads path matches code-review resultFilePath for same state", () => {
    // When code-review has run twice, result is at iteration 2.
    // code-fixer reads latestIteration = 2 → same path.
    const state = makeState({ "code-review": 2 });
    const deps = makeDeps();
    const fixerReadPath = CodeFixerStep.reads!(state, deps)[0]?.path;
    // Simulate what code-review.resultFilePath would return at iteration 2
    expect(fixerReadPath).toBe(reviewFeedbackPath(SLUG, 2));
  });

  it("reads review-feedback-000.md when code-review has not run", () => {
    const state = makeState({});
    const refs = CodeFixerStep.reads!(state, makeDeps());
    expect(refs.map(r => r.path)).toContain(reviewFeedbackPath(SLUG, 0));
  });

  it("writes gitState", () => {
    const refs = CodeFixerStep.writes!(makeState(), makeDeps());
    const gitRefs = refs.filter(r => r.artifact === "gitState");
    expect(gitRefs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// build-fixer step (D4 reads = producer's result)
// ---------------------------------------------------------------------------

describe("BuildFixerStep reads/writes", () => {
  it("reads verification-result.md (no iteration)", () => {
    const refs = BuildFixerStep.reads!(makeState(), makeDeps());
    expect(refs.map(r => r.path)).toContain(verificationResultPath(SLUG));
  });

  it("reads path matches verificationResultPath", () => {
    const refs = BuildFixerStep.reads!(makeState(), makeDeps());
    expect(refs[0]?.path).toBe(verificationResultPath(SLUG));
  });

  it("writes gitState", () => {
    const refs = BuildFixerStep.writes!(makeState(), makeDeps());
    const gitRefs = refs.filter(r => r.artifact === "gitState");
    expect(gitRefs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// verification step
// ---------------------------------------------------------------------------

describe("VerificationStep reads/writes", () => {
  it("reads gitState", () => {
    const refs = VerificationStep.reads!(makeState(), makeDeps());
    const gitRefs = refs.filter(r => r.artifact === "gitState");
    expect(gitRefs.length).toBeGreaterThan(0);
  });

  it("writes verification-result.md", () => {
    const refs = VerificationStep.writes!(makeState(), makeDeps());
    expect(refs.map(r => r.path)).toContain(verificationResultPath(SLUG));
  });
});

// ---------------------------------------------------------------------------
// conformance step
// ---------------------------------------------------------------------------

describe("ConformanceStep reads/writes", () => {
  it("reads tasks.md, design.md, spec.md, request.md", () => {
    const refs = ConformanceStep.reads!(makeState(), makeDeps());
    const paths = refs.map(r => r.path);
    const folder = changeFolderPath(SLUG);
    expect(paths).toContain(`${folder}/tasks.md`);
    expect(paths).toContain(`${folder}/design.md`);
    expect(paths).toContain(`${folder}/spec.md`);
    expect(paths).toContain(requestMdPath(SLUG));
  });

  it("writes conformance-result at next iteration", () => {
    const state = makeState({ "conformance": 1 });
    const refs = ConformanceStep.writes!(state, makeDeps());
    expect(refs.map(r => r.path)).toContain(conformanceResultPath(SLUG, 2));
  });
});

// ---------------------------------------------------------------------------
// adr-gen step
// ---------------------------------------------------------------------------

describe("AdrGenStep reads/writes", () => {
  it("reads request.md, design.md, spec.md (required)", () => {
    const refs = AdrGenStep.reads!(makeState(), makeDeps());
    const paths = refs.map(r => r.path);
    const folder = changeFolderPath(SLUG);
    expect(paths).toContain(requestMdPath(SLUG));
    expect(paths).toContain(`${folder}/design.md`);
    expect(paths).toContain(`${folder}/spec.md`);
  });

  it("includes review-feedback as optional when code-review has run", () => {
    const state = makeState({ "code-review": 1 });
    const refs = AdrGenStep.reads!(state, makeDeps());
    const reviewRef = refs.find(r => r.path.includes("review-feedback"));
    expect(reviewRef).toBeDefined();
    expect(reviewRef?.required).toBe(false);
  });

  it("does not include review-feedback when code-review has not run", () => {
    const state = makeState({});
    const refs = AdrGenStep.reads!(state, makeDeps());
    const reviewRef = refs.find(r => r.path.includes("review-feedback"));
    expect(reviewRef).toBeUndefined();
  });

  it("writes adr artifact when adr: true", () => {
    const deps = makeDeps({ request: { type: "spec-change", title: "Test", slug: SLUG, baseBranch: "main", content: "", adr: true } });
    const refs = AdrGenStep.writes!(makeState(), deps);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]?.path).toContain(SLUG);
  });

  it("writes empty array when adr: false", () => {
    const deps = makeDeps({ request: { type: "spec-change", title: "Test", slug: SLUG, baseBranch: "main", content: "", adr: false } });
    const refs = AdrGenStep.writes!(makeState(), deps);
    expect(refs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pr-create step
// ---------------------------------------------------------------------------

describe("PrCreateStep reads/writes", () => {
  it("reads gitState (branch) when branch is set", () => {
    const state = makeState({}, "feat/my-change");
    const refs = PrCreateStep.reads!(state, makeDeps());
    const gitRefs = refs.filter(r => r.artifact === "gitState");
    expect(gitRefs.length).toBeGreaterThan(0);
  });

  it("reads empty array when branch is not set", () => {
    const state = makeState({}, null as unknown as string);
    state.branch = null;
    const refs = PrCreateStep.reads!(state, makeDeps());
    expect(refs).toHaveLength(0);
  });

  it("writes pr-create-result.md", () => {
    const refs = PrCreateStep.writes!(makeState(), makeDeps());
    expect(refs.map(r => r.path)).toContain(prCreateResultPath(SLUG));
  });
});

// ---------------------------------------------------------------------------
// T-07: fixer reads = producer resultFilePath equivalence
// ---------------------------------------------------------------------------

describe("T-07: fixer reads paths match producer resultFilePath", () => {
  it("code-fixer.reads path matches code-review.resultFilePath at same iteration", () => {
    const state = makeState({ "code-review": 1 });
    const deps = makeDeps();
    // code-review resultFilePath uses nextIteration for the NEXT run
    // but code-fixer reads the LATEST (already completed) run
    // If code-review has run once, its result is at iteration 1.
    // code-review.resultFilePath: nextIteration(state, "code-review") = 2 (for the NEXT run)
    // code-fixer.reads: latestIteration(state, "code-review") = 1 (the last completed)
    // → They match when code-review has just completed (iteration count = 1)
    const codeReviewResultPath = reviewFeedbackPath(SLUG, 1); // iteration=1, already run
    const fixerReads = CodeFixerStep.reads!(state, deps).map(r => r.path);
    expect(fixerReads).toContain(codeReviewResultPath);
  });

  it("build-fixer.reads path matches verificationResultPath (no iteration)", () => {
    const state = makeState({ "verification": 1 });
    const deps = makeDeps();
    const verPath = verificationResultPath(SLUG);
    const fixerReads = BuildFixerStep.reads!(state, deps).map(r => r.path);
    expect(fixerReads).toContain(verPath);
  });

  it("spec-fixer.reads path matches spec-review.resultFilePath for same iteration", () => {
    // spec-review completed once → result at iteration 1
    // spec-fixer reads latestIteration = 1 → same path
    const state = makeState({ "spec-review": 1 });
    const deps = makeDeps();
    const specReviewPath = specReviewResultPath(SLUG, 1);
    const fixerReads = SpecFixerStep.reads!(state, deps).map(r => r.path);
    expect(fixerReads).toContain(specReviewPath);
  });
});
