/**
 * Unit tests for config migration
 * TC-001: 旧 schema (agent 単数) → agents.design に migration
 * TC-002: 中間 schema (specFixer camelCase) → spec-fixer に正規化
 * TC-003: 中間 schema (specReview camelCase) → spec-review に正規化
 * TC-004: 旧 schema と中間 schema 両方 → 中間が採用、propose は design に migration
 * TC-005: 片側欠損 (propose のみ) → design に migration、不足分は空のまま
 * TC-006: 片側欠損 + 旧 agent 併存 → 3 操作が独立適用
 * TC-007: どちらも未設定 → agents: {} で初期化
 * TC-008: 新 schema → migration 不発生 (no-op)
 */
import { describe, it, expect } from "vitest";
import { migrateConfig, applyMigration } from "../../../src/config/migrate.js";
import type { RawConfig } from "../../../src/config/schema.js";

function makeBase(): Partial<RawConfig> {
  return {
    version: 1,
  };
}

// TC-001: 旧 schema → agents.design
describe("TC-001: 旧 schema (agent 単数のみ) → agents.design に migration", () => {
  it("fills agents.design from agent.id", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agent: { id: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
    };

    const result = migrateConfig(raw);

    expect(result["design"]).toEqual({
      agentId: "agent_01x",
      definitionHash: "abc",
      lastSyncedAt: "2026-04-29T00:00:00Z",
    });
    expect(result["spec-review"]).toBeUndefined();
    expect(result["spec-fixer"]).toBeUndefined();
  });

  it("does NOT include agent or propose key in migrated agents", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agent: { id: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
    };

    const result = migrateConfig(raw);

    expect(Object.keys(result)).not.toContain("agent");
    expect(Object.keys(result)).not.toContain("propose");
  });
});

// TC-002: 中間 schema specFixer → spec-fixer
describe("TC-002: 中間 schema (agents.specFixer camelCase) → spec-fixer に正規化", () => {
  it("renames specFixer key to spec-fixer", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agents: {
        propose: { agentId: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
        specFixer: { agentId: "agent_03z", definitionHash: "xyz", lastSyncedAt: "2026-04-29T00:00:00Z" },
      },
    };

    const result = migrateConfig(raw);

    expect(result["spec-fixer"]).toEqual({
      agentId: "agent_03z",
      definitionHash: "xyz",
      lastSyncedAt: "2026-04-29T00:00:00Z",
    });
    expect(result["design"]).toBeDefined(); // old "propose" key is migrated to "design"
    expect(Object.keys(result)).not.toContain("specFixer");
    expect(Object.keys(result)).not.toContain("propose");
  });
});

// TC-003: 中間 schema specReview → spec-review
describe("TC-003: 中間 schema (agents.specReview camelCase) → spec-review に正規化", () => {
  it("renames specReview key to spec-review", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agents: {
        specReview: { agentId: "agent_02y", definitionHash: "def", lastSyncedAt: "2026-04-29T00:00:00Z" },
      },
    };

    const result = migrateConfig(raw);

    expect(result["spec-review"]).toEqual({
      agentId: "agent_02y",
      definitionHash: "def",
      lastSyncedAt: "2026-04-29T00:00:00Z",
    });
    expect(Object.keys(result)).not.toContain("specReview");
  });
});

// TC-004: 旧 schema と中間 schema 両方 → 中間が採用
describe("TC-004: 旧 schema と中間 schema 両方 → 中間が採用", () => {
  it("agents.propose wins over agent.id, both map to agents.design", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agent: { id: "agent_old", definitionHash: "old_hash", lastSyncedAt: "2026-04-29T00:00:00Z" },
      agents: {
        propose: { agentId: "agent_new", definitionHash: "new_hash", lastSyncedAt: "2026-04-29T00:00:00Z" },
      },
    };

    const result = migrateConfig(raw);

    expect(result["design"]?.agentId).toBe("agent_new"); // agents.propose → agents.design wins over agent.id
  });
});

// TC-005: 片側欠損 (propose のみ) → design に migration、不足分は空のまま
describe("TC-005: 片側欠損 (propose のみ存在) → design に migration、不足分は空のまま", () => {
  it("migrates propose to design, no error", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agents: {
        propose: { agentId: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
      },
    };

    const result = migrateConfig(raw);

    expect(result["design"]?.agentId).toBe("agent_01x"); // propose → design
    expect(result["spec-review"]).toBeUndefined();
    expect(result["spec-fixer"]).toBeUndefined();
  });
});

// TC-006: 片側欠損 + 旧 agent 併存 → 3 操作が独立適用
describe("TC-006: 片側欠損 + 旧 agent 併存 → 3 操作が独立適用", () => {
  it("fills design from agent.id and normalizes specFixer, leaving spec-review absent", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agent: { id: "agent_old", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
      agents: {
        specFixer: { agentId: "agent_03z", definitionHash: "xyz", lastSyncedAt: "2026-04-29T00:00:00Z" },
      },
    };

    const result = migrateConfig(raw);

    expect(result["design"]?.agentId).toBe("agent_old"); // agent.id → agents.design
    expect(result["spec-fixer"]?.agentId).toBe("agent_03z");
    expect(result["spec-review"]).toBeUndefined();
  });
});

// TC-007: どちらも未設定 → agents: {} で初期化
describe("TC-007: どちらも未設定 → agents: {} で初期化", () => {
  it("returns empty agents map with no error", () => {
    const raw: RawConfig = makeBase();

    const result = migrateConfig(raw);

    expect(result).toEqual({});
    expect(Object.keys(result).length).toBe(0);
  });
});

// TC-008: 新 schema → no-op
describe("TC-008: 新 schema → migration が発生しない (no-op)", () => {
  it("passes through new schema without change", () => {
    const agents = {
      design: { agentId: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
      "spec-review": { agentId: "agent_02y", definitionHash: "def", lastSyncedAt: "2026-04-29T00:00:00Z" },
      "spec-fixer": { agentId: "agent_03z", definitionHash: "xyz", lastSyncedAt: "2026-04-29T00:00:00Z" },
    };
    const raw: RawConfig = {
      ...makeBase(),
      agents,
    };

    const result = migrateConfig(raw);

    expect(result["design"]).toEqual(agents["design"]);
    expect(result["spec-review"]).toEqual(agents["spec-review"]);
    expect(result["spec-fixer"]).toEqual(agents["spec-fixer"]);
  });

  it("calling migration twice produces the same result", () => {
    const raw: RawConfig = {
      ...makeBase(),
      agents: {
        design: { agentId: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
      },
    };

    const r1 = migrateConfig(raw);
    // Second run on a RawConfig with the already-normalized agents
    const r2 = migrateConfig({ ...makeBase(), agents: r1 });

    expect(r1).toEqual(r2);
  });
});

// applyMigration: legacy agent field is stripped from output
describe("applyMigration: legacy agent field stripped from output", () => {
  it("does not include `agent` key in final config", () => {
    const raw = {
      version: 1 as const,
      agent: { id: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
    };

    const result = applyMigration(raw);

    expect(result).not.toHaveProperty("agent");
    expect(result.agents["design"]?.agentId).toBe("agent_01x"); // agent.id → agents.design
  });
});

// applyMigration: throws CONFIG_INVALID on non-object
describe("applyMigration: throws CONFIG_INVALID on non-object", () => {
  it("throws with code CONFIG_INVALID for null input", () => {
    expect(() => applyMigration(null)).toThrow();
    try {
      applyMigration(null);
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INVALID");
    }
  });
});

// TC-010: specFixer config preserved through migration (TC-010)
// Note: specFixer.timeoutMs was removed in remove-session-timeout.
// The test now verifies that agent migration still works for specFixer role.
describe("TC-010: top-level specFixer config preserved after migration", () => {
  it("migrates specFixer agent from camelCase to kebab-case", () => {
    const raw = {
      version: 1 as const,
      agents: {
        specFixer: { agentId: "agent_x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" },
      },
    };

    const result = applyMigration(raw);

    expect(result.agents["spec-fixer"]).toBeDefined();
    expect(result.agents["spec-fixer"]?.agentId).toBe("agent_x");
  });
});
