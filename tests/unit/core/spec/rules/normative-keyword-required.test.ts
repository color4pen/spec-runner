import { describe, it, expect } from "vitest";
import { normativeKeywordRequired } from "../../../../../src/core/spec/rules/normative-keyword-required.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

function makeInput(specContent: string) {
  return {
    changePath: CHANGE_PATH,
    deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: specContent }),
  };
}

function makeSpec(reqName: string, body: string): string {
  return [
    "## Requirements",
    "",
    `### Requirement: ${reqName}`,
    "",
    body,
    "",
    "#### Scenario: basic",
    "",
    "- GIVEN a user",
    "- WHEN they act",
    "- THEN it works",
    "",
  ].join("\n");
}

// TC-060: 正常 — body に SHALL あり → violations なし
describe("TC-060: normative-keyword-required — body with SHALL passes", () => {
  it("returns [] when body contains SHALL", async () => {
    const content = makeSpec("Foo", "The system SHALL perform X.");
    const result = await normativeKeywordRequired.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-061: 正常 — body に MUST あり → violations なし
describe("TC-061: normative-keyword-required — body with MUST passes", () => {
  it("returns [] when body contains MUST", async () => {
    const content = makeSpec("Foo", "The system MUST validate Y.");
    const result = await normativeKeywordRequired.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-062: 違反 — body に SHALL も MUST もなし → violation
describe("TC-062: normative-keyword-required — body without SHALL or MUST is a violation", () => {
  it("returns missing-normative-keyword violation", async () => {
    const content = makeSpec("Foo", "The system performs X.");
    const result = await normativeKeywordRequired.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("missing-normative-keyword");
    expect(result[0]!.suggested).toContain(
      "Add SHALL or MUST in Requirement body to express normative intent",
    );
  });
});

// TC-063: 違反 — header に SHALL があるが body にはない → violation
describe("TC-063: normative-keyword-required — SHALL in header but not body is a violation", () => {
  it("returns violation when SHALL is only in the header line", async () => {
    // The header line "### Requirement: System SHALL do X" contains SHALL,
    // but we only check body (text after the header, before first Scenario)
    const content = [
      "## Requirements",
      "",
      "### Requirement: System SHALL do X",
      "",
      "This requirement covers X.",
      "",
      "#### Scenario: s",
      "",
      "- GIVEN a",
      "",
    ].join("\n");
    const result = await normativeKeywordRequired.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("missing-normative-keyword");
  });
});

// TC-064: 正常 — header に SHALL、body にも SHALL あり → violations なし
describe("TC-064: normative-keyword-required — SHALL in both header and body passes", () => {
  it("returns [] when body also has SHALL even if header does too", async () => {
    const content = [
      "## Requirements",
      "",
      "### Requirement: X",
      "",
      "The system SHALL do X.",
      "",
      "#### Scenario: s",
      "",
      "- GIVEN a",
      "",
    ].join("\n");
    const result = await normativeKeywordRequired.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-065: 正常 — ## Requirements セクションなし → violations なし
describe("TC-065: normative-keyword-required — no Requirements section passes", () => {
  it("returns [] when no ## Requirements section exists", async () => {
    const content = `# Spec\n\n## Other\n`;
    const result = await normativeKeywordRequired.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-066: 違反 — body に lowercase shall あり → violation
describe("TC-066: normative-keyword-required — lowercase 'shall' is a violation", () => {
  it("returns violation when body only has lowercase shall", async () => {
    const content = makeSpec("Foo", "The system shall perform X.");
    const result = await normativeKeywordRequired.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("missing-normative-keyword");
  });
});
