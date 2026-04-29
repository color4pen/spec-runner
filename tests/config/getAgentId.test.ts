/**
 * Unit tests for src/config/getAgentId.ts
 * TC-024: getAgentId — propose role resolved from agents.propose.id
 * TC-025: getAgentId — propose role legacy fallback from config.agent.id
 * TC-026: getAgentId — specFixer role throws CONFIG_INCOMPLETE without agents.specFixer
 */
import { describe, it, expect } from "vitest";
import { getAgentId, getMaxRetries } from "../../src/config/getAgentId.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    anthropic: { apiKey: "sk-test" },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    ...overrides,
  };
}

// TC-024: getAgentId — propose ロールの新形式解決
describe("TC-024: getAgentId — propose role resolved from agents.propose.id", () => {
  it("returns agents.propose.id when set", () => {
    const config = makeConfig({
      agents: {
        propose: { id: "agent_01x", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
      agent: { id: "agent_legacy", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
    });

    const id = getAgentId(config, "propose");
    expect(id).toBe("agent_01x");
  });
});

// TC-025: getAgentId — propose ロールの legacy フォールバック
describe("TC-025: getAgentId — propose role falls back to config.agent.id", () => {
  it("returns config.agent.id when agents.propose.id is not set", () => {
    const config = makeConfig({
      agent: { id: "agent_01x", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
    });

    const id = getAgentId(config, "propose");
    expect(id).toBe("agent_01x");
  });
});

// TC-026: getAgentId — specFixer ロールで legacy fallback は CONFIG_INCOMPLETE
describe("TC-026: getAgentId — specFixer role throws CONFIG_INCOMPLETE without agents.specFixer", () => {
  it("throws CONFIG_INCOMPLETE when agents.specFixer.id is not set", () => {
    const config = makeConfig({
      agent: { id: "agent_01x", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
    });

    expect(() => getAgentId(config, "specFixer")).toThrow();

    try {
      getAgentId(config, "specFixer");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INCOMPLETE");
    }
  });
});

// TC-036: config schema — maxRetries 未設定時に既定値 2 が使われる
describe("TC-036: getMaxRetries — defaults to 2 when pipeline is not configured", () => {
  it("returns 2 when config.pipeline is undefined", () => {
    const config = makeConfig();
    expect(getMaxRetries(config)).toBe(2);
  });
});

// Additional: getAgentId with specFixer role when configured
describe("getAgentId — specFixer role resolved when agents.specFixer.id is set", () => {
  it("returns agents.specFixer.id when set", () => {
    const config = makeConfig({
      agents: {
        specFixer: { id: "agent_spec_fixer", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
      agent: { id: "agent_01x", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
    });

    const id = getAgentId(config, "specFixer");
    expect(id).toBe("agent_spec_fixer");
  });
});
