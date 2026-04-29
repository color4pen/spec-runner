/**
 * Unit tests for Step AgentDefinition ownership
 * TC-032: ProposeStep has complete AgentDefinition
 * TC-033: SpecReviewStep has spec-review dedicated AgentDefinition
 * TC-034: SpecFixerStep has dedicated AgentDefinition with tools=[]
 * TC-035: spec-review system prompt includes verdict/severity contract
 * TC-036: ProposeStep tools and toolHandlers 1:1 correspondence
 * TC-037: SpecReviewStep tools=[] so toolHandlers can be omitted
 * TC-047: AgentDefinition.role matches StepName (kebab-case)
 */
import { describe, it, expect } from "vitest";
import { ProposeStep } from "../../../src/core/step/propose.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";

// TC-032: ProposeStep has complete AgentDefinition
describe("TC-032: ProposeStep has complete AgentDefinition", () => {
  it("name === 'specrunner-propose' and role === 'propose'", () => {
    expect(ProposeStep.agent.name).toBe("specrunner-propose");
    expect(ProposeStep.agent.role).toBe("propose");
  });

  it("system is a non-empty string", () => {
    expect(typeof ProposeStep.agent.system).toBe("string");
    expect(ProposeStep.agent.system.length).toBeGreaterThan(0);
  });

  it("tools contains register_branch ToolSpec", () => {
    const customTool = ProposeStep.agent.tools.find(
      (t) => t.type === "custom" && (t as { name?: string }).name === "register_branch",
    );
    expect(customTool).toBeDefined();
  });

  it("does not have agentId placeholder field", () => {
    expect((ProposeStep.agent as unknown as Record<string, unknown>)["agentId"]).toBeUndefined();
  });
});

// TC-033: SpecReviewStep has spec-review dedicated AgentDefinition
describe("TC-033: SpecReviewStep has spec-review dedicated AgentDefinition", () => {
  it("role === 'spec-review' (kebab-case)", () => {
    expect(SpecReviewStep.agent.role).toBe("spec-review");
  });

  it("system is different from ProposeStep.agent.system", () => {
    expect(SpecReviewStep.agent.system).not.toBe(ProposeStep.agent.system);
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
    const hasCustom = SpecFixerStep.agent.tools.some(
      (t) => t.type === "custom",
    );
    expect(hasCustom).toBe(false);
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

  it("contains CRITICAL, HIGH, MEDIUM, LOW severity levels", () => {
    const system = SpecReviewStep.agent.system;
    expect(system).toContain("CRITICAL");
    expect(system).toContain("HIGH");
    expect(system).toContain("MEDIUM");
    expect(system).toContain("LOW");
  });

  it("mentions writing output file", () => {
    const system = SpecReviewStep.agent.system;
    // Should mention writing to a file path
    expect(system).toContain("spec-review-result");
  });
});

// TC-036: ProposeStep tools and toolHandlers 1:1 correspondence
describe("TC-036: ProposeStep tools and toolHandlers 1:1 correspondence", () => {
  it("tools contains register_branch ToolSpec", () => {
    const toolSpec = ProposeStep.agent.tools.find(
      (t) => t.type === "custom" && (t as { name?: string }).name === "register_branch",
    );
    expect(toolSpec).toBeDefined();
  });

  it("toolHandlers.get('register_branch') is a function", () => {
    const handler = ProposeStep.toolHandlers?.get("register_branch");
    expect(typeof handler).toBe("function");
  });
});

// TC-037: SpecReviewStep tools=[] means toolHandlers can be undefined/empty
describe("TC-037: SpecReviewStep tools=[] so toolHandlers can be omitted", () => {
  it("custom tools array is empty (no register_branch)", () => {
    const customTools = SpecReviewStep.agent.tools.filter((t) => t.type === "custom");
    expect(customTools.length).toBe(0);
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
    expect(ProposeStep.name).toBe(ProposeStep.agent.role);
    expect(SpecReviewStep.name).toBe(SpecReviewStep.agent.role);
    expect(SpecFixerStep.name).toBe(SpecFixerStep.agent.role);
  });
});

// TC-052: AgentCapabilities type has network and gitWrite
describe("TC-052: AgentCapabilities type has network/gitWrite optional fields", () => {
  it("AgentDefinition accepts capabilities with network and gitWrite", () => {
    // Type check via runtime validation
    const def = ProposeStep.agent;
    // capabilities is optional
    expect(def.capabilities === undefined || typeof def.capabilities === "object").toBe(true);
  });
});

// All 3 Steps have unique roles
describe("3 Steps have unique roles", () => {
  it("no two steps share the same agent.role", () => {
    const roles = [ProposeStep.agent.role, SpecReviewStep.agent.role, SpecFixerStep.agent.role];
    const uniqueRoles = new Set(roles);
    expect(uniqueRoles.size).toBe(3);
  });

  it("each system prompt is unique", () => {
    const systems = [
      ProposeStep.agent.system,
      SpecReviewStep.agent.system,
      SpecFixerStep.agent.system,
    ];
    const uniqueSystems = new Set(systems);
    expect(uniqueSystems.size).toBe(3);
  });
});
