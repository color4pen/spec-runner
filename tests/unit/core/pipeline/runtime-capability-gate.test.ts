/**
 * Unit tests for src/core/pipeline/runtime-capability-gate.ts
 *
 * T-04: gate 純関数の単体テスト（fixture descriptor 駆動、profile 名非依存）
 *
 * - scope 宣言 + canDerive=false → throw UnsupportedRuntimeCapabilityError
 * - scope 宣言 + canDerive=true  → 通過（throw なし）
 * - scope 宣言 + canDerive absent → 通過（throw なし）
 * - scope 非宣言 + canDerive=false → 通過（permissionScope 不在は gate を skip）
 * - error message が能力ベース（「changed-files を導出できる runtime が必要」旨）、「local」種別名依存なし
 * - gate 挙動が descriptor.id の値に依存しない（複数 id で一様）
 */
import { describe, it, expect } from "vitest";
import {
  assertRuntimeSupportsScope,
  UnsupportedRuntimeCapabilityError,
} from "../../../../src/core/pipeline/runtime-capability-gate.js";
import {
  STANDARD_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
} from "../../../../src/core/pipeline/registry.js";
import type { PipelineDescriptor } from "../../../../src/core/pipeline/types.js";
import type { RuntimeStrategy } from "../../../../src/core/port/runtime-strategy.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PipelineDescriptor with permissionScope declared.
 * Registry への登録はしない（本 request では scope 宣言 profile を足さない）。
 */
function makeFixtureWithScope(id: string): PipelineDescriptor {
  return {
    ...STANDARD_DESCRIPTOR,
    id,
    permissionScope: { checkpoint: "code-review", forbidden: [] },
  };
}

/**
 * Build a minimal fake RuntimeStrategy with a given canDeriveChangedFiles predicate.
 * absent: canDeriveChangedFiles property is omitted from the object.
 */
function makeFakeRuntime(
  canDerive: boolean | "absent",
): Pick<RuntimeStrategy, "canDeriveChangedFiles"> {
  if (canDerive === "absent") {
    return {};
  }
  return {
    canDeriveChangedFiles: () => canDerive,
  };
}

// ---------------------------------------------------------------------------
// T-04-1: scope 宣言あり + canDeriveChangedFiles=false → throw
// ---------------------------------------------------------------------------

describe("T-04-1: scope 宣言 + canDerive=false → UnsupportedRuntimeCapabilityError を throw", () => {
  it("throws UnsupportedRuntimeCapabilityError", () => {
    const fixture = makeFixtureWithScope("fixture-with-scope");
    const runtime = makeFakeRuntime(false);

    expect(() => assertRuntimeSupportsScope(fixture, runtime)).toThrow(
      UnsupportedRuntimeCapabilityError,
    );
  });

  it("thrown error has correct pipelineId", () => {
    const fixture = makeFixtureWithScope("my-scope-pipeline");
    const runtime = makeFakeRuntime(false);

    let thrown: unknown;
    try {
      assertRuntimeSupportsScope(fixture, runtime);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(UnsupportedRuntimeCapabilityError);
    expect((thrown as UnsupportedRuntimeCapabilityError).pipelineId).toBe(
      "my-scope-pipeline",
    );
  });

  it("error message contains 'changed-files を導出できる runtime が必要' (capability-based, not type-name-based)", () => {
    const fixture = makeFixtureWithScope("fixture-a");
    const runtime = makeFakeRuntime(false);

    let thrown: unknown;
    try {
      assertRuntimeSupportsScope(fixture, runtime);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(UnsupportedRuntimeCapabilityError);
    const message = (thrown as UnsupportedRuntimeCapabilityError).message;
    // Must mention the capability requirement, NOT the runtime type name
    expect(message).toContain("changed-files を導出できる runtime");
    // Must NOT mention "local" as a type name (would make the message stale when managed gains capability)
    expect(message).not.toContain("local runtime");
    expect(message).not.toMatch(/\bローカル runtime\b/);
  });

  it("error message contains alternative guidance", () => {
    const fixture = makeFixtureWithScope("fixture-b");
    const runtime = makeFakeRuntime(false);

    let thrown: unknown;
    try {
      assertRuntimeSupportsScope(fixture, runtime);
    } catch (e) {
      thrown = e;
    }

    const message = (thrown as UnsupportedRuntimeCapabilityError).message;
    // Should mention an alternative (standard pipeline or equivalent)
    expect(message.toLowerCase()).toMatch(/standard|代替|alternative/);
  });

  it("error name is 'UnsupportedRuntimeCapabilityError'", () => {
    const fixture = makeFixtureWithScope("fixture-c");
    const runtime = makeFakeRuntime(false);

    let thrown: unknown;
    try {
      assertRuntimeSupportsScope(fixture, runtime);
    } catch (e) {
      thrown = e;
    }

    expect((thrown as Error).name).toBe("UnsupportedRuntimeCapabilityError");
  });
});

// ---------------------------------------------------------------------------
// T-04-2: scope 宣言あり + canDerive=true → 通過
// ---------------------------------------------------------------------------

describe("T-04-2: scope 宣言 + canDerive=true → throw しない", () => {
  it("does not throw when canDeriveChangedFiles returns true", () => {
    const fixture = makeFixtureWithScope("fixture-capable");
    const runtime = makeFakeRuntime(true);

    expect(() => assertRuntimeSupportsScope(fixture, runtime)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-04-3: scope 宣言あり + canDeriveChangedFiles absent → 通過
// ---------------------------------------------------------------------------

describe("T-04-3: scope 宣言 + canDeriveChangedFiles absent → throw しない", () => {
  it("does not throw when canDeriveChangedFiles is not implemented (absent)", () => {
    const fixture = makeFixtureWithScope("fixture-no-predicate");
    const runtime = makeFakeRuntime("absent");

    expect(() => assertRuntimeSupportsScope(fixture, runtime)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-04-4: scope 非宣言 → canDerive=false でも throw しない
// ---------------------------------------------------------------------------

describe("T-04-4: scope 非宣言（STANDARD_DESCRIPTOR / DESIGN_ONLY_DESCRIPTOR）→ canDerive=false でも通過", () => {
  it("STANDARD_DESCRIPTOR (permissionScope absent) + canDerive=false → does not throw", () => {
    const runtime = makeFakeRuntime(false);
    expect(() => assertRuntimeSupportsScope(STANDARD_DESCRIPTOR, runtime)).not.toThrow();
  });

  it("DESIGN_ONLY_DESCRIPTOR (permissionScope absent) + canDerive=false → does not throw", () => {
    const runtime = makeFakeRuntime(false);
    expect(() => assertRuntimeSupportsScope(DESIGN_ONLY_DESCRIPTOR, runtime)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-04-5: gate 判定が descriptor.id の値に依存しない（複数 id で一様）
// ---------------------------------------------------------------------------

describe("T-04-5: gate 挙動が descriptor.id に依存しない（profile 名非依存）", () => {
  const scopeFixtureIds = [
    "fast",
    "fixture-alpha",
    "fixture-beta",
    "some-other-pipeline",
    "pipeline-with-unusual-name",
  ];

  for (const id of scopeFixtureIds) {
    it(`id="${id}" + scope 宣言 + canDerive=false → throw（id 依存なし）`, () => {
      const fixture = makeFixtureWithScope(id);
      const runtime = makeFakeRuntime(false);

      expect(() => assertRuntimeSupportsScope(fixture, runtime)).toThrow(
        UnsupportedRuntimeCapabilityError,
      );
    });

    it(`id="${id}" + scope 宣言 + canDerive=true → 通過（id 依存なし）`, () => {
      const fixture = makeFixtureWithScope(id);
      const runtime = makeFakeRuntime(true);

      expect(() => assertRuntimeSupportsScope(fixture, runtime)).not.toThrow();
    });
  }
});
