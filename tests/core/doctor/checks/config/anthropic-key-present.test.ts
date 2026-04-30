/**
 * TC-012: apiKey present → pass
 * TC-013: apiKey absent → fail
 */
import { describe, it, expect } from "vitest";
import { anthropicKeyPresentCheck } from "../../../../../src/core/doctor/checks/config/anthropic-key-present.js";
import { buildMockContext, buildMockConfig } from "../../mock-context.js";

describe("anthropicKeyPresentCheck", () => {
  // TC-012
  it("returns pass when anthropic.apiKey is a non-empty string", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ anthropic: { apiKey: "sk-ant-test" } }),
    });
    const result = await anthropicKeyPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-013
  it("returns fail when anthropic.apiKey is undefined", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ anthropic: {} }),
    });
    const result = await anthropicKeyPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  it("returns fail when anthropic.apiKey is empty string", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ anthropic: { apiKey: "" } }),
    });
    const result = await anthropicKeyPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
