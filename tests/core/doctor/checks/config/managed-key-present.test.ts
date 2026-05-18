import { describe, it, expect } from "vitest";
import { managedKeyPresentCheck } from "../../../../../src/core/doctor/checks/config/managed-key-present.js";
import { buildMockContext } from "../../mock-context.js";

describe("managedKeyPresentCheck (managed/api-key-present)", () => {
  // TC-DCHK-001: pass when resolvedSpecRunnerApiKey is present
  it("returns pass when resolvedSpecRunnerApiKey is set", async () => {
    const ctx = buildMockContext({
      resolvedSpecRunnerApiKey: "sk-test",
      specRunnerApiKeySource: "env",
    });
    const result = await managedKeyPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-DCHK-001: message includes source
  it("includes source in pass message", async () => {
    const ctx = buildMockContext({
      resolvedSpecRunnerApiKey: "sk-test",
      specRunnerApiKeySource: "env",
    });
    const result = await managedKeyPresentCheck.check(ctx);
    expect(result.message).toContain("source: env");
  });

  // TC-DCHK-001: credentials source in message
  it("includes credentials source in pass message", async () => {
    const ctx = buildMockContext({
      resolvedSpecRunnerApiKey: "sk-test",
      specRunnerApiKeySource: "credentials",
    });
    const result = await managedKeyPresentCheck.check(ctx);
    expect(result.message).toContain("source: credentials");
  });

  // TC-DCHK-002: fail when resolvedSpecRunnerApiKey is null
  it("returns fail when resolvedSpecRunnerApiKey is null", async () => {
    const ctx = buildMockContext({
      resolvedSpecRunnerApiKey: null,
      specRunnerApiKeySource: null,
    });
    const result = await managedKeyPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  // TC-DCHK-002: hint mentions credentials.json
  it("hint mentions credentials.json when failing", async () => {
    const ctx = buildMockContext({
      resolvedSpecRunnerApiKey: null,
      specRunnerApiKeySource: null,
    });
    const result = await managedKeyPresentCheck.check(ctx);
    expect(result.hint).toBeDefined();
    expect(result.hint).toMatch(/credentials/i);
  });
});
