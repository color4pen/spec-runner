import { describe, it, expect } from "vitest";
import { noAuthoritySpecDirectEdit } from "../../../../../src/core/spec/rules/no-authority-spec-direct-edit.js";
import { createDeltaSpecRegistry } from "../../../../../src/core/spec/rules/index.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

function makeInput(changedFiles?: string[]) {
  return {
    changePath: CHANGE_PATH,
    deps: makeFsMock({}),
    changedFiles,
  };
}

// TC-1: changedFiles に specrunner/specs/foo/spec.md → violation 検出
describe("TC-1: authority spec path → violation", () => {
  it("returns authority-spec-direct-edit violation for specrunner/specs/foo/spec.md", async () => {
    const result = await noAuthoritySpecDirectEdit.check(
      makeInput(["specrunner/specs/foo/spec.md"]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("authority-spec-direct-edit");
    expect(result[0]!.path).toBe("specrunner/specs/foo/spec.md");
    expect(result[0]!.suggested).toContain("specrunner/changes/<slug>/specs/<capability>/spec.md");
  });
});

// TC-2: changedFiles に specrunner/changes/slug/specs/foo/spec.md のみ → no violation
describe("TC-2: delta spec path only → no violation", () => {
  it("returns [] when only delta spec (specrunner/changes/) path is present", async () => {
    const result = await noAuthoritySpecDirectEdit.check(
      makeInput(["specrunner/changes/my-slug/specs/foo/spec.md"]),
    );
    expect(result).toEqual([]);
  });
});

// TC-3: changedFiles に src/core/foo.ts のみ → no violation
describe("TC-3: src-only path → no violation", () => {
  it("returns [] when changedFiles contains only src files", async () => {
    const result = await noAuthoritySpecDirectEdit.check(
      makeInput(["src/core/foo.ts", "tests/unit/foo.test.ts"]),
    );
    expect(result).toEqual([]);
  });
});

// TC-4: changedFiles が undefined → no violation (skip)
describe("TC-4: undefined changedFiles → no violation (graceful degradation)", () => {
  it("returns [] when changedFiles is undefined", async () => {
    const result = await noAuthoritySpecDirectEdit.check(makeInput(undefined));
    expect(result).toEqual([]);
  });
});

// TC-5: authority spec + delta spec + src 混在 → authority spec のみ violation
describe("TC-5: mixed paths → only authority spec path is a violation", () => {
  it("reports only authority spec path, not delta or src paths", async () => {
    const result = await noAuthoritySpecDirectEdit.check(
      makeInput([
        "specrunner/specs/my-cap/spec.md",
        "specrunner/changes/slug/specs/my-cap/spec.md",
        "src/core/step/foo.ts",
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("specrunner/specs/my-cap/spec.md");
    expect(result[0]!.reason).toBe("authority-spec-direct-edit");
  });
});

// TC-6: changedFiles が空配列 → no violation
describe("TC-6: empty changedFiles array → no violation", () => {
  it("returns [] when changedFiles is empty", async () => {
    const result = await noAuthoritySpecDirectEdit.check(makeInput([]));
    expect(result).toEqual([]);
  });
});

// TC-extra: multiple authority spec paths → multiple violations
describe("TC-extra: multiple authority spec paths → multiple violations", () => {
  it("returns a violation for each authority spec file", async () => {
    const result = await noAuthoritySpecDirectEdit.check(
      makeInput([
        "specrunner/specs/cap-a/spec.md",
        "specrunner/specs/cap-b/spec.md",
      ]),
    );
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.path)).toContain("specrunner/specs/cap-a/spec.md");
    expect(result.map((v) => v.path)).toContain("specrunner/specs/cap-b/spec.md");
  });
});

// TC-RULE-08: createDeltaSpecRegistry に no-authority-spec-direct-edit が登録されている
describe("TC-RULE-08: createDeltaSpecRegistry includes no-authority-spec-direct-edit", () => {
  it("registry returns authority-spec-direct-edit violation when changedFiles contains an authority spec path", async () => {
    const registry = createDeltaSpecRegistry();
    const violations = await registry.validate({
      changePath: CHANGE_PATH,
      deps: makeFsMock({}),
      changedFiles: ["specrunner/specs/foo/spec.md"],
    });
    const reasons = violations.map((v) => v.reason);
    expect(reasons).toContain("authority-spec-direct-edit");
  });
});
