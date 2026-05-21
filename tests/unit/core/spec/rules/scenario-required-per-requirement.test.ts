import { describe, it, expect } from "vitest";
import { scenarioRequiredPerRequirement } from "../../../../../src/core/spec/rules/scenario-required-per-requirement.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

function makeInput(specContent: string) {
  return {
    changePath: CHANGE_PATH,
    deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: specContent }),
  };
}

// TC-050: 正常 — 各 Requirement に Scenario あり → violations なし
describe("TC-050: scenario-required-per-requirement — all Requirements with Scenario pass", () => {
  it("returns [] when every Requirement has at least one Scenario", async () => {
    const content = `## Requirements\n\n### Requirement: Foo\n\nThe system SHALL do X.\n\n#### Scenario: basic\n\n- GIVEN a user\n- WHEN they do X\n- THEN it works\n`;
    const result = await scenarioRequiredPerRequirement.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-051: 違反 — Requirement に Scenario なし → violation
describe("TC-051: scenario-required-per-requirement — Requirement without Scenario is a violation", () => {
  it("returns missing-scenario violation when no Scenario block", async () => {
    const content = `## Requirements\n\n### Requirement: NoScenarioReq\n\nThe system SHALL do X.\n`;
    const result = await scenarioRequiredPerRequirement.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("missing-scenario");
    expect(result[0]!.suggested).toContain(
      "Add at least one #### Scenario: block describing observable behavior",
    );
  });
});

// TC-052: 違反 — 複数 Requirement のうち 1 件のみ Scenario なし → 1 violation
describe("TC-052: scenario-required-per-requirement — only missing Scenario triggers violation", () => {
  it("returns exactly 1 violation when one of two Requirements lacks Scenario", async () => {
    const content = [
      "## Requirements",
      "",
      "### Requirement: WithScenario",
      "",
      "The system SHALL do X.",
      "",
      "#### Scenario: basic",
      "",
      "- GIVEN a",
      "",
      "### Requirement: WithoutScenario",
      "",
      "The system SHALL do Y.",
      "",
    ].join("\n");
    const result = await scenarioRequiredPerRequirement.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("missing-scenario");
  });
});

// TC-053: 正常 — ## Requirements セクションなし → violations なし
describe("TC-053: scenario-required-per-requirement — no Requirements section passes", () => {
  it("returns [] when no ## Requirements section exists", async () => {
    const content = `# Spec\n\n## Other section\n`;
    const result = await scenarioRequiredPerRequirement.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-054: edge — #### Test: 形式は Scenario として認識されない → violation
describe("TC-054: scenario-required-per-requirement — #### Test: is not a Scenario", () => {
  it("returns violation when only #### Test: exists (not #### Scenario:)", async () => {
    const content = `## Requirements\n\n### Requirement: Foo\n\nThe system SHALL do X.\n\n#### Test: something\n\n- do something\n`;
    const result = await scenarioRequiredPerRequirement.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("missing-scenario");
  });
});
