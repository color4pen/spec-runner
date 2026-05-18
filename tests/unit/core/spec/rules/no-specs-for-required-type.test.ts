import { describe, it, expect } from "vitest";
import { noSpecsForRequiredType } from "../../../../../src/core/spec/rules/no-specs-for-required-type.js";
import { makeFsMock, CHANGE_PATH, validSpecContent } from "./helpers.js";

// TC-DSV-05
describe("TC-DSV-05: no-specs-for-required-type — violation for required type", () => {
  it("returns violation when type=new-feature and specs/ has no .md files", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/design.md`]: "# Design" }),
      requestType: "new-feature",
    };
    const result = await noSpecsForRequiredType.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("no-specs-for-required-type");
  });

  it("returns violation when type=spec-change and specs/ has no .md files", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/design.md`]: "# Design" }),
      requestType: "spec-change",
    };
    const result = await noSpecsForRequiredType.check(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("no-specs-for-required-type");
  });
});

// TC-DSV-06
describe("TC-DSV-06: no-specs-for-required-type — pass for non-required type", () => {
  it("returns [] when type=bug-fix", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/design.md`]: "# Design" }),
      requestType: "bug-fix",
    };
    const result = await noSpecsForRequiredType.check(input);
    expect(result).toEqual([]);
  });

  it("returns [] when requestType is undefined", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({}),
      requestType: undefined,
    };
    const result = await noSpecsForRequiredType.check(input);
    expect(result).toEqual([]);
  });
});

// TC-DSV-07
describe("TC-DSV-07: no-specs-for-required-type — pass when specs exist", () => {
  it("returns [] when type=spec-change and specs/ has .md files", async () => {
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({
        [`${CHANGE_PATH}/specs/my-cap/spec.md`]: validSpecContent("my-cap"),
      }),
      requestType: "spec-change",
    };
    const result = await noSpecsForRequiredType.check(input);
    expect(result).toEqual([]);
  });
});
