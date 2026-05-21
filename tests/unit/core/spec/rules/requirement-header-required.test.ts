import { describe, it, expect } from "vitest";
import { requirementHeaderRequired } from "../../../../../src/core/spec/rules/requirement-header-required.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

function makeInput(specContent: string) {
  return {
    changePath: CHANGE_PATH,
    deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: specContent }),
  };
}

// TC-040: 正常 — 全 h3 が ### Requirement: prefix → violations なし
describe("TC-040: requirement-header-required — all h3 with Requirement: prefix pass", () => {
  it("returns [] when all h3 headers use ### Requirement: prefix", async () => {
    const content = `## Requirements\n\n### Requirement: Foo\n\nThe system SHALL do X.\n\n#### Scenario: s\n\n- GIVEN a\n\n### Requirement: Bar\n\nThe system SHALL do Y.\n\n#### Scenario: t\n\n- GIVEN b\n`;
    const result = await requirementHeaderRequired.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-041: 違反 — ### REQ-001: something → violation
describe("TC-041: requirement-header-required — ### REQ-001: prefix is a violation", () => {
  it("returns non-standard-requirement-header violation for ### REQ-001:", async () => {
    const content = `## Requirements\n\n### REQ-001: Old Requirement\n\nThe system SHALL do X.\n`;
    const result = await requirementHeaderRequired.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("non-standard-requirement-header");
    expect(result[0]!.suggested).toContain("Use ### Requirement: prefix for all requirement headers");
  });
});

// TC-042: 違反 — ### Feature: something → violation
describe("TC-042: requirement-header-required — ### Feature: prefix is a violation", () => {
  it("returns violation for ### Feature: header", async () => {
    const content = `## Requirements\n\n### Feature: Something\n\nThe system SHALL do X.\n`;
    const result = await requirementHeaderRequired.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("non-standard-requirement-header");
  });
});

// TC-043: 正常 — ## Requirements セクションなし → violations なし
describe("TC-043: requirement-header-required — no Requirements section passes", () => {
  it("returns [] when no ## Requirements section exists", async () => {
    const content = `# Spec\n\n## Other\n\n### Something\n`;
    const result = await requirementHeaderRequired.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-044: 正常 — Requirements セクション内に h3 header なし → violations なし
describe("TC-044: requirement-header-required — no h3 in Requirements passes", () => {
  it("returns [] when Requirements section has no h3 headers", async () => {
    const content = `## Requirements\n\nNo requirements yet.\n`;
    const result = await requirementHeaderRequired.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-045: 混在 — ### Requirement: と ### Other: が混在 → ### Other: のみ violation
describe("TC-045: requirement-header-required — only non-Requirement h3 triggers violation", () => {
  it("returns exactly 1 violation for the non-standard header only", async () => {
    const content = `## Requirements\n\n### Requirement: Foo\n\nThe system SHALL do X.\n\n### Other: Bar\n\nSome text.\n`;
    const result = await requirementHeaderRequired.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("non-standard-requirement-header");
  });
});
