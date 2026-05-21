import { describe, it, expect } from "vitest";
import { renamedSectionFormat } from "../../../../../src/core/spec/rules/renamed-section-format.js";
import { makeFsMock, CHANGE_PATH } from "./helpers.js";

function makeInput(specContent: string) {
  return {
    changePath: CHANGE_PATH,
    deps: makeFsMock({ [`${CHANGE_PATH}/specs/cap/spec.md`]: specContent }),
  };
}

// TC-030: 正常 — Unicode arrow → violations なし
describe('TC-030: renamed-section-format — "old" → "new" Unicode arrow passes', () => {
  it("returns [] for Unicode arrow format", async () => {
    const content = `## Renamed\n- "OldName" → "NewName"\n`;
    const result = await renamedSectionFormat.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-031: 正常 — ASCII arrow -> → violations なし
describe('TC-031: renamed-section-format — "old" -> "new" ASCII arrow passes', () => {
  it("returns [] for ASCII -> arrow format", async () => {
    const content = `## Renamed\n- "OldName" -> "NewName"\n`;
    const result = await renamedSectionFormat.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-032: 正常 — fat arrow => → violations なし
describe('TC-032: renamed-section-format — "old" => "new" fat arrow passes', () => {
  it("returns [] for => fat arrow format", async () => {
    const content = `## Renamed\n- "OldName" => "NewName"\n`;
    const result = await renamedSectionFormat.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-033: 正常 — ## Renamed セクションなし → violations なし
describe("TC-033: renamed-section-format — no Renamed section passes", () => {
  it("returns [] when no ## Renamed section exists", async () => {
    const content = `## Requirements\n\n### Requirement: X\n\nThe system SHALL do X.\n`;
    const result = await renamedSectionFormat.check(makeInput(content));
    expect(result).toEqual([]);
  });
});

// TC-034: 違反 — 引用符なし → violation
describe("TC-034: renamed-section-format — unquoted names are a violation", () => {
  it("returns violation for - OldName → NewName without quotes", async () => {
    const content = `## Renamed\n- OldName → NewName\n`;
    const result = await renamedSectionFormat.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("renamed-section-format");
    expect(result[0]!.suggested).toContain('Replace with - "old" → "new" format per rules.md');
  });
});

// TC-035: 違反 — 自由形式テキスト → violation
describe("TC-035: renamed-section-format — free-form text is a violation", () => {
  it("returns violation for free-form text in Renamed section", async () => {
    const content = `## Renamed\nRenamed the old feature to something new.\n`;
    const result = await renamedSectionFormat.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("renamed-section-format");
  });
});

// TC-036: edge — 空ファイル → violations なし
describe("TC-036: renamed-section-format — empty file passes", () => {
  it("returns [] for empty spec content", async () => {
    const result = await renamedSectionFormat.check(makeInput(""));
    expect(result).toEqual([]);
  });
});

// TC-037: 違反 — 片側だけ引用符あり → violation
describe('TC-037: renamed-section-format — only one side quoted is a violation', () => {
  it('returns violation for - "OldName" → NewName (missing closing quote)', async () => {
    const content = `## Renamed\n- "OldName" → NewName\n`;
    const result = await renamedSectionFormat.check(makeInput(content));
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("renamed-section-format");
  });
});
