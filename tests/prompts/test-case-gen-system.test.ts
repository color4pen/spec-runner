import { describe, it, expect } from "vitest";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../src/prompts/test-case-gen-system.js";

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
