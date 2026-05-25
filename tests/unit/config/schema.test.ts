/**
 * Unit tests for config schema validation — jobs field backward compatibility.
 *
 * TC-JOBS-01: jobs section absent → valid (backward compat)
 * TC-JOBS-02: jobs.location: "xdg" in old config → no error, treated as unknown field
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../../../src/config/schema.js";

const baseConfig = { version: 1, agents: {} };

describe("validateConfig: jobs field backward compatibility", () => {
  it("TC-JOBS-01: jobs section absent → valid", () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
  });

  it("TC-JOBS-02: old config with jobs.location: 'xdg' → no error (unknown field ignored)", () => {
    // Old configs may have jobs: { location: "xdg" }. Validation must not reject them.
    const raw = { ...baseConfig, jobs: { location: "xdg" } };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});
