/**
 * TC-037: hash matches → pass
 * TC-038: hash mismatch → warn with "definition drifted" + hint
 * TC-079: check delegates to AgentRegistry.hashOf (behavioral assertion)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { definitionDriftCheck } from "../../../../../src/core/doctor/checks/agents/definition-drift.js";
import { buildMockContext, buildMockConfig } from "../../mock-context.js";
import { AgentRegistry } from "../../../../../src/core/agent/index.js";
import { DesignStep } from "../../../../../src/core/step/design.js";
import { SpecReviewStep } from "../../../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../../../src/core/step/spec-fixer.js";
import { ImplementerStep } from "../../../../../src/core/step/implementer.js";
import { BuildFixerStep } from "../../../../../src/core/step/build-fixer.js";
import { CodeReviewStep } from "../../../../../src/core/step/code-review.js";
import { CodeFixerStep } from "../../../../../src/core/step/code-fixer.js";

// Get current hashes via AgentRegistry (same function reused in definition-drift check)
const registry = AgentRegistry.fromSteps([
  DesignStep, SpecReviewStep, SpecFixerStep,
  ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep,
]);

function currentHashes() {
  const roles = ["design", "spec-review", "spec-fixer", "implementer", "build-fixer", "code-review", "code-fixer"] as const;
  const agents: Record<string, unknown> = {};
  for (const role of roles) {
    agents[role] = { agentId: `agent_${role}`, definitionHash: registry.hashOf(role) };
  }
  return agents;
}

describe("definitionDriftCheck", () => {
  // TC-037
  it("returns pass when all hashes match current definitions", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ agents: currentHashes() }),
    });
    const result = await definitionDriftCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-038
  it("returns warn when hash mismatches exist", async () => {
    const agentsWithStaleHash = {
      ...currentHashes(),
      design: { agentId: "agent_design", definitionHash: "sha256:stale_hash_12345" },
    };
    const ctx = buildMockContext({
      config: buildMockConfig({ agents: agentsWithStaleHash }),
    });
    const result = await definitionDriftCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/definition drifted/i);
    expect(result.hint).toContain("specrunner runtime setup");
  });

  // TC-079
  it("delegates hash computation to AgentRegistry.hashOf when checking hashes", async () => {
    // Spy on the prototype method to confirm it is actually called during check()
    const hashOfSpy = vi.spyOn(AgentRegistry.prototype, "hashOf");
    const agentsWithHash = {
      ...currentHashes(),
    };
    const ctx = buildMockContext({
      config: buildMockConfig({ agents: agentsWithHash }),
    });
    await definitionDriftCheck.check(ctx);
    expect(hashOfSpy).toHaveBeenCalled();
    hashOfSpy.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
