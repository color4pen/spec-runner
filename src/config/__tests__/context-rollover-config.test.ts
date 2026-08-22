/**
 * Tests for resolveContextRolloverConfig and contextRollover zod validation.
 *
 * T-01 acceptance criteria (TC-016 to TC-021):
 *   - resolveContextRolloverConfig({version:1,agents:{}}) returns { maxRollovers: 1 }
 *   - contextRollover: { maxRollovers: 0 } is valid, resolves to 0
 *   - contextRollover: { maxRollovers: 3 } is valid, resolves to 3
 *   - contextRollover: { maxRollovers: -1 } is CONFIG_INVALID
 *   - contextRollover: { maxRollovers: 1.5 } is CONFIG_INVALID
 *   - contextRollover: "1" is CONFIG_INVALID
 *   - config without contextRollover remains valid
 */
import { describe, it, expect } from "vitest";
import {
  resolveContextRolloverConfig,
  DEFAULT_CONTEXT_ROLLOVER_MAX,
  validateConfig,
} from "../schema.js";
import type { SpecRunnerConfig } from "../schema.js";

function makeMinimalConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return { version: 1, agents: {}, ...overrides };
}

// ---------------------------------------------------------------------------
// resolveContextRolloverConfig
// ---------------------------------------------------------------------------

describe("resolveContextRolloverConfig", () => {
  it("returns default when contextRollover is absent (TC-016)", () => {
    const result = resolveContextRolloverConfig(makeMinimalConfig());
    expect(result).toEqual({ maxRollovers: DEFAULT_CONTEXT_ROLLOVER_MAX });
    expect(result.maxRollovers).toBe(1);
  });

  it("maxRollovers: 0 is valid and resolves to 0 (TC-018)", () => {
    const result = resolveContextRolloverConfig(
      makeMinimalConfig({ contextRollover: { maxRollovers: 0 } }),
    );
    expect(result.maxRollovers).toBe(0);
  });

  it("maxRollovers: 3 is valid and resolves to 3", () => {
    const result = resolveContextRolloverConfig(
      makeMinimalConfig({ contextRollover: { maxRollovers: 3 } }),
    );
    expect(result.maxRollovers).toBe(3);
  });

  it("explicit maxRollovers: 1 resolves to 1", () => {
    const result = resolveContextRolloverConfig(
      makeMinimalConfig({ contextRollover: { maxRollovers: 1 } }),
    );
    expect(result.maxRollovers).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// zod validation via validateConfig
// ---------------------------------------------------------------------------

describe("validateConfig — contextRollover schema", () => {
  it("config without contextRollover is valid (TC-021)", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {} }),
    ).not.toThrow();
  });

  it("contextRollover with maxRollovers: 0 is valid (TC-018)", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, contextRollover: { maxRollovers: 0 } }),
    ).not.toThrow();
  });

  it("contextRollover with maxRollovers: 1 is valid", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, contextRollover: { maxRollovers: 1 } }),
    ).not.toThrow();
  });

  it("contextRollover with maxRollovers: 5 is valid", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, contextRollover: { maxRollovers: 5 } }),
    ).not.toThrow();
  });

  it("contextRollover.maxRollovers: -1 is rejected with CONFIG_INVALID (TC-017)", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, contextRollover: { maxRollovers: -1 } }),
    ).toThrow(/CONFIG_INVALID/);
  });

  it("contextRollover.maxRollovers: 1.5 is rejected with CONFIG_INVALID (TC-019)", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, contextRollover: { maxRollovers: 1.5 } }),
    ).toThrow(/CONFIG_INVALID/);
  });

  it('contextRollover as non-object (string "1") is rejected with CONFIG_INVALID (TC-020)', () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, contextRollover: "1" }),
    ).toThrow(/CONFIG_INVALID/);
  });
});
