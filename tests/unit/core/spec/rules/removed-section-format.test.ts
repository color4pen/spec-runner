import { describe, it, expect } from "vitest";
import { removedSectionFormat } from "../../../../../src/core/spec/rules/removed-section-format.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

function makeInput(specContent: string) {
  return {
    changePath: CHANGE_PATH,
    deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: specContent }),
  };
}

// TC-020: 正常 — `- "name"` 形式のみ → violations なし
describe("TC-020: removed-section-format — valid - \"name\" lines pass", () => {
  it("returns [] for correctly formatted Removed section", async () => {
    const content = `## Requirements\n\n### Requirement: X\n\nThe system SHALL do X.\n\n#### Scenario: s\n\n- **GIVEN** a\n\n## Removed\n- "Foo Requirement"\n- "Bar Requirement"\n`;
    const result = await removedSectionFormat.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-021: 正常 — ## Removed セクションなし → violations なし
describe("TC-021: removed-section-format — no Removed section passes", () => {
  it("returns [] when no ## Removed section exists", async () => {
    const content = `## Requirements\n\n### Requirement: X\n\nThe system SHALL do X.\n`;
    const result = await removedSectionFormat.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-022: regression PR#359 — ### Removed: name heading → violation
describe("TC-022: removed-section-format — ### Removed: name heading is a violation (PR#359 regression)", () => {
  it("returns violation for heading-style Removed entry", async () => {
    const content = `## Requirements\n\n### Requirement: X\n\nThe system SHALL do X.\n\n## Removed\n### Removed: SomeName\n`;
    const result = await removedSectionFormat.check(makeInput(content));
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.reason).toBe("removed-section-format");
    expect(result[0]!.suggested).toContain('Replace with - "<requirement-name>" format per rules.md');
  });
});

// TC-023: 違反 — - name without quotes → violation
describe("TC-023: removed-section-format — unquoted name is a violation", () => {
  it("returns violation for list item without quotes", async () => {
    const content = `## Removed\n- FooRequirement\n`;
    const result = await removedSectionFormat.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("removed-section-format");
  });
});

// TC-024: 違反 — 自由形式テキスト → violation
describe("TC-024: removed-section-format — free-form text is a violation", () => {
  it("returns violation for free-form text in Removed section", async () => {
    const content = `## Removed\nThe old feature was removed.\n`;
    const result = await removedSectionFormat.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("removed-section-format");
  });
});

// TC-025: edge — 空ファイル → violations なし
describe("TC-025: removed-section-format — empty file passes", () => {
  it("returns [] for empty spec content", async () => {
    const result = await removedSectionFormat.check(makeInput(""));
    expect(result).toEqual([]);
  });
});

// TC-026: edge — ## Removed + 空行のみ → violations なし
describe("TC-026: removed-section-format — Removed section with only blank lines passes", () => {
  it("returns [] when Removed section contains only blank lines", async () => {
    const content = `## Removed\n\n\n`;
    const result = await removedSectionFormat.check(makeInput(content));
    expect(result).toEqual([]);
  });
});
