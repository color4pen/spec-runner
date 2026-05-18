import { describe, it, expect } from "vitest";
import { noLegacyFlatDir } from "../../../../../src/core/spec/rules/no-legacy-flat-dir.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

// TC-DSV-03
describe("TC-DSV-03: no-legacy-flat-dir — violation", () => {
  it("returns legacy-flat-dir violation when .md files exist in delta-spec/", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/delta-spec/my-capability.md`]: "# Legacy Flat Dir",
      }),
    };
    const result = await noLegacyFlatDir.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("legacy-flat-dir");
    expect(result[0]!.path).toContain("delta-spec/my-capability.md");
  });
});

// TC-DSV-04
describe("TC-DSV-04: no-legacy-flat-dir — pass", () => {
  it("returns [] when delta-spec/ directory does not exist", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/design.md`]: "# Design" }),
    };
    const result = await noLegacyFlatDir.check(input);
    expect(result).toEqual([]);
  });
});
