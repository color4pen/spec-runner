import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRuntimePrereqs } from "../../../src/core/runtime/prereqs.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

// Mock the anthropic resolver so tests don't hit the filesystem
vi.mock("../../../src/core/credentials/anthropic.js", () => ({
  resolveSpecRunnerApiKey: vi.fn().mockImplementation(
    async (env: Record<string, string | undefined>, opts?: { optional?: boolean }) => {
      const key = env["SPECRUNNER_API_KEY"];
      if (key) return { apiKey: key, source: "env" };
      if (opts?.optional) return undefined;
      throw new Error("ANTHROPIC_KEY_MISSING");
    },
  ),
}));
vi.mock("../../../src/core/credentials/requirements.js", () => ({
  requirementsFor: vi.fn().mockImplementation((runtime: string) => {
    if (runtime === "managed") {
      return [{ key: "anthropic.apiKey", envVar: "SPECRUNNER_API_KEY" }];
    }
    return [];
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "managed",
    agents: {
      design: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01T00:00:00.000Z" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  } as SpecRunnerConfig;
}

describe("checkRuntimePrereqs", () => {
  // Case 1: managed + SPECRUNNER_API_KEY missing
  it("returns field=SPECRUNNER_API_KEY when env var is not set", async () => {
    const cfg = makeConfig({ runtime: "managed" });
    const result = await checkRuntimePrereqs(cfg, {});
    expect(result).not.toBeNull();
    expect(result?.field).toBe("SPECRUNNER_API_KEY");
  });

  // Case 2: managed + agents.design missing
  it("returns field=agents.design.agentId when agents.design is missing", async () => {
    const cfg = makeConfig({ runtime: "managed", agents: {} });
    const result = await checkRuntimePrereqs(cfg, { SPECRUNNER_API_KEY: "test-key" });
    expect(result).not.toBeNull();
    expect(result?.field).toBe("agents.design.agentId");
  });

  // Case 3: managed + environment missing
  it("returns field=environment.id when environment is missing", async () => {
    const cfg = makeConfig({ runtime: "managed", environment: undefined });
    const result = await checkRuntimePrereqs(cfg, { SPECRUNNER_API_KEY: "test-key" });
    expect(result).not.toBeNull();
    expect(result?.field).toBe("environment.id");
  });

  // Case 4: managed + all present → null
  it("returns null when all managed prereqs are present", async () => {
    const cfg = makeConfig({ runtime: "managed" });
    const result = await checkRuntimePrereqs(cfg, { SPECRUNNER_API_KEY: "test-key" });
    expect(result).toBeNull();
  });

  // Case 5: local → null immediately
  it("returns null for local runtime without checking other fields", async () => {
    const cfg = makeConfig({ runtime: "local", agents: {}, environment: undefined });
    const result = await checkRuntimePrereqs(cfg, {});
    expect(result).toBeNull();
  });

  // Case 6: runtime undefined → local → null
  it("returns null when runtime is undefined (defaults to local)", async () => {
    const cfg = { version: 1, agents: {}, runtime: undefined } as unknown as SpecRunnerConfig;
    const result = await checkRuntimePrereqs(cfg, {});
    expect(result).toBeNull();
  });
});
