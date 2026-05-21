import { describe, it, expect } from "vitest";
import { baselineHeaderMatch } from "../../../../../src/core/spec/rules/baseline-header-match.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

const BASELINE_PATH = "/work/specrunner/specs/cap/spec.md";

function makeInput(
  deltaContent: string,
  baselineContent: string | null,
) {
  return {
    changePath: CHANGE_PATH,
    deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: deltaContent }),
    baselineSpecLoader: async (_cap: string) => baselineContent,
  };
}

function makeSpec(requirements: string[]): string {
  const reqs = requirements
    .map((name) => [
      `### Requirement: ${name}`,
      "",
      "The system SHALL do something.",
      "",
      "#### Scenario: basic",
      "",
      "- GIVEN a user",
      "- WHEN they act",
      "- THEN it works",
      "",
    ].join("\n"))
    .join("\n");
  return `## Requirements\n\n${reqs}`;
}

// TC-070: 正常 — delta header が baseline と exact match → violations なし
describe("TC-070: baseline-header-match — exact match passes", () => {
  it("returns [] when delta header exactly matches baseline header", async () => {
    const baseline = makeSpec(["Foo Bar"]);
    const delta = makeSpec(["Foo Bar"]);
    const result = await baselineHeaderMatch.check(makeInput(delta, baseline));
    expect(result).toEqual([]);
  });
});

// TC-071: 正常 — delta header が baseline にない (ADDED) → violations なし
describe("TC-071: baseline-header-match — ADDED requirement passes", () => {
  it("returns [] when delta header is completely new (not in baseline)", async () => {
    const baseline = makeSpec(["Existing Req"]);
    const delta = makeSpec(["Brand New Req"]);
    const result = await baselineHeaderMatch.check(makeInput(delta, baseline));
    expect(result).toEqual([]);
  });
});

// TC-072: 正常 — baselineSpecLoader が undefined → violations なし
describe("TC-072: baseline-header-match — undefined baselineSpecLoader passes", () => {
  it("returns [] when baselineSpecLoader is undefined", async () => {
    const delta = makeSpec(["Foo"]);
    const input = {
      changePath: CHANGE_PATH,
      deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: delta }),
      // baselineSpecLoader is intentionally omitted
    };
    const result = await baselineHeaderMatch.check(input);
    expect(result).toEqual([]);
  });
});

// TC-073: 正常 — baselineSpecLoader が null を返す (新規 capability) → violations なし
describe("TC-073: baseline-header-match — null baseline (new capability) passes", () => {
  it("returns [] when baselineSpecLoader returns null", async () => {
    const delta = makeSpec(["Foo"]);
    const result = await baselineHeaderMatch.check(makeInput(delta, null));
    expect(result).toEqual([]);
  });
});

// TC-074: 違反 — delta header が baseline と case 違い → violation
describe("TC-074: baseline-header-match — case mismatch is a violation", () => {
  it("returns baseline-header-mismatch when header is lowercase but baseline is mixed case", async () => {
    const baseline = makeSpec(["Foo Bar"]);
    const delta = makeSpec(["foo bar"]);
    const result = await baselineHeaderMatch.check(makeInput(delta, baseline));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("baseline-header-mismatch");
    expect(result[0]!.suggested).toContain(
      "Match baseline header exactly for MODIFIED, or treat as ADDED if new",
    );
  });
});

// TC-075: 違反 — delta header の余分な whitespace → violation
describe("TC-075: baseline-header-match — extra whitespace is a violation", () => {
  it("returns violation when delta header has extra spaces that normalize to baseline", async () => {
    const baseline = makeSpec(["Foo Bar"]);
    // Construct delta manually with extra spaces in the header
    const delta = [
      "## Requirements",
      "",
      "### Requirement:  Foo  Bar",
      "",
      "The system SHALL do something.",
      "",
      "#### Scenario: basic",
      "",
      "- GIVEN a user",
      "- WHEN they act",
      "- THEN it works",
      "",
    ].join("\n");
    const result = await baselineHeaderMatch.check(makeInput(delta, baseline));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("baseline-header-mismatch");
  });
});

// TC-076: 正常 — baseline に ## Requirements がない → violations なし
describe("TC-076: baseline-header-match — baseline without Requirements section passes", () => {
  it("returns [] when baseline has no ## Requirements section", async () => {
    const baseline = `# Spec\n\n## Purpose\n\nSome purpose.\n`;
    const delta = makeSpec(["Foo"]);
    const result = await baselineHeaderMatch.check(makeInput(delta, baseline));
    expect(result).toEqual([]);
  });
});

// TC-077: 混合 — exact match + ADDED + case 違い → 1 violation のみ
describe("TC-077: baseline-header-match — mixed: exact + ADDED + case mismatch → 1 violation", () => {
  it("returns exactly 1 violation for the case-mismatch entry only", async () => {
    const baseline = makeSpec(["ExactMatch", "CaseMismatch"]);
    // Build delta manually with three requirements
    const delta = [
      "## Requirements",
      "",
      // 1. exact match
      "### Requirement: ExactMatch",
      "",
      "The system SHALL do X.",
      "",
      "#### Scenario: s1",
      "",
      "- GIVEN a",
      "",
      // 2. new (ADDED)
      "### Requirement: BrandNewReq",
      "",
      "The system SHALL do Y.",
      "",
      "#### Scenario: s2",
      "",
      "- GIVEN b",
      "",
      // 3. case mismatch (normalized matches baseline "CaseMismatch")
      "### Requirement: casemismatch",
      "",
      "The system SHALL do Z.",
      "",
      "#### Scenario: s3",
      "",
      "- GIVEN c",
      "",
    ].join("\n");
    const result = await baselineHeaderMatch.check(makeInput(delta, baseline));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("baseline-header-mismatch");
  });
});
