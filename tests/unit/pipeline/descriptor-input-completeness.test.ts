/**
 * T-06: Unit tests for validateDescriptorInputCompleteness
 *
 * Tests:
 * 1. Producer-absent fixture → violation for the dependent step + path
 * 2. All base descriptors in PIPELINE_REGISTRY are input-complete (static test)
 * 3. fast descriptor is input-complete after T-01/T-02 (test-cases.md soft)
 * 4. Loop-back reads (fixer reads reviewer result) do not produce violations
 * 5. Fulfilled descriptor returns empty array
 */
import { describe, it, expect } from "vitest";
import {
  validateDescriptorInputCompleteness,
  VALIDATOR_PROBE_SLUG,
  type DescriptorInputViolation,
} from "../../../src/core/pipeline/descriptor-input-completeness.js";
import {
  PIPELINE_REGISTRY,
  STANDARD_DESCRIPTOR,
  FAST_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
} from "../../../src/core/pipeline/registry.js";
import type { PipelineDescriptor } from "../../../src/core/pipeline/types.js";
import type { Step } from "../../../src/core/step/types.js";
import { requestMdPath, changeFolderPath } from "../../../src/util/paths.js";

// ---------------------------------------------------------------------------
// Ambient inputs used in all tests (same as pipeline-run.ts prepare())
// Uses VALIDATOR_PROBE_SLUG because the validator internally uses the same slug.
// ---------------------------------------------------------------------------

const AMBIENT = [requestMdPath(VALIDATOR_PROBE_SLUG)];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PipelineDescriptor from a steps array (no transitions needed for validator).
 */
function makeDescriptor(steps: (readonly [string, Step])[]): PipelineDescriptor {
  return {
    id: "test-fixture",
    steps,
    transitions: [],
    loopName: "test",
    loopNames: ["test"],
    loopFixerPairs: {},
    startStep: steps[0]?.[0] ?? "test",
    roles: {},
  };
}

/**
 * Minimal step that reads nothing and writes nothing.
 */
const noopStep: Step = {
  kind: "agent",
  name: "noop",
  agent: { name: "noop", role: "noop" as never, model: "claude-sonnet-4-6", system: "", tools: [] },
  buildMessage: () => "",
  resultFilePath: () => null,
  parseResult: () => ({ verdict: null, findingsPath: null }),
  reads: () => [],
  writes: () => [],
};

// ---------------------------------------------------------------------------
// T-06-1: Producer-absent fixture → violation
// ---------------------------------------------------------------------------

describe("T-06-1: producer-absent fixture produces violation", () => {
  const folder = changeFolderPath(VALIDATOR_PROBE_SLUG);
  const testCasesPath = `${folder}/test-cases.md`;

  /**
   * A step that requires test-cases.md as a mandatory read.
   * Simulates code-review BEFORE the T-01 soft-input fix.
   */
  const consumerStep: Step = {
    ...noopStep,
    name: "consumer",
    reads: () => [{ path: testCasesPath }], // required: true (default)
    writes: () => [],
  };

  /**
   * Descriptor with only the consumer — no producer of test-cases.md.
   * Ambient inputs do NOT include test-cases.md.
   */
  const descriptor = makeDescriptor([["consumer", consumerStep]]);

  it("returns a violation when test-cases.md producer is absent", () => {
    const violations = validateDescriptorInputCompleteness(descriptor, AMBIENT);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("violation identifies the consumer step name", () => {
    const violations = validateDescriptorInputCompleteness(descriptor, AMBIENT);
    const v = violations.find((x) => x.step === "consumer");
    expect(v).toBeDefined();
  });

  it("violation identifies the missing test-cases.md path", () => {
    const violations = validateDescriptorInputCompleteness(descriptor, AMBIENT);
    const v = violations.find((x) => x.path === testCasesPath);
    expect(v).toBeDefined();
  });

  it("adding the producer upstream resolves the violation", () => {
    const producerStep: Step = {
      ...noopStep,
      name: "producer",
      reads: () => [],
      writes: () => [{ path: testCasesPath }],
    };
    const withProducer = makeDescriptor([
      ["producer", producerStep],
      ["consumer", consumerStep],
    ]);
    const violations = validateDescriptorInputCompleteness(withProducer, AMBIENT);
    expect(violations).toHaveLength(0);
  });

  it("marking the read as soft (required: false) also resolves the violation", () => {
    const softConsumer: Step = {
      ...consumerStep,
      reads: () => [{ path: testCasesPath, required: false }],
    };
    const descriptor2 = makeDescriptor([["consumer", softConsumer]]);
    const violations = validateDescriptorInputCompleteness(descriptor2, AMBIENT);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-06-2: Static test — all base descriptors in PIPELINE_REGISTRY are input-complete
// ---------------------------------------------------------------------------

describe("T-06-2: PIPELINE_REGISTRY base descriptors are input-complete", () => {
  for (const [pipelineId, descriptor] of Object.entries(PIPELINE_REGISTRY)) {
    it(`${pipelineId} has no input-completeness violations`, () => {
      const violations = validateDescriptorInputCompleteness(descriptor, AMBIENT);
      if (violations.length > 0) {
        const details = violations.map((v) => `  [${v.step}] ${v.path}`).join("\n");
        throw new Error(`${pipelineId} has input violations:\n${details}`);
      }
      expect(violations).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// T-06-3: fast descriptor is explicitly input-complete after T-01/T-02 changes
// ---------------------------------------------------------------------------

describe("T-06-3: fast descriptor is input-complete (test-cases.md is soft in code-review)", () => {
  it("FAST_DESCRIPTOR has no violations", () => {
    const violations = validateDescriptorInputCompleteness(FAST_DESCRIPTOR, AMBIENT);
    expect(violations).toHaveLength(0);
  });

  it("fast descriptor has no test-cases.md violation specifically", () => {
    const violations = validateDescriptorInputCompleteness(FAST_DESCRIPTOR, AMBIENT);
    const testCasesViolation = violations.find((v) => v.path.includes("test-cases.md"));
    expect(testCasesViolation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-06-4: Loop-back reads (fixer reads reviewer output) are not violations
// ---------------------------------------------------------------------------

describe("T-06-4: loop-back reads are not violations (iteration suffix normalization)", () => {
  const folder = changeFolderPath(VALIDATOR_PROBE_SLUG);

  it("spec-fixer reading spec-review-result-000.md is not a violation (normalized to spec-review-result.md)", () => {
    // Simulate: spec-review writes result-001.md, spec-fixer reads result-000.md
    // Both normalize to "spec-review-result.md"
    const specReviewStep: Step = {
      ...noopStep,
      name: "spec-review",
      reads: () => [{ path: `${folder}/spec.md` }],
      writes: () => [{ path: `${folder}/spec-review-result-001.md` }],
    };
    const specFixer: Step = {
      ...noopStep,
      name: "spec-fixer",
      reads: () => [{ path: `${folder}/spec-review-result-000.md` }],
      writes: () => [{ path: `${folder}/spec.md` }],
    };

    // Need spec.md in ambient since spec-review reads it
    const ambient = [...AMBIENT, `${folder}/spec.md`];
    const descriptor = makeDescriptor([
      ["spec-review", specReviewStep],
      ["spec-fixer", specFixer],
    ]);

    const violations = validateDescriptorInputCompleteness(descriptor, ambient);
    // spec-fixer reads spec-review-result-000.md which normalizes to spec-review-result.md
    // spec-review writes spec-review-result-001.md which also normalizes to spec-review-result.md
    // → no violation
    expect(violations.some((v) => v.step === "spec-fixer")).toBe(false);
  });

  it("code-fixer reading review-feedback-000.md is not a violation", () => {
    const codeReview: Step = {
      ...noopStep,
      name: "code-review",
      reads: () => [],
      writes: () => [{ path: `${folder}/review-feedback-001.md` }],
    };
    const codeFixer: Step = {
      ...noopStep,
      name: "code-fixer",
      reads: () => [{ path: `${folder}/review-feedback-000.md` }],
      writes: () => [],
    };

    const descriptor = makeDescriptor([
      ["code-review", codeReview],
      ["code-fixer", codeFixer],
    ]);

    const violations = validateDescriptorInputCompleteness(descriptor, AMBIENT);
    expect(violations.some((v) => v.step === "code-fixer")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-06-5: standard and design-only descriptors are input-complete
// ---------------------------------------------------------------------------

describe("T-06-5: standard and design-only base descriptors are input-complete", () => {
  it("STANDARD_DESCRIPTOR has no violations", () => {
    const violations = validateDescriptorInputCompleteness(STANDARD_DESCRIPTOR, AMBIENT);
    expect(violations).toHaveLength(0);
  });

  it("DESIGN_ONLY_DESCRIPTOR has no violations", () => {
    const violations = validateDescriptorInputCompleteness(DESIGN_ONLY_DESCRIPTOR, AMBIENT);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-06-6: gitState reads are never counted as violations
// ---------------------------------------------------------------------------

describe("T-06-6: gitState artifact reads are not counted as violations", () => {
  it("a step that reads only gitState has no violations even with empty ambient", () => {
    const gitStep: Step = {
      ...noopStep,
      name: "git-only-step",
      reads: () => [{ path: ".", artifact: "gitState" }],
      writes: () => [],
    };
    const descriptor = makeDescriptor([["git-only-step", gitStep]]);
    const violations = validateDescriptorInputCompleteness(descriptor, []);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-06-7: ambient inputs satisfy reads declared by early steps
// ---------------------------------------------------------------------------

describe("T-06-7: ambient inputs satisfy reads", () => {
  it("design step's read of request.md is satisfied by ambient input", () => {
    const violations = validateDescriptorInputCompleteness(STANDARD_DESCRIPTOR, AMBIENT);
    const designViolation = violations.find((v) => v.step === "design");
    expect(designViolation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-06-8: violation when step reads a file not in ambient and not produced upstream
// ---------------------------------------------------------------------------

describe("T-06-8: violation for truly missing required read", () => {
  it("returns violation for a path not produced by any step and not ambient", () => {
    const folder = changeFolderPath(VALIDATOR_PROBE_SLUG);
    const stepNeedsOrphan: Step = {
      ...noopStep,
      name: "needs-orphan",
      reads: () => [{ path: `${folder}/orphan.md` }],
      writes: () => [],
    };
    const descriptor = makeDescriptor([["needs-orphan", stepNeedsOrphan]]);
    const violations = validateDescriptorInputCompleteness(descriptor, AMBIENT);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({ step: "needs-orphan", path: `${folder}/orphan.md` });
  });
});
