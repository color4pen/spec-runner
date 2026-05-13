/**
 * Unit tests for AgentSyncer — rollback scenarios
 * TC-020: spec-fixer create fails → design + spec-review are rolled back
 * TC-021: update済みagentはrollbackされない
 * TC-022: rollback中のarchiveAgent失敗でも継続、元例外が再throw
 */
import { describe, it, expect, vi } from "vitest";
import { AgentSyncer } from "../../../src/core/agent/syncer.js";
import { AgentRegistry } from "../../../src/core/agent/registry.js";
import type { AnthropicClient, AgentData } from "../../../src/core/port/anthropic-client.js";
import type { AgentDefinition } from "../../../src/core/agent/definition.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { StepName } from "../../../src/state/schema.js";
import type { AgentSyncerConfig } from "../../../src/core/agent/syncer.js";

function makeAgentDef(role: StepName): AgentDefinition {
  return {
    name: `specrunner-${role}`,
    role,
    model: "claude-sonnet-4-5",
    system: `system for ${role}`,
    tools: [],
  };
}

function makeStep(role: StepName): AgentStep {
  return {
    kind: "agent",
    name: role,
    agent: makeAgentDef(role),
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeConfig(stored: Record<string, { agentId: string; definitionHash: string }>): AgentSyncerConfig {
  return {
    getStoredAgent(role) {
      return stored[role];
    },
  };
}

// ---------------------------------------------------------------------------
// TC-020: spec-fixer create fails → design + spec-review rolled back
// ---------------------------------------------------------------------------
describe("TC-020: spec-fixer create fails → rollback design and spec-review", () => {
  it("archives design and spec-review when spec-fixer create throws", async () => {
    const design = makeStep("design");
    const specReview = makeStep("spec-review");
    const specFixer = makeStep("spec-fixer");
    const registry = AgentRegistry.fromSteps([design, specReview, specFixer]);

    let callCount = 0;
    const createAgentSpy = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return { id: "agent_01x", version: 1 }; // design
      if (callCount === 2) return { id: "agent_02y", version: 1 }; // spec-review
      throw new Error("spec-fixer creation failed"); // spec-fixer
    });

    const archiveAgentSpy = vi.fn().mockResolvedValue(undefined);

    const client: AnthropicClient = {
      createAgent: createAgentSpy,
      retrieveAgent: vi.fn().mockRejectedValue(Object.assign(new Error("404"), { status: 404 })),
      updateAgent: vi.fn(),
      archiveAgent: archiveAgentSpy,
    };

    const storedConfig = makeConfig({});
    const syncer = new AgentSyncer(client, registry, storedConfig);

    await expect(syncer.syncAll()).rejects.toThrow("spec-fixer creation failed");

    // Both design and spec-review must be archived
    expect(archiveAgentSpy).toHaveBeenCalledWith("agent_01x");
    expect(archiveAgentSpy).toHaveBeenCalledWith("agent_02y");
    expect(archiveAgentSpy).toHaveBeenCalledTimes(2);
  });

  it("config is not partially updated when rollback occurs", async () => {
    // The syncer does not write to config — that's the caller's responsibility.
    // We verify that SyncResult is not returned (exception is thrown).
    const design = makeStep("design");
    const specFixer = makeStep("spec-fixer");
    const registry = AgentRegistry.fromSteps([design, specFixer]);

    let callCount = 0;
    const client: AnthropicClient = {
      createAgent: vi.fn(async () => {
        callCount++;
        if (callCount === 1) return { id: "agent_01x", version: 1 };
        throw new Error("spec-fixer fail");
      }),
      retrieveAgent: vi.fn().mockRejectedValue(Object.assign(new Error("404"), { status: 404 })),
      updateAgent: vi.fn(),
      archiveAgent: vi.fn().mockResolvedValue(undefined),
    };

    let result: unknown;
    try {
      result = await new AgentSyncer(client, registry, makeConfig({})).syncAll();
    } catch {
      // expected
    }
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-021: update済みagentはrollbackされない
// ---------------------------------------------------------------------------
describe("TC-021: update-only agents are NOT rolled back on partial failure", () => {
  it("does not archive the update-only design agent when spec-review create fails", async () => {
    const design = makeStep("design");
    const specReview = makeStep("spec-review");
    const registry = AgentRegistry.fromSteps([design, specReview]);

    // design hash will mismatch → update path
    const designHash = registry.hashOf("design");
    const staleHash = "sha256:stale";
    expect(staleHash).not.toBe(designHash);

    const archiveAgentSpy = vi.fn().mockResolvedValue(undefined);
    const createAgentSpy = vi.fn(async () => {
      throw new Error("spec-review create failed");
    });

    const client: AnthropicClient = {
      createAgent: createAgentSpy,
      retrieveAgent: vi.fn().mockImplementation(async (id: string) => {
        if (id === "agent_design") return { id: "agent_design", version: 1 };
        throw Object.assign(new Error("404"), { status: 404 });
      }),
      updateAgent: vi.fn().mockResolvedValue({ id: "agent_design", version: 2 }),
      archiveAgent: archiveAgentSpy,
    };

    const storedConfig = makeConfig({
      design: { agentId: "agent_design", definitionHash: staleHash },
      // spec-review: no stored entry → create
    });

    await expect(
      new AgentSyncer(client, registry, storedConfig).syncAll(),
    ).rejects.toThrow("spec-review create failed");

    // design was UPDATED (not created) → must NOT be archived
    expect(archiveAgentSpy).not.toHaveBeenCalledWith("agent_design");
    expect(archiveAgentSpy).toHaveBeenCalledTimes(0);
  });

  it("archives spec-review (create) but not design (update) in mixed scenario", async () => {
    const design = makeStep("design");
    const specReview = makeStep("spec-review");
    const specFixer = makeStep("spec-fixer");
    const registry = AgentRegistry.fromSteps([design, specReview, specFixer]);

    const archiveAgentSpy = vi.fn().mockResolvedValue(undefined);
    let createCount = 0;

    const client: AnthropicClient = {
      createAgent: vi.fn(async () => {
        createCount++;
        if (createCount === 1) return { id: "agent_spec_review", version: 1 }; // spec-review
        throw new Error("spec-fixer create failed");
      }),
      retrieveAgent: vi.fn().mockImplementation(async (id: string) => {
        if (id === "agent_design") return { id: "agent_design", version: 1 };
        throw Object.assign(new Error("404"), { status: 404 });
      }),
      updateAgent: vi.fn().mockResolvedValue({ id: "agent_design", version: 2 }),
      archiveAgent: archiveAgentSpy,
    };

    const storedConfig = makeConfig({
      design: { agentId: "agent_design", definitionHash: "sha256:stale" },
      // spec-review + spec-fixer: no stored entry → create
    });

    await expect(
      new AgentSyncer(client, registry, storedConfig).syncAll(),
    ).rejects.toThrow("spec-fixer create failed");

    // spec-review was created → should be archived
    expect(archiveAgentSpy).toHaveBeenCalledWith("agent_spec_review");
    // design was updated → should NOT be archived
    expect(archiveAgentSpy).not.toHaveBeenCalledWith("agent_design");
  });
});

// ---------------------------------------------------------------------------
// TC-022: archive failure during rollback → stderr warning, continue, rethrow original
// ---------------------------------------------------------------------------
describe("TC-022: archive failure during rollback continues and re-throws original", () => {
  it("writes stderr warning when archiveAgent fails and still re-throws original error", async () => {
    const design = makeStep("design");
    const specFixer = makeStep("spec-fixer");
    const registry = AgentRegistry.fromSteps([design, specFixer]);

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    let createCount = 0;
    const client: AnthropicClient = {
      createAgent: vi.fn(async () => {
        createCount++;
        if (createCount === 1) return { id: "agent_01x", version: 1 };
        throw new Error("spec-fixer creation failed");
      }),
      retrieveAgent: vi.fn().mockRejectedValue(Object.assign(new Error("404"), { status: 404 })),
      updateAgent: vi.fn(),
      archiveAgent: vi.fn().mockRejectedValue(new Error("Archive API error")),
    };

    const storedConfig = makeConfig({});

    let caughtError: Error | undefined;
    try {
      await new AgentSyncer(client, registry, storedConfig).syncAll();
    } catch (err) {
      caughtError = err as Error;
    }

    // Error is wrapped with role context to aid debugging
    expect(caughtError?.message).toBe("Agent sync failed for role 'spec-fixer': spec-fixer creation failed");
    // Original error preserved as cause
    expect((caughtError as NodeJS.ErrnoException & { cause?: Error })?.cause).toBeInstanceOf(Error);

    // stderr should contain warning about failed archive
    const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(stderrOutput).toContain("Failed to cleanup orphaned agent agent_01x");
    expect(stderrOutput).toContain("please archive manually");

    stderrSpy.mockRestore();
  });
});
