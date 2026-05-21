import { describe, it, expect } from "vitest";
import {
  loadSpecFiles,
  extractSection,
  parseRequirementBlocks,
} from "../../../../../src/core/spec/rules/spec-content-parser.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

// TC-010: loadSpecFiles — specs/ 配下の spec.md を全件返す
describe("TC-010: loadSpecFiles — returns all spec.md files", () => {
  it("returns both spec files when two capabilities exist", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/foo/spec.md`]: "# Foo",
        [`${CHANGE_PATH}/specs/bar/spec.md`]: "# Bar",
      }),
    };
    const result = await loadSpecFiles(input);
    expect(result).toHaveLength(2);
    const capabilities = result.map((r) => r.capability).sort();
    expect(capabilities).toEqual(["bar", "foo"]);
    expect(result.find((r) => r.capability === "foo")?.content).toBe("# Foo");
    expect(result.find((r) => r.capability === "bar")?.content).toBe("# Bar");
  });
});

// TC-011: loadSpecFiles — specs/ ディレクトリが存在しない場合は空配列を返す
describe("TC-011: loadSpecFiles — no specs/ directory returns []", () => {
  it("returns [] when specs/ does not exist", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/design.md`]: "# Design" }),
    };
    const result = await loadSpecFiles(input);
    expect(result).toEqual([]);
  });
});

// TC-012: loadSpecFiles — flat .md files are skipped
describe("TC-012: loadSpecFiles — skips flat .md files in specs/", () => {
  it("skips README.md but returns foo/spec.md", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/README.md`]: "# readme",
        [`${CHANGE_PATH}/specs/foo/spec.md`]: "# Foo",
      }),
    };
    const result = await loadSpecFiles(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.capability).toBe("foo");
  });
});

// TC-013: extractSection — 指定 header のセクション内容を返す
describe("TC-013: extractSection — extracts named section content", () => {
  it('returns section content up to next ## heading', () => {
    const content = `## Removed\n- "foo"\n## Other\nother content\n`;
    const result = extractSection(content, "## Removed");
    expect(result).toBe('- "foo"\n');
  });
});

// TC-013b: extractSection — 隣接 ## セクションで false positive を出さない (M1 regression)
describe("TC-013b: extractSection — adjacent ## section returns empty string, not next section content", () => {
  it("returns empty string when section is immediately followed by another ## with no blank line", () => {
    const content = `## Removed\n## Renamed\n- "x" → "y"\n`;
    expect(extractSection(content, "## Removed")).toBe("");
  });

  it("does not include next section body when sections are adjacent", () => {
    const content = `## Removed\n## Renamed\n- "foo" → "bar"\n`;
    const result = extractSection(content, "## Removed");
    expect(result).toBe("");
    expect(result).not.toContain("## Renamed");
    expect(result).not.toContain("foo");
  });
});

// TC-014: extractSection — セクションが存在しない場合は null
describe("TC-014: extractSection — null when section absent", () => {
  it("returns null when section not found", () => {
    const content = `## Requirements\n### Requirement: Foo\n`;
    const result = extractSection(content, "## Removed");
    expect(result).toBeNull();
  });
});

// TC-015: extractSection — セクションが最後（EOF まで）
describe("TC-015: extractSection — section at EOF is fully extracted", () => {
  it("returns full content when section is the last one", () => {
    const content = `## Removed\n- "foo"\n- "bar"\n`;
    const result = extractSection(content, "## Removed");
    expect(result).toBe('- "foo"\n- "bar"\n');
  });
});

// TC-016: parseRequirementBlocks — 正常な block を解析
describe("TC-016: parseRequirementBlocks — parses a requirement block", () => {
  it("parses header, name, body, hasScenario", () => {
    const section = `### Requirement: Foo\nThe system SHALL do X.\n#### Scenario: bar\n- GIVEN ...\n`;
    const blocks = parseRequirementBlocks(section);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.header).toBe("### Requirement: Foo");
    expect(block.name).toBe("Foo");
    expect(block.hasScenario).toBe(true);
    expect(block.body).toContain("The system SHALL do X.");
    expect(block.body).not.toContain("GIVEN");
  });
});

// TC-017: parseRequirementBlocks — Scenario なしの block は hasScenario: false
describe("TC-017: parseRequirementBlocks — hasScenario false when no scenario", () => {
  it("returns hasScenario: false when no #### Scenario: is present", () => {
    const section = `### Requirement: NoScenario\nThe system SHALL ...\n`;
    const blocks = parseRequirementBlocks(section);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.hasScenario).toBe(false);
  });
});

// TC-018: parseRequirementBlocks — body は header 直後〜最初の Scenario の前まで
describe("TC-018: parseRequirementBlocks — body excludes scenario content", () => {
  it("body contains only pre-scenario text", () => {
    const section = `### Requirement: X\nbody text here\n#### Scenario: s1\nscenario text\n`;
    const blocks = parseRequirementBlocks(section);
    expect(blocks[0]!.body).toContain("body text here");
    expect(blocks[0]!.body).not.toContain("scenario text");
  });
});

// TC-019: parseRequirementBlocks — Requirements セクションが空の場合は空配列
describe("TC-019: parseRequirementBlocks — empty content returns []", () => {
  it("returns [] for empty string", () => {
    const blocks = parseRequirementBlocks("");
    expect(blocks).toEqual([]);
  });
});
