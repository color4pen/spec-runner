/**
 * Unit tests for config schema validation — jobs.location field.
 *
 * TC-JOBS-01: jobs section absent → valid (backward compat)
 * TC-JOBS-02: jobs.location: "project" → valid
 * TC-JOBS-03: jobs.location: "xdg" → valid
 * TC-JOBS-04: jobs.location undefined (section present, field absent) → valid
 * TC-JOBS-05: jobs.location: "local" → CONFIG_INVALID
 * TC-JOBS-06: jobs.location: 123 → CONFIG_INVALID
 * TC-JOBS-07: jobs.location: null → CONFIG_INVALID (null is invalid enum value)
 * TC-JOBS-08: jobs is not an object → CONFIG_INVALID
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../../../src/config/schema.js";

const baseConfig = { version: 1, agents: {} };

describe("validateConfig: jobs.location field", () => {
  it("TC-JOBS-01: jobs section absent → valid", () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
    const result = validateConfig(baseConfig);
    expect(result.jobs).toBeUndefined();
  });

  it("TC-JOBS-02: jobs.location: 'project' → valid", () => {
    const raw = { ...baseConfig, jobs: { location: "project" } };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.jobs?.location).toBe("project");
  });

  it("TC-JOBS-03: jobs.location: 'xdg' → valid", () => {
    const raw = { ...baseConfig, jobs: { location: "xdg" } };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.jobs?.location).toBe("xdg");
  });

  it("TC-JOBS-04: jobs.location undefined (section present, field absent) → valid", () => {
    const raw = { ...baseConfig, jobs: {} };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.jobs?.location).toBeUndefined();
  });

  it("TC-JOBS-05: jobs.location: 'local' → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, jobs: { location: "local" } };
    expect(() => validateConfig(raw)).toThrow();
    try {
      validateConfig(raw);
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INVALID");
      expect((err as Error).message).toMatch(/jobs\.location/);
    }
  });

  it("TC-JOBS-06: jobs.location: 123 → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, jobs: { location: 123 } };
    expect(() => validateConfig(raw)).toThrow();
    try {
      validateConfig(raw);
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INVALID");
    }
  });

  it("TC-JOBS-07: jobs.location: null → CONFIG_INVALID (null is not a valid enum value)", () => {
    const raw = { ...baseConfig, jobs: { location: null } };
    expect(() => validateConfig(raw)).toThrow();
    try {
      validateConfig(raw);
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INVALID");
    }
  });

  it("TC-JOBS-08: jobs is not an object → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, jobs: "invalid" };
    expect(() => validateConfig(raw)).toThrow();
    try {
      validateConfig(raw);
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INVALID");
    }
  });
});
