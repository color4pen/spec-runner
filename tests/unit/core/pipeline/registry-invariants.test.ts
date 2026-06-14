/**
 * T-06: Meta 経由 design-only の到達性・無害性、既定挙動・registry・FindingResolution 不変の検証
 *
 * - Meta pipeline: design-only → DESIGN_ONLY_DESCRIPTOR に到達する（読解確認の機械化）
 * - DESIGN_ONLY_DESCRIPTOR.permissionScope が undefined → gate を通過する（副作用が既存経路を壊さない）
 * - PIPELINE_REGISTRY が standard / design-only / fast の 3 本（fast が機構を起動）
 * - fast だけが permissionScope を宣言し、standard / design-only は宣言しない
 * - STANDARD_DESCRIPTOR.permissionScope が undefined（gate は production で standard には発火しない）
 */
import { describe, it, expect } from "vitest";
import {
  PIPELINE_REGISTRY,
  STANDARD_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
  FAST_DESCRIPTOR,
  getPipelineDescriptor,
} from "../../../../src/core/pipeline/registry.js";
import { assertRuntimeSupportsScope } from "../../../../src/core/pipeline/runtime-capability-gate.js";
import { PIPELINE_IDS } from "../../../../src/kernel/pipeline-ids.js";

// ---------------------------------------------------------------------------
// T-06-1: Meta pipeline: design-only が DESIGN_ONLY_DESCRIPTOR に到達する
// ---------------------------------------------------------------------------

describe("T-06-1: Meta pipeline: design-only → DESIGN_ONLY_DESCRIPTOR に到達", () => {
  it("getPipelineDescriptor('design-only') returns DESIGN_ONLY_DESCRIPTOR", () => {
    const resolved = getPipelineDescriptor(PIPELINE_IDS.DESIGN_ONLY);
    expect(resolved).toBe(DESIGN_ONLY_DESCRIPTOR);
  });

  it("resolved descriptor has id='design-only'", () => {
    const resolved = getPipelineDescriptor(PIPELINE_IDS.DESIGN_ONLY);
    expect(resolved.id).toBe("design-only");
  });

  it("getPipelineDescriptor('standard') returns STANDARD_DESCRIPTOR", () => {
    const resolved = getPipelineDescriptor(PIPELINE_IDS.STANDARD);
    expect(resolved).toBe(STANDARD_DESCRIPTOR);
  });
});

// ---------------------------------------------------------------------------
// T-06-2: Meta 経由 design-only が gate を通過する（permissionScope 不在）
// ---------------------------------------------------------------------------

describe("T-06-2: Meta 経由 design-only は gate を通過する（permissionScope 不在）", () => {
  it("DESIGN_ONLY_DESCRIPTOR.permissionScope is undefined", () => {
    expect(DESIGN_ONLY_DESCRIPTOR.permissionScope).toBeUndefined();
  });

  it("assertRuntimeSupportsScope does not throw for design-only + canDerive=false fake", () => {
    // Even with a runtime that cannot derive changed files,
    // design-only passes because it declares no permissionScope.
    const fakeRuntime = { canDeriveChangedFiles: () => false as const };

    expect(() =>
      assertRuntimeSupportsScope(DESIGN_ONLY_DESCRIPTOR, fakeRuntime),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-06-3: PIPELINE_REGISTRY が 3 本（fast が機構を起動）
// ---------------------------------------------------------------------------

describe("T-06-3: PIPELINE_REGISTRY が standard / design-only / fast の 3 本（fast が scope 機構を起動）", () => {
  it("PIPELINE_REGISTRY contains exactly 3 entries", () => {
    const ids = Object.keys(PIPELINE_REGISTRY);
    expect(ids).toHaveLength(3);
  });

  it("PIPELINE_REGISTRY contains 'standard'", () => {
    const ids = Object.keys(PIPELINE_REGISTRY);
    expect(ids).toContain(PIPELINE_IDS.STANDARD);
  });

  it("PIPELINE_REGISTRY contains 'design-only'", () => {
    const ids = Object.keys(PIPELINE_REGISTRY);
    expect(ids).toContain(PIPELINE_IDS.DESIGN_ONLY);
  });

  it("PIPELINE_REGISTRY contains 'fast'", () => {
    const ids = Object.keys(PIPELINE_REGISTRY);
    expect(ids).toContain(PIPELINE_IDS.FAST);
  });

  it("exactly 1 entry declares permissionScope — fast is the first scope-declaring profile", () => {
    const entriesWithScope = Object.values(PIPELINE_REGISTRY).filter(
      (d) => d.permissionScope !== undefined,
    );
    expect(entriesWithScope).toHaveLength(1);
  });

  it("the scope-declaring entry is FAST_DESCRIPTOR", () => {
    const entriesWithScope = Object.values(PIPELINE_REGISTRY).filter(
      (d) => d.permissionScope !== undefined,
    );
    expect(entriesWithScope[0]).toBe(FAST_DESCRIPTOR);
  });

  it("STANDARD_DESCRIPTOR does NOT declare permissionScope", () => {
    expect(PIPELINE_REGISTRY[PIPELINE_IDS.STANDARD]!.permissionScope).toBeUndefined();
  });

  it("DESIGN_ONLY_DESCRIPTOR does NOT declare permissionScope", () => {
    expect(PIPELINE_REGISTRY[PIPELINE_IDS.DESIGN_ONLY]!.permissionScope).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-06-4: STANDARD_DESCRIPTOR.permissionScope が undefined（既定挙動不変）
// ---------------------------------------------------------------------------

describe("T-06-4: STANDARD_DESCRIPTOR.permissionScope が undefined（gate は production で発火しない）", () => {
  it("STANDARD_DESCRIPTOR.permissionScope is undefined", () => {
    expect(STANDARD_DESCRIPTOR.permissionScope).toBeUndefined();
  });

  it("assertRuntimeSupportsScope does not throw for standard + canDerive=false fake", () => {
    const fakeRuntime = { canDeriveChangedFiles: () => false as const };

    expect(() =>
      assertRuntimeSupportsScope(STANDARD_DESCRIPTOR, fakeRuntime),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-06-5: 未知 id は getPipelineDescriptor の既存エラーで弾かれる
// ---------------------------------------------------------------------------

describe("T-06-5: 未知 id は getPipelineDescriptor の既存エラーで弾かれる", () => {
  it("getPipelineDescriptor throws for unknown id", () => {
    expect(() => getPipelineDescriptor("bogus-unknown-id")).toThrow();
  });

  it("getPipelineDescriptor error message includes known ids", () => {
    let thrown: unknown;
    try {
      getPipelineDescriptor("bogus-unknown-id");
    } catch (e) {
      thrown = e;
    }
    const msg = (thrown as Error).message;
    expect(msg).toContain("standard");
    expect(msg).toContain("design-only");
    expect(msg).toContain("fast");
  });
});
