/**
 * T-04: FAST_DESCRIPTOR 構造テスト
 *
 * - steps: spec-review / spec-fixer / test-case-gen / adr-gen を含まず、9 step を含む
 * - startStep === "request-review"
 * - checkpoint === "conformance"（judge step であること）
 * - permissionScope.forbidden の 3 surfaces（id + glob 突合）
 * - slim design 構造: spec-review 無し、test-case-gen 無し、implementer 在り、adr-gen 無し
 */
import { describe, it, expect } from "vitest";
import {
  FAST_DESCRIPTOR,
  STANDARD_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
  getPipelineDescriptor,
} from "../../../../src/core/pipeline/registry.js";
import { PIPELINE_IDS } from "../../../../src/kernel/pipeline-ids.js";
import { CONFORMANCE_REPORT_TOOL } from "../../../../src/core/step/report-tool.js";
import { matchGlob } from "../../../../src/core/reviewers/glob-match.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import { ConformanceStep } from "../../../../src/core/step/conformance.js";

// ---------------------------------------------------------------------------
// Helper: extract step names from the steps array
// ---------------------------------------------------------------------------

function stepNames(descriptor: typeof FAST_DESCRIPTOR): string[] {
  return descriptor.steps.map(([name]) => name as string);
}

// ---------------------------------------------------------------------------
// T-04-1: getPipelineDescriptor("fast") returns FAST_DESCRIPTOR
// ---------------------------------------------------------------------------

describe("T-04-1: getPipelineDescriptor('fast') → FAST_DESCRIPTOR", () => {
  it("returns FAST_DESCRIPTOR for id='fast'", () => {
    const resolved = getPipelineDescriptor(PIPELINE_IDS.FAST);
    expect(resolved).toBe(FAST_DESCRIPTOR);
  });

  it("resolved descriptor has id='fast'", () => {
    expect(FAST_DESCRIPTOR.id).toBe("fast");
  });
});

// ---------------------------------------------------------------------------
// T-04-2: steps — 9 entries, no excluded steps, required steps present
// ---------------------------------------------------------------------------

describe("T-04-2: FAST_DESCRIPTOR.steps — 9 entries, no excluded steps", () => {
  const names = stepNames(FAST_DESCRIPTOR);

  it("has exactly 9 steps", () => {
    expect(FAST_DESCRIPTOR.steps).toHaveLength(9);
  });

  it("does NOT contain spec-review", () => {
    expect(names).not.toContain("spec-review");
  });

  it("does NOT contain spec-fixer", () => {
    expect(names).not.toContain("spec-fixer");
  });

  it("does NOT contain test-case-gen", () => {
    expect(names).not.toContain("test-case-gen");
  });

  it("does NOT contain adr-gen", () => {
    expect(names).not.toContain("adr-gen");
  });

  it("contains request-review", () => {
    expect(names).toContain("request-review");
  });

  it("contains design", () => {
    expect(names).toContain("design");
  });

  it("contains implementer", () => {
    expect(names).toContain("implementer");
  });

  it("contains verification", () => {
    expect(names).toContain("verification");
  });

  it("contains build-fixer", () => {
    expect(names).toContain("build-fixer");
  });

  it("contains code-review", () => {
    expect(names).toContain("code-review");
  });

  it("contains code-fixer", () => {
    expect(names).toContain("code-fixer");
  });

  it("contains conformance", () => {
    expect(names).toContain("conformance");
  });

  it("contains pr-create", () => {
    expect(names).toContain("pr-create");
  });
});

// ---------------------------------------------------------------------------
// T-04-3: startStep === "request-review"
// ---------------------------------------------------------------------------

describe("T-04-3: startStep === 'request-review'", () => {
  it("startStep is 'request-review'", () => {
    expect(FAST_DESCRIPTOR.startStep).toBe("request-review");
  });
});

// ---------------------------------------------------------------------------
// T-04-4: checkpoint = conformance (judge step)
// ---------------------------------------------------------------------------

describe("T-04-4: permissionScope.checkpoint === 'conformance'", () => {
  it("permissionScope is defined", () => {
    expect(FAST_DESCRIPTOR.permissionScope).toBeDefined();
  });

  it("checkpoint is 'conformance'", () => {
    expect(FAST_DESCRIPTOR.permissionScope?.checkpoint).toBe("conformance");
  });

  it("conformance step is present in steps", () => {
    const names = stepNames(FAST_DESCRIPTOR);
    expect(names).toContain("conformance");
  });

  it("ConformanceStep uses CONFORMANCE_REPORT_TOOL (judge/conformance step identity)", () => {
    // Verify ConformanceStep has the conformance report tool set
    const conformanceEntry = FAST_DESCRIPTOR.steps.find(([name]) => name === "conformance");
    expect(conformanceEntry).toBeDefined();
    const step = conformanceEntry![1] as AgentStep;
    expect(step.reportTool).toBe(CONFORMANCE_REPORT_TOOL);
  });

  it("conformance step in FAST_DESCRIPTOR is the shared ConformanceStep", () => {
    const conformanceEntry = FAST_DESCRIPTOR.steps.find(([name]) => name === "conformance");
    expect(conformanceEntry![1]).toBe(ConformanceStep);
  });

  it("conformance role is gate/impl", () => {
    expect(FAST_DESCRIPTOR.roles["conformance"]).toEqual({ role: "gate", phase: "impl" });
  });
});

// ---------------------------------------------------------------------------
// T-04-5: 3 surfaces (id + glob matching)
// ---------------------------------------------------------------------------

describe("T-04-5: permissionScope.forbidden — 3 surfaces with correct globs", () => {
  const forbidden = FAST_DESCRIPTOR.permissionScope!.forbidden;

  it("has exactly 3 forbidden surfaces", () => {
    expect(forbidden).toHaveLength(3);
  });

  it("contains surface id 'public-types'", () => {
    const ids = forbidden.map((s) => s.id);
    expect(ids).toContain("public-types");
  });

  it("contains surface id 'persisted-format'", () => {
    const ids = forbidden.map((s) => s.id);
    expect(ids).toContain("persisted-format");
  });

  it("contains surface id 'state-transitions'", () => {
    const ids = forbidden.map((s) => s.id);
    expect(ids).toContain("state-transitions");
  });

  // public-types glob: src/core/port/**
  describe("public-types surface glob", () => {
    const surface = forbidden.find((s) => s.id === "public-types")!;

    it("glob matches src/core/port/runtime-strategy.ts (port file)", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/core/port/runtime-strategy.ts"));
      expect(matches).toBe(true);
    });

    it("glob matches src/core/port/agent-runner.ts (another port file)", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/core/port/agent-runner.ts"));
      expect(matches).toBe(true);
    });

    it("glob does NOT match src/core/pipeline/types.ts (outside port/)", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/core/pipeline/types.ts"));
      expect(matches).toBe(false);
    });

    it("glob does NOT match src/state/schema.ts (different directory)", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/state/schema.ts"));
      expect(matches).toBe(false);
    });
  });

  // persisted-format glob: src/state/schema.ts (exact file)
  describe("persisted-format surface glob", () => {
    const surface = forbidden.find((s) => s.id === "persisted-format")!;

    it("glob matches src/state/schema.ts", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/state/schema.ts"));
      expect(matches).toBe(true);
    });

    it("glob does NOT match src/state/pipeline-id.ts (different file in same dir)", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/state/pipeline-id.ts"));
      expect(matches).toBe(false);
    });

    it("glob does NOT match src/state/lifecycle.ts (another file in same dir)", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/state/lifecycle.ts"));
      expect(matches).toBe(false);
    });
  });

  // state-transitions glob: src/state/lifecycle.ts (exact file)
  describe("state-transitions surface glob", () => {
    const surface = forbidden.find((s) => s.id === "state-transitions")!;

    it("glob matches src/state/lifecycle.ts", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/state/lifecycle.ts"));
      expect(matches).toBe(true);
    });

    it("glob does NOT match src/state/schema.ts (different file)", () => {
      const matches = surface.paths.some((p) => matchGlob(p, "src/state/schema.ts"));
      expect(matches).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// T-04-6: slim design structure
// ---------------------------------------------------------------------------

describe("T-04-6: slim design structure", () => {
  const names = stepNames(FAST_DESCRIPTOR);

  it("spec-review absent → independent spec-review loop omitted", () => {
    expect(names).not.toContain("spec-review");
  });

  it("test-case-gen absent → test generation integrated into implementer", () => {
    expect(names).not.toContain("test-case-gen");
  });

  it("implementer present → impl-phase creator (handles test generation)", () => {
    expect(names).toContain("implementer");
  });

  it("design present → design artifacts are still produced", () => {
    expect(names).toContain("design");
  });

  it("adr-gen absent → ADR generation not performed in fast pipeline", () => {
    expect(names).not.toContain("adr-gen");
  });
});

// ---------------------------------------------------------------------------
// T-04-7: loopName / loopNames / summaryStep constraints
// ---------------------------------------------------------------------------

describe("T-04-7: loopName / loopNames / summaryStep constraints", () => {
  const names = stepNames(FAST_DESCRIPTOR);

  it("loopName is in loopNames", () => {
    expect(FAST_DESCRIPTOR.loopNames).toContain(FAST_DESCRIPTOR.loopName);
  });

  it("summaryStep is in steps (when present)", () => {
    if (FAST_DESCRIPTOR.summaryStep !== undefined) {
      expect(names).toContain(FAST_DESCRIPTOR.summaryStep);
    }
  });

  it("loopNames includes verification, code-review, conformance", () => {
    expect(FAST_DESCRIPTOR.loopNames).toContain("verification");
    expect(FAST_DESCRIPTOR.loopNames).toContain("code-review");
    expect(FAST_DESCRIPTOR.loopNames).toContain("conformance");
  });

  it("loopNames does NOT include spec-review", () => {
    expect(FAST_DESCRIPTOR.loopNames).not.toContain("spec-review");
  });
});

// ---------------------------------------------------------------------------
// T-04-8: loopFixerPairs
// ---------------------------------------------------------------------------

describe("T-04-8: loopFixerPairs", () => {
  it("code-review maps to code-fixer", () => {
    expect(FAST_DESCRIPTOR.loopFixerPairs["code-review"]).toBe("code-fixer");
  });

  it("verification maps to build-fixer", () => {
    expect(FAST_DESCRIPTOR.loopFixerPairs["verification"]).toBe("build-fixer");
  });

  it("spec-review is NOT in loopFixerPairs (spec-fixer loop removed)", () => {
    expect(FAST_DESCRIPTOR.loopFixerPairs["spec-review"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-04-9: STANDARD_DESCRIPTOR and DESIGN_ONLY_DESCRIPTOR are unchanged
// ---------------------------------------------------------------------------

describe("T-04-9: existing descriptors are unchanged", () => {
  it("STANDARD_DESCRIPTOR.permissionScope is undefined (unchanged)", () => {
    expect(STANDARD_DESCRIPTOR.permissionScope).toBeUndefined();
  });

  it("DESIGN_ONLY_DESCRIPTOR.permissionScope is undefined (unchanged)", () => {
    expect(DESIGN_ONLY_DESCRIPTOR.permissionScope).toBeUndefined();
  });

  it("STANDARD_DESCRIPTOR has spec-review step (unchanged)", () => {
    const names = STANDARD_DESCRIPTOR.steps.map(([n]) => n as string);
    expect(names).toContain("spec-review");
  });

  it("STANDARD_DESCRIPTOR has adr-gen step (unchanged)", () => {
    const names = STANDARD_DESCRIPTOR.steps.map(([n]) => n as string);
    expect(names).toContain("adr-gen");
  });
});
