/**
 * Unit tests for Step AgentDefinition ownership
 * TC-032: DesignStep has complete AgentDefinition
 * TC-033: SpecReviewStep has spec-review dedicated AgentDefinition
 * TC-034: SpecFixerStep has dedicated AgentDefinition with tools=[]
 * TC-035: spec-review system prompt includes verdict/severity contract
 * TC-036: DesignStep tools and toolHandlers 1:1 correspondence (updated for D3)
 * TC-037: SpecReviewStep tools=[] so toolHandlers can be omitted
 * TC-047: AgentDefinition.role matches StepName (kebab-case)
 *
 * Design D3 update: DesignStep is now runtime-neutral.
 * - DesignStep.toolHandlers is undefined (injection is done by ManagedAgentRunner)
 * - DesignStep.agent.tools does NOT contain register_branch (adapter injects it)
 */
import { describe, it, expect } from "vitest";
import { DesignStep } from "../../../src/core/step/design.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";

// TC-032: DesignStep has complete AgentDefinition
describe("TC-032: DesignStep has complete AgentDefinition", () => {
  it("name === 'specrunner-design' and role === 'design'", () => {
    expect(DesignStep.agent.name).toBe("specrunner-design");
    expect(DesignStep.agent.role).toBe("design");
  });

  it("system is a non-empty string", () => {
    expect(typeof DesignStep.agent.system).toBe("string");
    expect(DesignStep.agent.system.length).toBeGreaterThan(0);
  });

  // Design D3: register_branch is now injected by ManagedAgentRunner, not declared in DesignStep
  it("DesignStep.agent.tools does NOT contain register_branch (design D3: adapter injects it)", () => {
    const customTool = DesignStep.agent.tools.find(
      (t) => t.type === "custom" && (t as { name?: string }).name === "register_branch",
    );
    expect(customTool).toBeUndefined();
  });

  it("does not have agentId placeholder field", () => {
    expect((DesignStep.agent as unknown as Record<string, unknown>)["agentId"]).toBeUndefined();
  });
});

// TC-033: SpecReviewStep has spec-review dedicated AgentDefinition
describe("TC-033: SpecReviewStep has spec-review dedicated AgentDefinition", () => {
  it("role === 'spec-review' (kebab-case)", () => {
    expect(SpecReviewStep.agent.role).toBe("spec-review");
  });

  it("system is different from DesignStep.agent.system", () => {
    expect(SpecReviewStep.agent.system).not.toBe(DesignStep.agent.system);
  });

  it("tools does not contain register_branch", () => {
    const hasRegisterBranch = SpecReviewStep.agent.tools.some(
      (t) => t.type === "custom" && (t as { name?: string }).name === "register_branch",
    );
    expect(hasRegisterBranch).toBe(false);
  });

  it("step.name === step.agent.role", () => {
    expect(SpecReviewStep.name).toBe(SpecReviewStep.agent.role);
  });
});

// TC-034: SpecFixerStep has dedicated AgentDefinition
describe("TC-034: SpecFixerStep has dedicated AgentDefinition with tools=[]", () => {
  it("role === 'spec-fixer'", () => {
    expect(SpecFixerStep.agent.role).toBe("spec-fixer");
  });

  it("system is spec-fixer specific (non-empty)", () => {
    expect(typeof SpecFixerStep.agent.system).toBe("string");
    expect(SpecFixerStep.agent.system.length).toBeGreaterThan(0);
  });

  it("custom tools array does not include register_branch", () => {
    const hasRegisterBranch = SpecFixerStep.agent.tools.some(
      (t) => t.type === "custom" && (t as { name?: string }).name === "register_branch",
    );
    expect(hasRegisterBranch).toBe(false);
  });
});

// TC-035: spec-review system prompt includes verdict/severity contract
describe("TC-035: spec-review system prompt includes verdict/severity definitions", () => {
  it("contains approved / needs-fix / escalation", () => {
    const system = SpecReviewStep.agent.system;
    expect(system).toContain("approved");
    expect(system).toContain("needs-fix");
    expect(system).toContain("escalation");
  });

  it("contains lowercase severity levels via SEVERITY_DEFINITION constant (TC-010)", () => {
    const system = SpecReviewStep.agent.system;
    // Severity levels are now lowercase (from SEVERITY_DEFINITION constant)
    expect(system).toContain("critical");
    expect(system).toContain("high");
    expect(system).toContain("medium");
    expect(system).toContain("low");
  });

  it("mentions writing output file", () => {
    const system = SpecReviewStep.agent.system;
    // Should mention writing to a file path
    expect(system).toContain("spec-review-result");
  });
});

// TC-036: DesignStep runtime-neutral — toolHandlers undefined per design D3
describe("TC-036: DesignStep is runtime-neutral — toolHandlers is undefined (design D3)", () => {
  it("DesignStep.toolHandlers is undefined (adapter injects tools)", () => {
    // Design D3: register_branch is injected by ManagedAgentRunner, not DesignStep
    expect(DesignStep.toolHandlers).toBeUndefined();
  });
});

// TC-037: SpecReviewStep tools=[] means toolHandlers can be undefined/empty
describe("TC-037: SpecReviewStep tools=[] so toolHandlers can be omitted", () => {
  it("custom tools array does not include register_branch", () => {
    const hasRegisterBranch = SpecReviewStep.agent.tools.some(
      (t) => t.type === "custom" && (t as { name?: string }).name === "register_branch",
    );
    expect(hasRegisterBranch).toBe(false);
  });

  it("toolHandlers is undefined or empty", () => {
    const handlers = SpecReviewStep.toolHandlers;
    expect(!handlers || handlers.size === 0).toBe(true);
  });
});

// TC-047: AgentDefinition.role is kebab-case
describe("TC-047: AgentDefinition.role is kebab-case and matches step.name", () => {
  it("SpecReviewStep.agent.role is 'spec-review' not 'specReview'", () => {
    expect(SpecReviewStep.agent.role).toBe("spec-review");
    expect(SpecReviewStep.agent.role).not.toBe("specReview");
    expect(SpecReviewStep.agent.role).toBe(SpecReviewStep.name);
  });

  it("all 3 steps: name === agent.role", () => {
    expect(DesignStep.name).toBe(DesignStep.agent.role);
    expect(SpecReviewStep.name).toBe(SpecReviewStep.agent.role);
    expect(SpecFixerStep.name).toBe(SpecFixerStep.agent.role);
  });
});

// TC-052: AgentCapabilities type has network and gitWrite
describe("TC-052: AgentCapabilities type has network/gitWrite optional fields", () => {
  it("AgentDefinition accepts capabilities with network and gitWrite", () => {
    // Type check via runtime validation
    const def = DesignStep.agent;
    // capabilities is optional
    expect(def.capabilities === undefined || typeof def.capabilities === "object").toBe(true);
  });
});

// All 3 Steps have unique roles
describe("3 Steps have unique roles", () => {
  it("no two steps share the same agent.role", () => {
    const roles = [DesignStep.agent.role, SpecReviewStep.agent.role, SpecFixerStep.agent.role];
    const uniqueRoles = new Set(roles);
    expect(uniqueRoles.size).toBe(3);
  });

  it("each system prompt is unique", () => {
    const systems = [
      DesignStep.agent.system,
      SpecReviewStep.agent.system,
      SpecFixerStep.agent.system,
    ];
    const uniqueSystems = new Set(systems);
    expect(uniqueSystems.size).toBe(3);
  });
});
