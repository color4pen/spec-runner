/**
 * T-10: fast pipeline forbidden surfaces — config resolver and applyScopeConfig tests.
 *
 * Covers:
 * - config validation: well-formed / invalid forbiddenSurfaces
 * - resolvePipelineForbiddenSurfaces: fast with config / no config / other pipeline ids
 * - applyScopeConfig: config declared → forbidden matches + checkpoint preserved
 *                     no config → forbidden empty + presence maintained
 *                     standard / design-only → reference identical
 * - dogfooding: .specrunner/config.json declares 3 surfaces
 * - no-breach + gate: capability gate still applies when forbidden=[]
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { validateConfig, resolvePipelineForbiddenSurfaces } from "../../../../src/config/schema.js";
import { applyScopeConfig } from "../../../../src/core/pipeline/resolve-scope.js";
import {
  FAST_DESCRIPTOR,
  STANDARD_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
} from "../../../../src/core/pipeline/registry.js";
import {
  assertRuntimeSupportsScope,
  UnsupportedRuntimeCapabilityError,
} from "../../../../src/core/pipeline/runtime-capability-gate.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import type { RuntimeStrategy } from "../../../../src/core/port/runtime-strategy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, ...overrides };
}

function makeConfig(overrides?: Partial<SpecRunnerConfig>): SpecRunnerConfig {
  return { version: 1, agents: {}, ...overrides };
}

function makeConfigWithSurfaces(): SpecRunnerConfig {
  return makeConfig({
    pipeline: {
      fast: {
        forbiddenSurfaces: [
          { id: "public-types",      paths: ["src/core/port/**"] },
          { id: "persisted-format",  paths: ["src/state/schema.ts"] },
          { id: "state-transitions", paths: ["src/state/lifecycle.ts"] },
        ],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Config validation tests
// ---------------------------------------------------------------------------

describe("config validation — pipeline.fast.forbiddenSurfaces", () => {
  it("accepts well-formed forbiddenSurfaces array", () => {
    const raw = makeMinimalConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: [
            { id: "public-types", paths: ["src/core/port/**"] },
          ],
        },
      },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts empty forbiddenSurfaces array", () => {
    const raw = makeMinimalConfig({
      pipeline: { fast: { forbiddenSurfaces: [] } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts pipeline.fast absent (no forbidden surfaces)", () => {
    const raw = makeMinimalConfig({ pipeline: { maxRetries: 2 } });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts pipeline entirely absent", () => {
    const raw = makeMinimalConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws CONFIG_INVALID when id is missing from a surface entry", () => {
    const raw = makeMinimalConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: [
            { paths: ["src/core/port/**"] }, // id missing
          ],
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws CONFIG_INVALID when id is an empty string", () => {
    const raw = makeMinimalConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: [
            { id: "", paths: ["src/core/port/**"] },
          ],
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws CONFIG_INVALID when paths is not an array (string instead)", () => {
    const raw = makeMinimalConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: [
            { id: "public-types", paths: "src/core/port/**" }, // should be array
          ],
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws CONFIG_INVALID when paths is missing entirely", () => {
    const raw = makeMinimalConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: [
            { id: "public-types" }, // paths missing
          ],
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws CONFIG_INVALID when forbiddenSurfaces is not an array (object instead)", () => {
    const raw = makeMinimalConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: { id: "public-types", paths: ["src/**"] }, // not array
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("accepts multiple surfaces in the array", () => {
    const raw = makeMinimalConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: [
            { id: "surface-a", paths: ["src/a/**"] },
            { id: "surface-b", paths: ["src/b/file.ts", "src/b/other.ts"] },
          ],
        },
      },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolvePipelineForbiddenSurfaces tests
// ---------------------------------------------------------------------------

describe("resolvePipelineForbiddenSurfaces", () => {
  it("returns declared surfaces for pipelineId='fast' with config", () => {
    const config = makeConfigWithSurfaces();
    const result = resolvePipelineForbiddenSurfaces(config, "fast");
    expect(result).toHaveLength(3);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("public-types");
    expect(ids).toContain("persisted-format");
    expect(ids).toContain("state-transitions");
  });

  it("returns [] for pipelineId='fast' when pipeline.fast is absent", () => {
    const config = makeConfig();
    const result = resolvePipelineForbiddenSurfaces(config, "fast");
    expect(result).toEqual([]);
  });

  it("returns [] for pipelineId='fast' when pipeline.fast.forbiddenSurfaces is absent", () => {
    const config = makeConfig({ pipeline: { fast: {} } });
    const result = resolvePipelineForbiddenSurfaces(config, "fast");
    expect(result).toEqual([]);
  });

  it("returns [] for pipelineId='standard' even when fast surfaces are declared", () => {
    const config = makeConfigWithSurfaces();
    const result = resolvePipelineForbiddenSurfaces(config, "standard");
    expect(result).toEqual([]);
  });

  it("returns [] for pipelineId='design-only' even when fast surfaces are declared", () => {
    const config = makeConfigWithSurfaces();
    const result = resolvePipelineForbiddenSurfaces(config, "design-only");
    expect(result).toEqual([]);
  });

  it("returns [] for any unknown pipeline id", () => {
    const config = makeConfigWithSurfaces();
    const result = resolvePipelineForbiddenSurfaces(config, "some-future-pipeline");
    expect(result).toEqual([]);
  });

  it("returned paths are the declared paths (not transformed)", () => {
    const config = makeConfig({
      pipeline: {
        fast: {
          forbiddenSurfaces: [
            { id: "my-surface", paths: ["src/a/**", "src/b/file.ts"] },
          ],
        },
      },
    });
    const result = resolvePipelineForbiddenSurfaces(config, "fast");
    expect(result[0]!.paths).toEqual(["src/a/**", "src/b/file.ts"]);
  });
});

// ---------------------------------------------------------------------------
// applyScopeConfig tests
// ---------------------------------------------------------------------------

describe("applyScopeConfig", () => {
  describe("fast descriptor + config with forbidden surfaces", () => {
    it("returns a descriptor with permissionScope.forbidden matching config", () => {
      const config = makeConfigWithSurfaces();
      const result = applyScopeConfig(FAST_DESCRIPTOR, config);
      expect(result.permissionScope?.forbidden).toHaveLength(3);
      const ids = result.permissionScope!.forbidden.map((s) => s.id);
      expect(ids).toContain("public-types");
      expect(ids).toContain("persisted-format");
      expect(ids).toContain("state-transitions");
    });

    it("preserves checkpoint unchanged", () => {
      const config = makeConfigWithSurfaces();
      const result = applyScopeConfig(FAST_DESCRIPTOR, config);
      expect(result.permissionScope?.checkpoint).toBe("conformance");
    });

    it("returns a different object (not base reference) when scope is applied", () => {
      const config = makeConfigWithSurfaces();
      const result = applyScopeConfig(FAST_DESCRIPTOR, config);
      expect(result).not.toBe(FAST_DESCRIPTOR);
    });

    it("preserves all other descriptor fields", () => {
      const config = makeConfigWithSurfaces();
      const result = applyScopeConfig(FAST_DESCRIPTOR, config);
      expect(result.id).toBe(FAST_DESCRIPTOR.id);
      expect(result.steps).toBe(FAST_DESCRIPTOR.steps);
      expect(result.transitions).toBe(FAST_DESCRIPTOR.transitions);
      expect(result.startStep).toBe(FAST_DESCRIPTOR.startStep);
    });
  });

  describe("fast descriptor + no config surfaces", () => {
    it("returns descriptor with permissionScope presence maintained", () => {
      const config = makeConfig(); // no pipeline.fast
      const result = applyScopeConfig(FAST_DESCRIPTOR, config);
      expect(result.permissionScope).toBeDefined();
    });

    it("returns descriptor with forbidden=[] when config has no surfaces", () => {
      const config = makeConfig();
      const result = applyScopeConfig(FAST_DESCRIPTOR, config);
      expect(result.permissionScope?.forbidden).toEqual([]);
    });

    it("preserves checkpoint even with empty forbidden", () => {
      const config = makeConfig();
      const result = applyScopeConfig(FAST_DESCRIPTOR, config);
      expect(result.permissionScope?.checkpoint).toBe("conformance");
    });
  });

  describe("standard descriptor (no permissionScope) → reference identical", () => {
    it("returns base unchanged (same reference) when no permissionScope", () => {
      const config = makeConfigWithSurfaces();
      const result = applyScopeConfig(STANDARD_DESCRIPTOR, config);
      expect(result).toBe(STANDARD_DESCRIPTOR);
    });
  });

  describe("design-only descriptor (no permissionScope) → reference identical", () => {
    it("returns base unchanged (same reference) when no permissionScope", () => {
      const config = makeConfigWithSurfaces();
      const result = applyScopeConfig(DESIGN_ONLY_DESCRIPTOR, config);
      expect(result).toBe(DESIGN_ONLY_DESCRIPTOR);
    });
  });
});

// ---------------------------------------------------------------------------
// Capability gate tests — fast scope presence drives gate, config doesn't matter
// ---------------------------------------------------------------------------

describe("capability gate — assertRuntimeSupportsScope", () => {
  function makeIncapableRuntime(): Pick<RuntimeStrategy, "canDeriveChangedFiles"> {
    return { canDeriveChangedFiles: () => false };
  }

  function makeCapableRuntime(): Pick<RuntimeStrategy, "canDeriveChangedFiles"> {
    return { canDeriveChangedFiles: () => true };
  }

  it("throws UnsupportedRuntimeCapabilityError for fast descriptor (no config) + incapable runtime", () => {
    // Even with no forbidden surfaces (config absent), the gate fires because
    // permissionScope is present (presence is the gate trigger, not the surface list).
    const config = makeConfig(); // no surfaces
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    expect(() => assertRuntimeSupportsScope(scoped, makeIncapableRuntime())).toThrow(
      UnsupportedRuntimeCapabilityError,
    );
  });

  it("throws UnsupportedRuntimeCapabilityError for fast descriptor (with config) + incapable runtime", () => {
    const config = makeConfigWithSurfaces();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    expect(() => assertRuntimeSupportsScope(scoped, makeIncapableRuntime())).toThrow(
      UnsupportedRuntimeCapabilityError,
    );
  });

  it("does NOT throw for fast descriptor + capable runtime (no surfaces)", () => {
    const config = makeConfig();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    expect(() => assertRuntimeSupportsScope(scoped, makeCapableRuntime())).not.toThrow();
  });

  it("does NOT throw for fast descriptor + capable runtime (with surfaces)", () => {
    const config = makeConfigWithSurfaces();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    expect(() => assertRuntimeSupportsScope(scoped, makeCapableRuntime())).not.toThrow();
  });

  it("does NOT throw for standard descriptor + incapable runtime (no scope = no gate)", () => {
    expect(() => assertRuntimeSupportsScope(STANDARD_DESCRIPTOR, makeIncapableRuntime())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Dogfooding: .specrunner/config.json declares the 3 surfaces
// ---------------------------------------------------------------------------

describe("dogfooding — .specrunner/config.json has the 3 forbidden surfaces", () => {
  let configJson: Record<string, unknown>;

  beforeAll(async () => {
    // Resolve from the test file up to the repo root
    const repoRoot = path.resolve(import.meta.dirname, "../../../../");
    const configPath = path.join(repoRoot, ".specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    configJson = JSON.parse(raw) as Record<string, unknown>;
  });

  it(".specrunner/config.json is valid (version 1)", () => {
    expect(() => validateConfig(configJson)).not.toThrow();
  });

  it("pipeline.fast.forbiddenSurfaces is declared", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown> | undefined;
    const fast = pipeline?.["fast"] as Record<string, unknown> | undefined;
    const surfaces = fast?.["forbiddenSurfaces"];
    expect(Array.isArray(surfaces)).toBe(true);
    expect((surfaces as unknown[]).length).toBeGreaterThan(0);
  });

  it("declares the 'public-types' surface", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    expect(surfaces.some((s) => s.id === "public-types")).toBe(true);
  });

  it("declares the 'persisted-format' surface", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    expect(surfaces.some((s) => s.id === "persisted-format")).toBe(true);
  });

  it("declares the 'state-transitions' surface", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    expect(surfaces.some((s) => s.id === "state-transitions")).toBe(true);
  });

  it("public-types surface has path 'src/core/port/**'", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    const surface = surfaces.find((s) => s.id === "public-types");
    expect(surface?.paths).toContain("src/core/port/**");
  });

  it("persisted-format surface has path 'src/state/schema.ts'", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    const surface = surfaces.find((s) => s.id === "persisted-format");
    expect(surface?.paths).toContain("src/state/schema.ts");
  });

  it("state-transitions surface has path 'src/state/lifecycle.ts'", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    const surface = surfaces.find((s) => s.id === "state-transitions");
    expect(surface?.paths).toContain("src/state/lifecycle.ts");
  });

  it("declares the 'guard-config' surface", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    expect(surfaces.some((s) => s.id === "guard-config")).toBe(true);
  });

  it("guard-config surface has path '.specrunner/config.json'", () => {
    const pipeline = configJson["pipeline"] as Record<string, unknown>;
    const fast = pipeline["fast"] as Record<string, unknown>;
    const surfaces = fast["forbiddenSurfaces"] as Array<{ id: string; paths: string[] }>;
    const surface = surfaces.find((s) => s.id === "guard-config");
    expect(surface?.paths).toContain(".specrunner/config.json");
  });
});

// ---------------------------------------------------------------------------
// Integration: registry has no spec-runner-specific literals
// ---------------------------------------------------------------------------

describe("registry invariant — FAST_DESCRIPTOR has no hardcoded spec-runner paths", () => {
  it("FAST_DESCRIPTOR.permissionScope.forbidden is empty in the static registry", () => {
    expect(FAST_DESCRIPTOR.permissionScope?.forbidden).toEqual([]);
  });

  it("permissionScope is still present (capability gate still applies)", () => {
    expect(FAST_DESCRIPTOR.permissionScope).toBeDefined();
  });

  it("checkpoint is still 'conformance'", () => {
    expect(FAST_DESCRIPTOR.permissionScope?.checkpoint).toBe("conformance");
  });
});
