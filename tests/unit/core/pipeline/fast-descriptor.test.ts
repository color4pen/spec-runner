/**
 * T-04: FAST_DESCRIPTOR 構造テスト
 *
 * - steps: spec-review / spec-fixer / test-case-gen / adr-gen を含まず、9 step を含む
 * - startStep === "request-review"
 * - checkpoint === "conformance"（judge step であること）
 * - permissionScope presence あり・checkpoint === "conformance"・forbidden は空配列
 *   （3 surfaces はリポジトリの config から applyScopeConfig() で解決される）
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
// T-04-5: registry 定数の forbidden は空（3 surfaces は config から解決される）
// ---------------------------------------------------------------------------

describe("T-04-5: FAST_DESCRIPTOR.permissionScope — presence あり・forbidden 空・checkpoint 不変", () => {
  const { permissionScope } = FAST_DESCRIPTOR;

  it("permissionScope is defined (presence maintained)", () => {
    expect(permissionScope).toBeDefined();
  });

  it("checkpoint is 'conformance' (unchanged)", () => {
    expect(permissionScope?.checkpoint).toBe("conformance");
  });

  it("forbidden is an empty array (surfaces are resolved from config at runtime)", () => {
    expect(permissionScope?.forbidden).toEqual([]);
  });

  it("forbidden has length 0 (no hardcoded spec-runner paths)", () => {
    expect(permissionScope?.forbidden).toHaveLength(0);
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
