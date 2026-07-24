/**
 * Prompt contract tests for spec-review full-enumeration discipline.
 *
 * TC-001: Method 節に全量列挙規律が含まれる (must)
 *   - SPEC_REVIEW_SYSTEM_PROMPT の ## Method 節を抽出し「全量列挙」「小出し」「後出し」を含むことを固定
 *   - 全文 grep ではなく節抽出に対する assert
 *
 * TC-009: Method 節追記が既存の 5 節骨格を破壊しない (must)
 *   - 5 節（Question / Contract / Method / Evidence / Completion）がすべて含まれる
 *   - ## Method 節内に余分な h2 見出しが存在しない
 *
 * These tests are intentionally RED until T-01 (prompt update) is implemented.
 */
import { describe, it, expect } from "vitest";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../spec-review-system.js";

// ---------------------------------------------------------------------------
// Helpers (same pattern as prompt-skeleton-drift-guard.test.ts)
// ---------------------------------------------------------------------------

/**
 * Extract the text of a named section (from its heading to the next ## heading).
 * Returns undefined if the section heading is not found.
 */
function extractSection(prompt: string, sectionName: string): string | undefined {
  const headingPattern = new RegExp(`^## ${sectionName}\\s*$`, "m");
  const match = headingPattern.exec(prompt);
  if (!match || match.index === undefined) return undefined;
  const afterHeading = prompt.slice(match.index);
  // find next ## heading
  const nextHeadingMatch = /^## \S/m.exec(afterHeading.slice(1));
  if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
    return afterHeading.slice(0, nextHeadingMatch.index + 1);
  }
  return afterHeading;
}

// ---------------------------------------------------------------------------
// TC-001: Method 節に全量列挙規律が含まれる
// Source: spec.md > Requirement: spec-review prompt は finding の全量列挙を要求する
//         > Scenario: Method 節に全量列挙規律が含まれる
// ---------------------------------------------------------------------------

describe('TC-001: Method 節に全量列挙規律が含まれる — SPEC_REVIEW_SYSTEM_PROMPT', () => {
  it('TC-001: ## Method 節を抽出したテキストが「全量列挙」を含む', () => {
    const methodSection = extractSection(SPEC_REVIEW_SYSTEM_PROMPT, "Method");
    expect(methodSection, "## Method section must exist in SPEC_REVIEW_SYSTEM_PROMPT").toBeTruthy();
    expect(methodSection).toContain("全量列挙");
  });

  it('TC-001: ## Method 節を抽出したテキストが「小出し」を含む', () => {
    const methodSection = extractSection(SPEC_REVIEW_SYSTEM_PROMPT, "Method");
    expect(methodSection, "## Method section must exist").toBeTruthy();
    expect(methodSection).toContain("小出し");
  });

  it('TC-001: ## Method 節を抽出したテキストが「後出し」を含む', () => {
    const methodSection = extractSection(SPEC_REVIEW_SYSTEM_PROMPT, "Method");
    expect(methodSection, "## Method section must exist").toBeTruthy();
    expect(methodSection).toContain("後出し");
  });
});

// ---------------------------------------------------------------------------
// TC-009: Method 節追記が既存の 5 節骨格を破壊しない
// Source: tasks.md > T-01
// ---------------------------------------------------------------------------

describe('TC-009: Method 節追記が既存の 5 節骨格を破壊しない', () => {
  const REQUIRED_HEADINGS = [
    "## Question",
    "## Contract",
    "## Method",
    "## Evidence",
    "## Completion",
  ];

  it("TC-009: SPEC_REVIEW_SYSTEM_PROMPT が 5 節すべての h2 見出しを含む", () => {
    for (const heading of REQUIRED_HEADINGS) {
      expect(SPEC_REVIEW_SYSTEM_PROMPT, `Missing heading: "${heading}"`).toContain(heading);
    }
  });

  it("TC-009: SPEC_REVIEW_SYSTEM_PROMPT の 5 節が正しい順序で出現する (Question→Contract→Method→Evidence→Completion)", () => {
    const indices = REQUIRED_HEADINGS.map((h) => SPEC_REVIEW_SYSTEM_PROMPT.indexOf(h));
    for (let i = 1; i < indices.length; i++) {
      expect(
        indices[i],
        `"${REQUIRED_HEADINGS[i]!}" must appear after "${REQUIRED_HEADINGS[i - 1]!}"`,
      ).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("TC-009: ## Method 節内に余分な h2 見出しが存在しない（節境界を破壊しない）", () => {
    const methodSection = extractSection(SPEC_REVIEW_SYSTEM_PROMPT, "Method");
    expect(methodSection, "## Method section must exist").toBeTruthy();

    // Extract all h2 lines within the Method section
    const h2Lines = methodSection!
      .split("\n")
      .filter((line) => /^## /.test(line));

    // The Method section text (from extractSection) starts with "## Method".
    // It should contain ONLY "## Method" as an h2 line.
    // Any additional h2 heading in the Method section would be an extra heading that breaks the skeleton.
    expect(h2Lines, "Method section must not introduce extra h2 headings").toHaveLength(1);
    expect(h2Lines[0]).toBe("## Method");
  });
});
