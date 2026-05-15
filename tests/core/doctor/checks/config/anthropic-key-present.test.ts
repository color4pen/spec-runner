import { describe, it, expect } from "vitest";
import { anthropicKeyPresentCheck } from "../../../../../src/core/doctor/checks/config/anthropic-key-present.js";
import { buildMockContext } from "../../mock-context.js";

describe("anthropicKeyPresentCheck (managed/api-key-present)", () => {
  it("returns pass when SPECRUNNER_API_KEY env var is set", async () => {
    const ctx = buildMockContext({ env: { SPECRUNNER_API_KEY: "sk-test" } });
    const result = await anthropicKeyPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  it("returns fail when SPECRUNNER_API_KEY is not set", async () => {
    const ctx = buildMockContext({ env: {} });
    const result = await anthropicKeyPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  it("returns fail when SPECRUNNER_API_KEY is empty string", async () => {
    const ctx = buildMockContext({ env: { SPECRUNNER_API_KEY: "" } });
    const result = await anthropicKeyPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
