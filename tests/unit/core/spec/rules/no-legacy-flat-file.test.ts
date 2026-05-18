import { describe, it, expect } from "vitest";
import { noLegacyFlatFile } from "../../../../../src/core/spec/rules/no-legacy-flat-file.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

// TC-DSV-01
describe("TC-DSV-01: no-legacy-flat-file — violation", () => {
  it("returns legacy-flat-file violation when delta-spec.md exists at change root", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/delta-spec.md`]: "# Legacy" }),
    };
    const result = await noLegacyFlatFile.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("legacy-flat-file");
    expect(result[0]!.path).toContain("delta-spec.md");
  });
});

// TC-DSV-02
describe("TC-DSV-02: no-legacy-flat-file — pass", () => {
  it("returns [] when delta-spec.md does not exist", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/design.md`]: "# Design" }),
    };
    const result = await noLegacyFlatFile.check(input);
    expect(result).toEqual([]);
  });

  it("returns [] when changePath does not exist", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({}),
    };
    const result = await noLegacyFlatFile.check(input);
    expect(result).toEqual([]);
  });
});
