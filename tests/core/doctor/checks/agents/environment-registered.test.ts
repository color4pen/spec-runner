/**
 * TC-035: environment.id present → pass
 * TC-036: environment.id missing → fail
 */
import { describe, it, expect } from "vitest";
import { environmentRegisteredCheck } from "../../../../../src/core/doctor/checks/agents/environment-registered.js";
import { buildMockContext, buildMockConfig } from "../../mock-context.js";

describe("environmentRegisteredCheck", () => {
  // TC-035
  it("returns pass when environment.id is set", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ environment: { id: "env_abc123" } }),
    });
    const result = await environmentRegisteredCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("env_abc123");
  });

  // TC-036
  it("returns fail when environment.id is undefined", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ environment: {} }),
    });
    const result = await environmentRegisteredCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  it("returns fail when environment is missing entirely", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({}),
    });
    const result = await environmentRegisteredCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
