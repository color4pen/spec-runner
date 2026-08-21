/**
 * Unit tests for src/core/doctor/checks/config/model-existence.ts
 *
 * TC-031: doctor check で取得成功 + 未知モデルのとき fail を返す
 * TC-032: doctor check で probe 未注入または unavailable のとき warn を返す
 */

import { describe, it, expect, vi } from "vitest";
import { modelExistenceCheck } from "../../../../../src/core/doctor/checks/config/model-existence.js";
import { buildMockContext } from "../../mock-context.js";
import type { SupportedModelsProbe } from "../../../../../src/core/port/model-listing.js";

// ---------------------------------------------------------------------------
// TC-031: doctor check で取得成功 + 未知モデルのとき fail を返す
// ---------------------------------------------------------------------------

describe("TC-031: doctor check returns fail when listed + unknown models", () => {
  it("probe returns empty listed models → fail (standard descriptor has anthropic models)", async () => {
    // The STANDARD_DESCRIPTOR uses models like "claude-opus-5" and "claude-sonnet-5".
    // With an empty models list, those full IDs are unknown → fail.
    const probe: SupportedModelsProbe = vi.fn().mockResolvedValue({
      kind: "listed",
      models: [] as string[],
    });

    const ctx = buildMockContext({ supportedModelsProbe: probe });
    const result = await modelExistenceCheck.check(ctx);

    expect(result.status).toBe("fail");
  });

  it("fail result includes details with step name and model info", async () => {
    const probe: SupportedModelsProbe = vi.fn().mockResolvedValue({
      kind: "listed",
      models: [] as string[],
    });

    const ctx = buildMockContext({ supportedModelsProbe: probe });
    const result = await modelExistenceCheck.check(ctx);

    expect(result.status).toBe("fail");
    expect(result.details).toBeDefined();
    expect(Array.isArray(result.details)).toBe(true);
    // At least one detail should contain a step name and model ID
    const details = result.details ?? [];
    expect(details.length).toBeGreaterThan(0);
    // Check that at least one detail references a step name and model
    const hasStepRef = details.some((d) => d.includes("step") || d.includes("step "));
    expect(hasStepRef).toBe(true);
  });

  it("probe is called with the environment when present", async () => {
    const probe: SupportedModelsProbe = vi.fn().mockResolvedValue({
      kind: "listed",
      models: [] as string[],
    });

    const testEnv = { SOME_VAR: "value" };
    const ctx = buildMockContext({ supportedModelsProbe: probe, env: testEnv });
    await modelExistenceCheck.check(ctx);

    expect(probe).toHaveBeenCalledWith(testEnv);
  });
});

// ---------------------------------------------------------------------------
// TC-032: doctor check で probe 未注入または unavailable のとき warn を返す
// ---------------------------------------------------------------------------

describe("TC-032: doctor check returns warn when probe absent or unavailable", () => {
  it("no supportedModelsProbe in context → warn", async () => {
    // DoctorContext without supportedModelsProbe (omit = undefined)
    const ctx = buildMockContext({ supportedModelsProbe: undefined });
    const result = await modelExistenceCheck.check(ctx);

    expect(result.status).toBe("warn");
  });

  it("probe returns unavailable → warn (not fail)", async () => {
    const probe: SupportedModelsProbe = vi.fn().mockResolvedValue({
      kind: "unavailable",
      reason: "Claude Code SDK not available",
    });

    const ctx = buildMockContext({ supportedModelsProbe: probe });
    const result = await modelExistenceCheck.check(ctx);

    expect(result.status).toBe("warn");
  });

  it("probe unavailable with reason 'offline' → warn", async () => {
    const probe: SupportedModelsProbe = vi.fn().mockResolvedValue({
      kind: "unavailable",
      reason: "offline",
    });

    const ctx = buildMockContext({ supportedModelsProbe: probe });
    const result = await modelExistenceCheck.check(ctx);

    expect(result.status).toBe("warn");
  });

  it("check is not required (soft failure)", () => {
    expect(modelExistenceCheck.required).toBe(false);
  });

  it("check category is 'config'", () => {
    expect(modelExistenceCheck.category).toBe("config");
  });

  it("check name is 'config/model-existence'", () => {
    expect(modelExistenceCheck.name).toBe("config/model-existence");
  });
});
