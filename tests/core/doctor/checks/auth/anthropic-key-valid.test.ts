import { describe, it, expect, vi } from "vitest";
import { anthropicKeyValidCheck } from "../../../../../src/core/doctor/checks/auth/anthropic-key-valid.js";
import { buildMockContext } from "../../mock-context.js";

const envWithKey = { SPECRUNNER_API_KEY: "sk-ant-test" };

describe("anthropicKeyValidCheck (managed/api-key-valid)", () => {
  // TC-018
  it("returns pass when fetch returns 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const ctx = buildMockContext({ fetch: mockFetch, env: envWithKey });
    const result = await anthropicKeyValidCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-019
  it("returns fail when fetch returns 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 401 }) as unknown as typeof fetch;
    const ctx = buildMockContext({ fetch: mockFetch, env: envWithKey });
    const result = await anthropicKeyValidCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/invalid|401/i);
  });

  // TC-020
  it("returns warn with 'network timeout' when fetch throws AbortError", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const mockFetch = vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch;
    const ctx = buildMockContext({ fetch: mockFetch, env: envWithKey });
    const result = await anthropicKeyValidCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/network timeout/i);
    expect(result.hint).toMatch(/[Cc]heck connectivity/i);
  });

  // TC-021
  it("returns warn when fetch returns 503", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 503 }) as unknown as typeof fetch;
    const ctx = buildMockContext({ fetch: mockFetch, env: envWithKey });
    const result = await anthropicKeyValidCheck.check(ctx);
    expect(result.status).toBe("warn");
  });

  // TC-064
  it("uses ctx.fetch and not global fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const ctx = buildMockContext({ fetch: mockFetch, env: envWithKey });
    await anthropicKeyValidCheck.check(ctx);
    expect(vi.mocked(mockFetch)).toHaveBeenCalledTimes(1);
  });

  it("returns fail when SPECRUNNER_API_KEY is not set", async () => {
    const ctx = buildMockContext({ env: {} });
    const result = await anthropicKeyValidCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
