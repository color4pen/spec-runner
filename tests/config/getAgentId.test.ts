/**
 * Unit tests for src/config/getAgentId.ts (new schema)
 * TC-012: getAgentId returns agents[role].agentId from new schema
 * TC-013: getAgentId throws CONFIG_INCOMPLETE when design missing
 * TC-014: getAgentId throws CONFIG_INCOMPLETE when spec-fixer missing
 */
import { describe, it, expect } from "vitest";
import { getAgentId, getMaxRetries } from "../../src/config/getAgentId.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    agents: {},
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    ...overrides,
  };
}

// TC-012: getAgentId returns new schema direct value
describe("TC-012: getAgentId — design role resolved from agents.design.agentId", () => {
  it("returns agents.design.agentId when set", () => {
    const config = makeConfig({
      agents: {
        design: { agentId: "agent_01x", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
    });

    const id = getAgentId(config, "design");
    expect(id).toBe("agent_01x");
  });
});

// TC-013: getAgentId throws CONFIG_INCOMPLETE when design missing
describe("TC-013: getAgentId — throws CONFIG_INCOMPLETE when agents.design is missing", () => {
  it("throws CONFIG_INCOMPLETE when agents.design is not set", () => {
    const config = makeConfig({ agents: {} });

    expect(() => getAgentId(config, "design")).toThrow();

    try {
      getAgentId(config, "design");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INCOMPLETE");
    }
  });
});

// TC-014: getAgentId throws CONFIG_INCOMPLETE for spec-fixer missing
describe("TC-014: getAgentId — throws CONFIG_INCOMPLETE for spec-fixer role missing", () => {
  it("throws CONFIG_INCOMPLETE when agents['spec-fixer'] is not set", () => {
    const config = makeConfig({
      agents: {
        design: { agentId: "agent_01x", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
    });

    expect(() => getAgentId(config, "spec-fixer")).toThrow();

    try {
      getAgentId(config, "spec-fixer");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INCOMPLETE");
    }
  });
});

// Additional: getAgentId for spec-review role
describe("getAgentId — spec-review role resolved when agents['spec-review'] is set", () => {
  it("returns agents['spec-review'].agentId when set", () => {
    const config = makeConfig({
      agents: {
        "spec-review": { agentId: "agent_spec_review", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
    });

    const id = getAgentId(config, "spec-review");
    expect(id).toBe("agent_spec_review");
  });
});

// TC-036: config schema — maxRetries 未設定時に既定値 2 が使われる
describe("TC-036: getMaxRetries — defaults to 2 when pipeline is not configured", () => {
  it("returns 2 when config.pipeline is undefined", () => {
    const config = makeConfig();
    expect(getMaxRetries(config)).toBe(2);
  });
});

// Additional: getAgentId for spec-fixer role when configured
describe("getAgentId — spec-fixer role resolved when agents['spec-fixer'] is set", () => {
  it("returns agents['spec-fixer'].agentId when set", () => {
    const config = makeConfig({
      agents: {
        "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
    });

    const id = getAgentId(config, "spec-fixer");
    expect(id).toBe("agent_spec_fixer");
  });
});
