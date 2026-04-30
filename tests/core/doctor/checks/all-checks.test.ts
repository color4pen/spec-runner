/**
 * TC-068: allChecks has >= 18 checks covering all 7 categories
 * TC-076: all checks satisfy DoctorCheck interface (TypeScript-level check passes at import time)
 */
import { describe, it, expect } from "vitest";
import { allChecks } from "../../../../src/core/doctor/checks/index.js";

describe("allChecks", () => {
  // TC-068
  it("contains at least 18 checks", () => {
    expect(allChecks.length).toBeGreaterThanOrEqual(18);
  });

  it("covers all 7 categories", () => {
    const categories = new Set(allChecks.map((c) => c.category));
    const required = ["runtime", "config", "env", "auth", "repo", "agents", "storage"];
    for (const cat of required) {
      expect(categories.has(cat as never), `category ${cat} missing`).toBe(true);
    }
  });

  // TC-076
  it("each check has name, category, required, and check function", () => {
    for (const check of allChecks) {
      expect(typeof check.name).toBe("string");
      expect(check.name.length).toBeGreaterThan(0);
      expect(typeof check.category).toBe("string");
      expect(typeof check.required).toBe("boolean");
      expect(typeof check.check).toBe("function");
    }
  });
});
