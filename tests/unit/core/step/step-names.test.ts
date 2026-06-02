/**
 * Tests for AGENT_STEP_NAMES / CLI_STEP_NAMES whitelist arrays.
 *
 * TC-1: AGENT_STEP_NAMES と CLI_STEP_NAMES は disjoint
 * TC-2: union が STEP_NAMES 値集合と一致
 * TC-3: 全 AgentStep インスタンスの name ∈ AGENT_STEP_NAMES
 * TC-4: 全 CliStep インスタンスの name ∈ CLI_STEP_NAMES
 * TC-5: Type-level assertions
 */
import { describe, it, expect } from "vitest";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES, STEP_NAMES } from "../../../../src/core/step/step-names.js";
import type { AgentStepName, CliStepName } from "../../../../src/state/schema.js";
import type { SpecRunnerConfig, AgentRecord } from "../../../../src/config/schema.js";
import { DesignStep } from "../../../../src/core/step/design.js";
import { SpecReviewStep } from "../../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../../src/core/step/spec-fixer.js";
import { TestCaseGenStep } from "../../../../src/core/step/test-case-gen.js";
import { ImplementerStep } from "../../../../src/core/step/implementer.js";
import { VerificationStep } from "../../../../src/core/step/verification.js";
import { BuildFixerStep } from "../../../../src/core/step/build-fixer.js";
import { CodeReviewStep } from "../../../../src/core/step/code-review.js";
import { CodeFixerStep } from "../../../../src/core/step/code-fixer.js";
import { AdrGenStep } from "../../../../src/core/step/adr-gen.js";
import { PrCreateStep } from "../../../../src/core/step/pr-create.js";

// TC-TYPE-05: Extract<AgentStepName, CliStepName> must be never (compile-time disjoint guarantee)
type _AssertDisjoint = Extract<AgentStepName, CliStepName> extends never ? true : false;
const _disjointCheck: _AssertDisjoint = true;
void _disjointCheck;

const ALL_STEPS = [
  DesignStep,
  SpecReviewStep,
  SpecFixerStep,
  TestCaseGenStep,
  ImplementerStep,
  VerificationStep,
  BuildFixerStep,
  CodeReviewStep,
  CodeFixerStep,
  AdrGenStep,
  PrCreateStep,
];

// TC-1: AGENT_STEP_NAMES と CLI_STEP_NAMES は disjoint
describe("step name arrays", () => {
  it("TC-1: AGENT_STEP_NAMES and CLI_STEP_NAMES are disjoint", () => {
    const overlap = AGENT_STEP_NAMES.filter((n) =>
      (CLI_STEP_NAMES as readonly string[]).includes(n)
    );
    expect(overlap).toEqual([]);
  });

  // TC-2: union が STEP_NAMES 値集合と一致
  it("TC-2: union of AGENT + CLI equals STEP_NAMES values", () => {
    const union = [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].sort();
    const all = Object.values(STEP_NAMES).sort();
    expect(union).toEqual(all);
  });

  // TC-3: 全 AgentStep インスタンスの name ∈ AGENT_STEP_NAMES
  it("TC-3: all AgentStep instances have names in AGENT_STEP_NAMES", () => {
    const agentSteps = ALL_STEPS.filter((s) => s.kind === "agent");
    for (const step of agentSteps) {
      expect(AGENT_STEP_NAMES as readonly string[]).toContain(step.name);
    }
  });

  // TC-4: 全 CliStep インスタンスの name ∈ CLI_STEP_NAMES
  it("TC-4: all CliStep instances have names in CLI_STEP_NAMES", () => {
    const cliSteps = ALL_STEPS.filter((s) => s.kind === "cli");
    for (const step of cliSteps) {
      expect(CLI_STEP_NAMES as readonly string[]).toContain(step.name);
    }
  });

  // TC-5: Type-level assertions
  it("TC-5: type-level: AgentStepName rejects CliStep names", () => {
    // @ts-expect-error - "verification" is a CliStep, not AgentStepName
    const _bad1: AgentStepName = "verification";
    // @ts-expect-error - "pr-create" is a CliStep, not AgentStepName
    const _bad2: AgentStepName = "pr-create";

    // Should compile: AgentStepName accepts agent step names
    const _ok: AgentStepName = "design";
    expect(_ok).toBe("design");

    // Suppress unused variable warnings
    void _bad1; void _bad2;
  });

  // TC-CFG-02/03: config.agents must reject CliStep keys
  it("TC-CFG-02/03: type-level: config.agents rejects CliStep keys", () => {
    // @ts-expect-error - "verification" is a CliStep, not allowed in config.agents
    const _cfgBad: SpecRunnerConfig["agents"] = { "verification": {} as AgentRecord };

    // Suppress unused variable warnings
    void _cfgBad;
    expect(true).toBe(true);
  });
});
