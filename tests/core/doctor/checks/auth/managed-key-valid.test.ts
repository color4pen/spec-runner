import { describe, it, expect, vi } from "vitest";
import { managedKeyValidCheck } from "../../../../../src/core/doctor/checks/auth/managed-key-valid.js";
import { buildMockContext } from "../../mock-context.js";

describe("managedKeyValidCheck (managed/api-key-valid)", () => {
  // TC-018
  it("returns pass when fetch returns 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const ctx = buildMockContext({
      fetch: mockFetch,
      resolvedSpecRunnerApiKey: "sk-ant-test",
      specRunnerApiKeySource: "env",
    });
    const result = await managedKeyValidCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-019
  it("returns fail when fetch returns 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 401 }) as unknown as typeof fetch;
    const ctx = buildMockContext({
      fetch: mockFetch,
      resolvedSpecRunnerApiKey: "sk-ant-test",
      specRunnerApiKeySource: "env",
    });
    const result = await managedKeyValidCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/invalid|401/i);
  });

  // TC-020
  it("returns warn with 'network timeout' when fetch throws AbortError", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const mockFetch = vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch;
    const ctx = buildMockContext({
      fetch: mockFetch,
      resolvedSpecRunnerApiKey: "sk-ant-test",
      specRunnerApiKeySource: "env",
    });
    const result = await managedKeyValidCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/network timeout/i);
    expect(result.hint).toMatch(/[Cc]heck connectivity/i);
  });

  // TC-021
  it("returns warn when fetch returns 503", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 503 }) as unknown as typeof fetch;
    const ctx = buildMockContext({
      fetch: mockFetch,
      resolvedSpecRunnerApiKey: "sk-ant-test",
      specRunnerApiKeySource: "env",
    });
    const result = await managedKeyValidCheck.check(ctx);
    expect(result.status).toBe("warn");
  });

  // TC-064
  it("uses ctx.fetch and not global fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const ctx = buildMockContext({
      fetch: mockFetch,
      resolvedSpecRunnerApiKey: "sk-ant-test",
      specRunnerApiKeySource: "env",
    });
    await managedKeyValidCheck.check(ctx);
    expect(vi.mocked(mockFetch)).toHaveBeenCalledTimes(1);
  });

  // TC-DCHK-003: fail when resolvedSpecRunnerApiKey is null
  it("returns fail when resolvedSpecRunnerApiKey is null", async () => {
    const ctx = buildMockContext({
      resolvedSpecRunnerApiKey: null,
      specRunnerApiKeySource: null,
    });
    const result = await managedKeyValidCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  // TC-DCHK-004: uses resolvedSpecRunnerApiKey in fetch header
  it("uses resolvedSpecRunnerApiKey as x-api-key in fetch header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const ctx = buildMockContext({
      fetch: mockFetch,
      resolvedSpecRunnerApiKey: "sk-ant-valid",
      specRunnerApiKeySource: "credentials",
    });
    await managedKeyValidCheck.check(ctx);
    const calls = vi.mocked(mockFetch).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const callArgs = calls[0]!;
    const options = callArgs[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-valid");
  });
});
