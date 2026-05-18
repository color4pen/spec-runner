import { describe, it, expect } from "vitest";
import { canonicalSpecStructure } from "../../../../../src/core/spec/rules/canonical-spec-structure.js";
import { makeFsMock, CHANGE_PATH, validSpecContent } from "./helpers.js";

// TC-DSV-08: .delta.md → legacy-flat-file
describe("TC-DSV-08: canonical-spec-structure — .delta.md violation", () => {
  it("returns legacy-flat-file when .delta.md exists directly in specs/", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/foo.delta.md`]: "# Delta",
      }),
    };
    const result = await canonicalSpecStructure.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("legacy-flat-file");
  });
});

// TC-DSV-09: .md directly in specs/ → non-canonical-path
describe("TC-DSV-09: canonical-spec-structure — non-canonical .md in specs/", () => {
  it("returns non-canonical-path when .md file is directly in specs/", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/bar.md`]: "# Bar",
      }),
    };
    const result = await canonicalSpecStructure.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("non-canonical-path");
  });
});

// TC-DSV-10: missing section header
describe("TC-DSV-10: canonical-spec-structure — missing section violation", () => {
  it("returns missing-requirements-section when spec.md has no ADDED/MODIFIED/REMOVED header", async () => {
    const badContent = `# Spec\n\n## ADDED\n\n### Requirement: Something\n`;
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/cap/spec.md`]: badContent,
      }),
    };
    const result = await canonicalSpecStructure.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("missing-requirements-section");
  });
});

// TC-DSV-11: empty section (no Requirement block)
describe("TC-DSV-11: canonical-spec-structure — empty section violation", () => {
  it("returns empty-section when section header exists but no Requirement: block", async () => {
    const emptySection = `# Spec\n\n## ADDED Requirements\n\nNo requirements here.\n`;
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/cap/spec.md`]: emptySection,
      }),
    };
    const result = await canonicalSpecStructure.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("empty-section");
  });
});

// TC-DSV-12: valid canonical spec → empty
describe("TC-DSV-12: canonical-spec-structure — pass", () => {
  it("returns [] for valid canonical spec.md", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/cap/spec.md`]: validSpecContent("cap"),
      }),
    };
    const result = await canonicalSpecStructure.check(input);
    expect(result).toEqual([]);
  });

  it("returns [] when specs/ does not exist", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/design.md`]: "# Design" }),
    };
    const result = await canonicalSpecStructure.check(input);
    expect(result).toEqual([]);
  });
});
