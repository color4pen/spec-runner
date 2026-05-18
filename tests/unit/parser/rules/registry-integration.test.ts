import { describe, it, expect } from "vitest";
import { createRequestMdRegistry } from "../../../../src/parser/rules/index.js";
import { makeRaw } from "./helpers.js";

// TC-PR-14: registry integration — all required violations on fully-null input
describe("TC-PR-14: createRequestMdRegistry integration", () => {
  it("detects all required rule violations on null input", () => {
    const registry = createRequestMdRegistry();
    const result = registry.validate(
      makeRaw({
        title: null,
        type: null,
        slug: null,
        baseBranch: null,
        adrRaw: null,
        adrAnyValue: null,
      }),
    );
    const ruleNames = result.map((v) => v.rule);
    expect(ruleNames).toContain("title-required");
    expect(ruleNames).toContain("type-required");
    expect(ruleNames).toContain("slug-required");
    expect(ruleNames).toContain("base-branch-required");
    expect(ruleNames).toContain("adr-required");
  });
});
