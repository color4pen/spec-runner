/**
 * Unit tests for designLayer config schema additions.
 *
 * TC-DL-CONFIG-001: valid designLayer config passes validateConfig
 * TC-DL-CONFIG-002: invalid enabled type → CONFIG_INVALID
 * TC-DL-CONFIG-003: invalid command type → CONFIG_INVALID
 * TC-DL-CONFIG-004: resolveDesignLayerConfig returns defaults when absent
 * TC-DL-CONFIG-005: resolveDesignLayerConfig returns provided values
 */
import { describe, it, expect } from "vitest";
import { validateConfig, resolveDesignLayerConfig } from "../../../src/config/schema.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    agents: {},
    ...overrides,
  };
}

describe("TC-DL-CONFIG-001: valid designLayer config passes validateConfig", () => {
  it("passes with all designLayer fields present", () => {
    const raw = baseConfig({
      designLayer: {
        enabled: true,
        command: "my-aozu",
        requireCitationTypes: ["new-feature", "spec-change"],
      },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("passes with only enabled: false", () => {
    const raw = baseConfig({ designLayer: { enabled: false } });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("passes without designLayer (absent is valid)", () => {
    const raw = baseConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("passes with empty designLayer object", () => {
    const raw = baseConfig({ designLayer: {} });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-DL-CONFIG-002: invalid enabled type → CONFIG_INVALID", () => {
  it("throws CONFIG_INVALID when enabled is a string", () => {
    const raw = baseConfig({ designLayer: { enabled: "yes" } });
    let err: Error | undefined;
    try { validateConfig(raw); } catch (e) { err = e as Error; }
    expect(err?.message).toContain("designLayer");
  });
});

describe("TC-DL-CONFIG-003: invalid command type → CONFIG_INVALID", () => {
  it("throws CONFIG_INVALID when command is a number", () => {
    const raw = baseConfig({ designLayer: { command: 42 } });
    let err: Error | undefined;
    try { validateConfig(raw); } catch (e) { err = e as Error; }
    expect(err?.message).toContain("designLayer");
  });

  it("throws CONFIG_INVALID when command is an empty string", () => {
    const raw = baseConfig({ designLayer: { command: "" } });
    let err: Error | undefined;
    try { validateConfig(raw); } catch (e) { err = e as Error; }
    expect(err?.message).toContain("designLayer");
  });
});

describe("TC-DL-CONFIG-004: resolveDesignLayerConfig returns defaults when absent", () => {
  it("returns enabled:false, command:'aozu', requireCitationTypes:[], topicEmission:true when designLayer absent", () => {
    const config: SpecRunnerConfig = { version: 1, agents: {} } as SpecRunnerConfig;
    const resolved = resolveDesignLayerConfig(config);
    expect(resolved).toEqual({
      enabled: false,
      command: "aozu",
      requireCitationTypes: [],
      topicEmission: true,
    });
  });
});

describe("TC-DL-CONFIG-005: resolveDesignLayerConfig returns provided values", () => {
  it("returns provided enabled/command/requireCitationTypes", () => {
    const config: SpecRunnerConfig = {
      version: 1,
      agents: {},
      designLayer: {
        enabled: true,
        command: "my-aozu",
        requireCitationTypes: ["new-feature"],
      },
    } as SpecRunnerConfig;
    const resolved = resolveDesignLayerConfig(config);
    expect(resolved).toEqual({
      enabled: true,
      command: "my-aozu",
      requireCitationTypes: ["new-feature"],
      topicEmission: true,
    });
  });

  it("enabled stays false when not explicitly true", () => {
    const config: SpecRunnerConfig = {
      version: 1,
      agents: {},
      designLayer: { enabled: false },
    } as SpecRunnerConfig;
    const resolved = resolveDesignLayerConfig(config);
    expect(resolved.enabled).toBe(false);
  });
});

describe("TC-DL-CONFIG-006 (TC-016): resolveDesignLayerConfig preserves topicEmission:false", () => {
  it("returns topicEmission:false when designLayer.topicEmission is explicitly false", () => {
    const config: SpecRunnerConfig = {
      version: 1,
      agents: {},
      designLayer: { topicEmission: false },
    } as SpecRunnerConfig;
    const resolved = resolveDesignLayerConfig(config);
    expect(resolved.topicEmission).toBe(false);
  });
});

describe("TC-DL-CONFIG-007 (TC-019): invalid topicEmission type → CONFIG_INVALID", () => {
  it("throws CONFIG_INVALID when topicEmission is a string", () => {
    const raw = baseConfig({ designLayer: { topicEmission: "yes" } });
    let err: Error | undefined;
    try { validateConfig(raw); } catch (e) { err = e as Error; }
    expect(err?.message).toContain("designLayer");
  });
});
