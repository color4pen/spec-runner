/**
 * Unit tests for AgentSyncer — core sync scenarios
 * TC-015: no-op when definitionHash matches
 * TC-016: update when definitionHash differs
 * TC-017: 404 fallback → create
 * TC-018: new role (no stored entry) → create
 * TC-019: idempotent (2nd run → all no-op)
 * TC-023: SyncResult per-role action kinds
 * TC-055: fake AnthropicClient injection
 */
import { describe, it, expect, vi } from "vitest";
import { AgentSyncer } from "../../../src/core/agent/syncer.js";
import { AgentRegistry } from "../../../src/core/agent/registry.js";
import type { AnthropicClient, AgentData } from "../../../src/core/port/anthropic-client.js";
import type { AgentDefinition } from "../../../src/core/agent/definition.js";
import type { Step } from "../../../src/core/step/types.js";
import type { StepName } from "../../../src/state/schema.js";
import type { AgentSyncerConfig } from "../../../src/core/agent/syncer.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAgentDef(role: StepName, system: string = "system"): AgentDefinition {
  return {
    name: `specrunner-${role}`,
    role,
    model: "claude-sonnet-4-5",
    system,
    tools: [],
  };
}

function makeStep(role: StepName, system?: string): Step {
  return {
    name: role,
    agent: makeAgentDef(role, system),
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

/**
 * In-memory fake AnthropicClient backed by a Map.
 */
class FakeAnthropicClient implements AnthropicClient {
  private agents = new Map<string, { id: string; version: number; def: AgentDefinition }>();
  private archived = new Set<string>();
  private nextId = 1;

  // Spies exposed for assertions
  createAgentSpy = vi.fn();
  retrieveAgentSpy = vi.fn();
  updateAgentSpy = vi.fn();
  archiveAgentSpy = vi.fn();

  async createAgent(def: AgentDefinition): Promise<AgentData> {
    this.createAgentSpy(def);
    const id = `agent_${String(this.nextId++).padStart(3, "0")}`;
    const record = { id, version: 1, def };
    this.agents.set(id, record);
    return { id, version: 1 };
  }

  async retrieveAgent(agentId: string): Promise<AgentData> {
    this.retrieveAgentSpy(agentId);
    if (this.archived.has(agentId)) {
      const err = Object.assign(new Error("Not found"), { status: 404 });
      throw err;
    }
    const record = this.agents.get(agentId);
    if (!record) {
      const err = Object.assign(new Error("Not found"), { status: 404 });
      throw err;
    }
    return { id: record.id, version: record.version };
  }

  async updateAgent(agentId: string, def: AgentDefinition): Promise<AgentData> {
    this.updateAgentSpy(agentId, def);
    const record = this.agents.get(agentId);
    if (!record) throw new Error("Agent not found");
    record.def = def;
    record.version++;
    return { id: agentId, version: record.version };
  }

  async archiveAgent(agentId: string): Promise<void> {
    this.archiveAgentSpy(agentId);
    this.archived.add(agentId);
  }

  /** Seed an existing agent in the fake store */
  seed(id: string, def: AgentDefinition): void {
    this.agents.set(id, { id, version: 1, def });
  }
}

function makeConfig(stored: Record<string, { agentId: string; definitionHash: string }>): AgentSyncerConfig {
  return {
    getStoredAgent(role) {
      const entry = stored[role];
      return entry;
    },
  };
}

// ---------------------------------------------------------------------------
// TC-015: no-op when definitionHash matches
// ---------------------------------------------------------------------------
describe("TC-015: AgentSyncer no-op when hash matches", () => {
  it("calls neither createAgent nor updateAgent", async () => {
    const propose = makeStep("propose");
    const registry = AgentRegistry.fromSteps([propose]);
    const hash = registry.hashOf("propose");

    const client = new FakeAnthropicClient();
    client.seed("agent_001", propose.agent);

    const storedConfig = makeConfig({ propose: { agentId: "agent_001", definitionHash: hash } });
    const syncer = new AgentSyncer(client, registry, storedConfig);

    const result = await syncer.syncAll();

    expect(client.createAgentSpy).not.toHaveBeenCalled();
    expect(client.updateAgentSpy).not.toHaveBeenCalled();
    expect(result.results.get("propose")?.action).toBe("no-op");
    expect(result.results.get("propose")?.agentId).toBe("agent_001");
    expect(result.results.get("propose")?.definitionHash).toBe(hash);
  });
});

// ---------------------------------------------------------------------------
// TC-016: update when definitionHash differs
// ---------------------------------------------------------------------------
describe("TC-016: AgentSyncer update when hash differs", () => {
  it("calls updateAgent once with new definition", async () => {
    const propose = makeStep("propose");
    const registry = AgentRegistry.fromSteps([propose]);
    const currentHash = registry.hashOf("propose");

    const client = new FakeAnthropicClient();
    client.seed("agent_001", propose.agent);

    const storedConfig = makeConfig({ propose: { agentId: "agent_001", definitionHash: "sha256:old_hash" } });
    const syncer = new AgentSyncer(client, registry, storedConfig);

    const result = await syncer.syncAll();

    expect(client.updateAgentSpy).toHaveBeenCalledTimes(1);
    expect(client.updateAgentSpy).toHaveBeenCalledWith("agent_001", propose.agent);
    expect(client.createAgentSpy).not.toHaveBeenCalled();
    expect(result.results.get("propose")?.action).toBe("update");
    expect(result.results.get("propose")?.agentId).toBe("agent_001");
    expect(result.results.get("propose")?.definitionHash).toBe(currentHash);
  });
});

// ---------------------------------------------------------------------------
// TC-017: 404 fallback → create
// ---------------------------------------------------------------------------
describe("TC-017: AgentSyncer 404 fallback → create", () => {
  it("calls createAgent when retrieveAgent returns 404", async () => {
    const propose = makeStep("propose");
    const registry = AgentRegistry.fromSteps([propose]);
    const currentHash = registry.hashOf("propose");

    const client = new FakeAnthropicClient();
    // Do NOT seed "agent_001" — retrieval will 404

    const storedConfig = makeConfig({ propose: { agentId: "agent_001", definitionHash: currentHash } });
    const syncer = new AgentSyncer(client, registry, storedConfig);

    const result = await syncer.syncAll();

    expect(client.retrieveAgentSpy).toHaveBeenCalledWith("agent_001");
    expect(client.createAgentSpy).toHaveBeenCalledTimes(1);
    const newId = result.results.get("propose")?.agentId;
    expect(newId).toBeDefined();
    // A new agent was created — the ID may be any string (fake generates incrementing IDs)
    expect(result.results.get("propose")?.action).toBe("create");
  });
});

// ---------------------------------------------------------------------------
// TC-018: new role (no stored entry) → create
// ---------------------------------------------------------------------------
describe("TC-018: AgentSyncer new role → create", () => {
  it("calls createAgent for a role with no stored entry", async () => {
    const specReview = makeStep("spec-review");
    const registry = AgentRegistry.fromSteps([specReview]);

    const client = new FakeAnthropicClient();
    const storedConfig = makeConfig({}); // no stored entry for spec-review
    const syncer = new AgentSyncer(client, registry, storedConfig);

    const result = await syncer.syncAll();

    expect(client.createAgentSpy).toHaveBeenCalledTimes(1);
    const record = result.results.get("spec-review");
    expect(record?.action).toBe("create");
    expect(record?.agentId).toBeDefined();
    expect(record?.definitionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// TC-019: idempotent (2nd run → all no-op)
// ---------------------------------------------------------------------------
describe("TC-019: AgentSyncer is idempotent", () => {
  it("2nd syncAll produces no create/update calls", async () => {
    const propose = makeStep("propose");
    const registry = AgentRegistry.fromSteps([propose]);

    const client = new FakeAnthropicClient();
    const storedConfig1 = makeConfig({});
    const syncer1 = new AgentSyncer(client, registry, storedConfig1);

    // 1st run
    const result1 = await syncer1.syncAll();
    const newId = result1.results.get("propose")!.agentId;
    const newHash = result1.results.get("propose")!.definitionHash;

    // Reset spy counts
    client.createAgentSpy.mockClear();
    client.updateAgentSpy.mockClear();

    // 2nd run with stored data from 1st run
    const storedConfig2 = makeConfig({ propose: { agentId: newId, definitionHash: newHash } });
    const syncer2 = new AgentSyncer(client, registry, storedConfig2);
    const result2 = await syncer2.syncAll();

    expect(client.createAgentSpy).not.toHaveBeenCalled();
    expect(client.updateAgentSpy).not.toHaveBeenCalled();
    expect(result2.results.get("propose")?.action).toBe("no-op");
  });
});

// ---------------------------------------------------------------------------
// TC-023: SyncResult per-role action kinds
// ---------------------------------------------------------------------------
describe("TC-023: SyncResult per-role action kinds", () => {
  it("returns correct action for each role in a mixed scenario", async () => {
    const propose = makeStep("propose");
    const specReview = makeStep("spec-review");
    const specFixer = makeStep("spec-fixer");
    const registry = AgentRegistry.fromSteps([propose, specReview, specFixer]);

    const proposeHash = registry.hashOf("propose");
    const specFixerHash = "sha256:old_spec_fixer_hash"; // stale hash for spec-fixer

    const client = new FakeAnthropicClient();
    // Seed propose (matching hash → no-op) and spec-fixer (stale hash → update)
    client.seed("agent_propose", propose.agent);
    client.seed("agent_spec_fixer", specFixer.agent);

    const storedConfig = makeConfig({
      propose: { agentId: "agent_propose", definitionHash: proposeHash },
      // spec-review: not stored → create
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: specFixerHash },
    });

    const syncer = new AgentSyncer(client, registry, storedConfig);
    const result = await syncer.syncAll();

    expect(result.results.get("propose")?.action).toBe("no-op");
    expect(result.results.get("spec-review")?.action).toBe("create");
    expect(result.results.get("spec-fixer")?.action).toBe("update");
  });
});

// ---------------------------------------------------------------------------
// TC-055: fake AnthropicClient injection
// ---------------------------------------------------------------------------
describe("TC-055: fake AnthropicClient injection", () => {
  it("syncAll works end-to-end with fake client, no real HTTP", async () => {
    const propose = makeStep("propose");
    const registry = AgentRegistry.fromSteps([propose]);
    const client = new FakeAnthropicClient();
    const storedConfig = makeConfig({});
    const syncer = new AgentSyncer(client, registry, storedConfig);

    const result = await syncer.syncAll();

    expect(result.results.size).toBe(1);
    expect(result.results.get("propose")?.action).toBe("create");
  });
});
