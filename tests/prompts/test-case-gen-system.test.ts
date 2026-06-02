import { describe, it, expect } from "vitest";
import {
  TEST_CASE_GEN_SYSTEM_PROMPT,
  buildTestCaseGenInitialMessage,
} from "../../src/prompts/test-case-gen-system.js";

// TC-023: test-case-gen prompt に TC ID の downstream 参照規律が含まれる
describe("TC-023: TEST_CASE_GEN_SYSTEM_PROMPT — TC ID downstream 参照規律", () => {
  it("TC ID が implementer / verification step で grep 参照される旨の規律が含まれる", () => {
    const hasDownstreamRef =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("implementer") &&
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("grep");
    expect(hasDownstreamRef).toBe(true);
  });

  it("TC ID が一意かつ安定的に grep 可能であることの要件が含まれる", () => {
    const hasUniqueness =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("unique") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("一意");
    expect(hasUniqueness).toBe(true);
  });
});

describe("TC-CATG-01: e2e category is removed from prompt", () => {
  it("does not contain 'e2e' anywhere in the system prompt", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("e2e");
  });
});

describe("TC-CATG-02: three categories are present", () => {
  it("contains 'unit | integration | manual' category listing", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("unit | integration | manual");
  });
});

describe("TC-CATG-03: LLM/API exclusion rule is present", () => {
  it("contains dogfood verification rule for LLM calls", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("MUST NOT be");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("dogfood");
  });
});

describe("delta spec Scenario as primary test source", () => {
  it("system prompt mentions delta spec Scenarios as primary input source", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Primary input source");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Scenario");
  });

  it("system prompt contains specs/ path reference", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("specs/");
  });

  it("system prompt contains fallback instruction for delta spec absent", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("delta spec absent");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("fall back");
  });

  it("system prompt positions design.md / tasks.md as supplementary context", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Supplementary");
  });

  it("Coverage Requirements requires every Scenario to have at least one test case when delta spec is present", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain(
      "Every Scenario in the delta spec must have at least one test case",
    );
  });

  it("Source field description includes delta spec Scenario reference format", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain(
      "specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>",
    );
  });

  it("failed result condition covers delta spec absent AND design artifacts missing", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Delta spec is absent AND");
  });
});

describe("buildTestCaseGenInitialMessage — delta spec reading step", () => {
  const msg = buildTestCaseGenInitialMessage({
    slug: "my-change",
    branch: "change/my-change-abc123",
    requestContent: "# Request",
  });

  it("includes a step to read delta spec files under specs/", () => {
    expect(msg).toContain("specs/");
    expect(msg).toContain("Scenarios as primary test source");
  });

  it("delta spec step appears before design.md step", () => {
    const specsIdx = msg.indexOf("specs/");
    const designIdx = msg.indexOf("design.md");
    expect(specsIdx).toBeLessThan(designIdx);
  });

  it("delta spec step appears before tasks.md step", () => {
    const specsIdx = msg.indexOf("specs/");
    const tasksIdx = msg.indexOf("tasks.md");
    expect(specsIdx).toBeLessThan(tasksIdx);
  });
});
