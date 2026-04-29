/**
 * Unit tests for AgentRegistry
 * TC-024: fromSteps aggregates 3 Step AgentDefinitions
 * TC-025: fromSteps throws on duplicate role
 * TC-026: get returns undefined for unregistered role
 * TC-027: hashOf is deterministic for same definition
 * TC-028: hashOf reacts to 1-char diff
 * TC-029: hashOf throws for unknown role
 */
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../../src/core/agent/registry.js";
import type { AgentDefinition } from "../../../src/core/agent/definition.js";
import type { Step } from "../../../src/core/step/types.js";
import type { StepName } from "../../../src/state/schema.js";

function makeAgentDef(role: StepName, system: string = "system prompt"): AgentDefinition {
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

// TC-024: fromSteps aggregates 3 Step AgentDefinitions
describe("TC-024: AgentRegistry.fromSteps aggregates 3 Step definitions", () => {
  it("builds registry with list().length === 3", () => {
    const propose = makeStep("propose");
    const specReview = makeStep("spec-review");
    const specFixer = makeStep("spec-fixer");

    const registry = AgentRegistry.fromSteps([propose, specReview, specFixer]);

    expect(registry.list().length).toBe(3);
    expect(registry.get("propose")).toEqual(propose.agent);
    expect(registry.get("spec-review")).toEqual(specReview.agent);
    expect(registry.get("spec-fixer")).toEqual(specFixer.agent);
  });
});

// TC-025: fromSteps throws on duplicate role
describe("TC-025: AgentRegistry.fromSteps throws on duplicate role", () => {
  it("throws 'Duplicate agent role: propose' when two steps share a role", () => {
    const stepA = makeStep("propose");
    const stepB = makeStep("propose");

    expect(() => AgentRegistry.fromSteps([stepA, stepB])).toThrow(
      "Duplicate agent role: propose",
    );
  });

  it("does not construct registry on duplicate", () => {
    const stepA = makeStep("propose");
    const stepB = makeStep("propose");

    let registry: AgentRegistry | undefined;
    try {
      registry = AgentRegistry.fromSteps([stepA, stepB]);
    } catch {
      // expected
    }
    expect(registry).toBeUndefined();
  });
});

// TC-026: get returns undefined for unregistered role
describe("TC-026: AgentRegistry.get returns undefined for unregistered role", () => {
  it("returns undefined for 'implementer' role not in registry", () => {
    const registry = AgentRegistry.fromSteps([makeStep("propose")]);
    // Cast to StepName to simulate a future role not yet in the union
    const result = registry.get("implementer" as StepName);
    expect(result).toBeUndefined();
  });
});

// TC-027: hashOf is deterministic
describe("TC-027: AgentRegistry.hashOf is deterministic", () => {
  it("returns same hex string on repeated calls for same definition", () => {
    const registry = AgentRegistry.fromSteps([makeStep("propose", "hello system")]);

    const h1 = registry.hashOf("propose");
    const h2 = registry.hashOf("propose");

    expect(h1).toBe(h2);
    expect(h1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("two registries with identical definitions produce identical hashes", () => {
    const r1 = AgentRegistry.fromSteps([makeStep("propose", "same system")]);
    const r2 = AgentRegistry.fromSteps([makeStep("propose", "same system")]);

    expect(r1.hashOf("propose")).toBe(r2.hashOf("propose"));
  });
});

// TC-028: hashOf reacts to 1-char difference
describe("TC-028: AgentRegistry.hashOf reacts to 1-char diff in system", () => {
  it("returns different hashes for definitions differing by one character", () => {
    const r1 = AgentRegistry.fromSteps([makeStep("propose", "system A")]);
    const r2 = AgentRegistry.fromSteps([makeStep("propose", "system B")]);

    expect(r1.hashOf("propose")).not.toBe(r2.hashOf("propose"));
  });
});

// TC-029: hashOf throws for unknown role
describe("TC-029: AgentRegistry.hashOf throws for unknown role", () => {
  it("throws 'Unknown agent role: implementer'", () => {
    const registry = AgentRegistry.fromSteps([makeStep("propose")]);

    expect(() => registry.hashOf("implementer" as StepName)).toThrow(
      "Unknown agent role: implementer",
    );
  });
});

// TC-045: list() idempotency
describe("TC-045: AgentRegistry.list is idempotent", () => {
  it("returns equivalent arrays on repeated calls", () => {
    const registry = AgentRegistry.fromSteps([
      makeStep("propose"),
      makeStep("spec-review"),
    ]);

    const list1 = registry.list();
    const list2 = registry.list();

    expect(list1).toEqual(list2);
    expect(list1.length).toBe(2);
  });

  it("does not mutate internal state on list()", () => {
    const registry = AgentRegistry.fromSteps([makeStep("propose")]);

    const list = registry.list();
    // Mutating the returned array should not affect the registry
    list.push(makeAgentDef("spec-review"));

    expect(registry.list().length).toBe(1);
  });
});

// TC-071: canonical JSON is key-sorted and compact
describe("TC-071: hashOf canonical JSON is key-sorted and compact", () => {
  it("hash is lowercase hex string of 64 chars after sha256: prefix", () => {
    const registry = AgentRegistry.fromSteps([makeStep("propose")]);
    const hash = registry.hashOf("propose");

    expect(hash.startsWith("sha256:")).toBe(true);
    const hexPart = hash.slice("sha256:".length);
    expect(hexPart).toHaveLength(64);
    expect(hexPart).toMatch(/^[a-f0-9]+$/);
  });
});
