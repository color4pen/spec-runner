/**
 * Unit tests for AgentRegistry
 * TC-024: fromSteps aggregates 3 Step AgentDefinitions
 * TC-025: fromSteps throws on duplicate role
 * TC-026: get returns undefined for unregistered role
 * TC-027: hashOf is deterministic for same definition
 * TC-028: hashOf reacts to 1-char diff
 * TC-029: hashOf throws for unknown role
 * TC-011: fromSteps は CLI step を除外してカウント 5
 */
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../../src/core/agent/registry.js";
import type { AgentDefinition } from "../../../src/core/agent/definition.js";
import type { AgentStep, CliStep } from "../../../src/core/step/types.js";
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

function makeStep(role: StepName, system?: string): AgentStep {
  return {
    kind: "agent",
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
    const design = makeStep("design");
    const specReview = makeStep("spec-review");
    const specFixer = makeStep("spec-fixer");

    const registry = AgentRegistry.fromSteps([design, specReview, specFixer]);

    expect(registry.list().length).toBe(3);
    expect(registry.get("design")).toEqual(design.agent);
    expect(registry.get("spec-review")).toEqual(specReview.agent);
    expect(registry.get("spec-fixer")).toEqual(specFixer.agent);
  });
});

// TC-025: fromSteps throws on duplicate role
describe("TC-025: AgentRegistry.fromSteps throws on duplicate role", () => {
  it("throws 'Duplicate agent role: design' when two steps share a role", () => {
    const stepA = makeStep("design");
    const stepB = makeStep("design");

    expect(() => AgentRegistry.fromSteps([stepA, stepB])).toThrow(
      "Duplicate agent role: design",
    );
  });

  it("does not construct registry on duplicate", () => {
    const stepA = makeStep("design");
    const stepB = makeStep("design");

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
    const registry = AgentRegistry.fromSteps([makeStep("design")]);
    // Cast to StepName to simulate a future role not yet in the union
    const result = registry.get("implementer" as StepName);
    expect(result).toBeUndefined();
  });
});

// TC-027: hashOf is deterministic
describe("TC-027: AgentRegistry.hashOf is deterministic", () => {
  it("returns same hex string on repeated calls for same definition", () => {
    const registry = AgentRegistry.fromSteps([makeStep("design", "hello system")]);

    const h1 = registry.hashOf("design");
    const h2 = registry.hashOf("design");

    expect(h1).toBe(h2);
    expect(h1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("two registries with identical definitions produce identical hashes", () => {
    const r1 = AgentRegistry.fromSteps([makeStep("design", "same system")]);
    const r2 = AgentRegistry.fromSteps([makeStep("design", "same system")]);

    expect(r1.hashOf("design")).toBe(r2.hashOf("design"));
  });
});

// TC-028: hashOf reacts to 1-char difference
describe("TC-028: AgentRegistry.hashOf reacts to 1-char diff in system", () => {
  it("returns different hashes for definitions differing by one character", () => {
    const r1 = AgentRegistry.fromSteps([makeStep("design", "system A")]);
    const r2 = AgentRegistry.fromSteps([makeStep("design", "system B")]);

    expect(r1.hashOf("design")).not.toBe(r2.hashOf("design"));
  });
});

// TC-029: hashOf throws for unknown role
describe("TC-029: AgentRegistry.hashOf throws for unknown role", () => {
  it("throws 'Unknown agent role: implementer'", () => {
    const registry = AgentRegistry.fromSteps([makeStep("design")]);

    expect(() => registry.hashOf("implementer" as StepName)).toThrow(
      "Unknown agent role: implementer",
    );
  });
});

// TC-045: list() idempotency
describe("TC-045: AgentRegistry.list is idempotent", () => {
  it("returns equivalent arrays on repeated calls", () => {
    const registry = AgentRegistry.fromSteps([
      makeStep("design"),
      makeStep("spec-review"),
    ]);

    const list1 = registry.list();
    const list2 = registry.list();

    expect(list1).toEqual(list2);
    expect(list1.length).toBe(2);
  });

  it("does not mutate internal state on list()", () => {
    const registry = AgentRegistry.fromSteps([makeStep("design")]);

    const list = registry.list();
    // Mutating the returned array should not affect the registry
    list.push(makeAgentDef("spec-review"));

    expect(registry.list().length).toBe(1);
  });
});

// TC-NEW: fromSteps throws on step.name !== step.agent.role mismatch
describe("AgentRegistry.fromSteps throws on step.name and agent.role mismatch", () => {
  it("throws 'Step name and agent role mismatch' when step.name differs from agent.role", () => {
    const mismatchedStep: AgentStep = {
      kind: "agent",
      name: "design" as StepName,
      agent: makeAgentDef("spec-review"), // role = "spec-review" but name = "design"
      buildMessage: () => "",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    expect(() => AgentRegistry.fromSteps([mismatchedStep])).toThrow(
      "Step name and agent role mismatch: name=design, role=spec-review",
    );
  });
});

// TC-011: AgentRegistry.fromSteps — CLI step を除外してカウント 5
describe("TC-011: AgentRegistry.fromSteps — CLI step を除外してカウント 5", () => {
  function makeCliStep(name: StepName): CliStep {
    return {
      kind: "cli",
      name,
      run: async () => {},
      resultFilePath: () => `result-${name}.md`,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };
  }

  it("6 step 配列 (verification のみ CLI) → registry.list().length === 5", () => {
    const design = makeStep("design");
    const specReview = makeStep("spec-review");
    const specFixer = makeStep("spec-fixer");
    const implementer = makeStep("implementer");
    const verification = makeCliStep("verification");
    const buildFixer = makeStep("build-fixer");

    const registry = AgentRegistry.fromSteps([design, specReview, specFixer, implementer, verification, buildFixer]);

    expect(registry.list().length).toBe(5);
  });

  it("registry.get('verification') は undefined", () => {
    const design = makeStep("design");
    const verification = makeCliStep("verification");

    const registry = AgentRegistry.fromSteps([design, verification]);

    expect(registry.get("verification")).toBeUndefined();
  });

  it("registry.get('implementer') は ImplementerStep.agent を返す", () => {
    const design = makeStep("design");
    const specReview = makeStep("spec-review");
    const specFixer = makeStep("spec-fixer");
    const implementer = makeStep("implementer");
    const verification = makeCliStep("verification");
    const buildFixer = makeStep("build-fixer");

    const registry = AgentRegistry.fromSteps([design, specReview, specFixer, implementer, verification, buildFixer]);

    expect(registry.get("implementer")).toEqual(implementer.agent);
  });
});

// TC-071: canonical JSON is key-sorted and compact
describe("TC-071: hashOf canonical JSON is key-sorted and compact", () => {
  it("hash is lowercase hex string of 64 chars after sha256: prefix", () => {
    const registry = AgentRegistry.fromSteps([makeStep("design")]);
    const hash = registry.hashOf("design");

    expect(hash.startsWith("sha256:")).toBe(true);
    const hexPart = hash.slice("sha256:".length);
    expect(hexPart).toHaveLength(64);
    expect(hexPart).toMatch(/^[a-f0-9]+$/);
  });
});
