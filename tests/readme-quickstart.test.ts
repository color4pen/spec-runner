/**
 * TC-019: README Quick Start is doctor-centered.
 *
 * Asserts:
 *   - 'specrunner doctor' appears in the Quick Start section
 *   - No unconditional 'specrunner login' as a required step (login is optional, shown conditionally)
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const README_PATH = path.resolve(__dirname, "../README.md");

/** Extract the Quick Start section (from ## Quick Start to the next ## heading). */
function extractQuickStart(content: string): string {
  const startMatch = content.match(/^## Quick Start\b/m);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error("README.md: '## Quick Start' section not found");
  }
  const startIdx = startMatch.index;
  // Find the next top-level heading after Quick Start
  const afterStart = content.slice(startIdx + startMatch[0].length);
  const nextHeadingMatch = afterStart.match(/^## \w/m);
  const endIdx = nextHeadingMatch?.index !== undefined
    ? startIdx + startMatch[0].length + nextHeadingMatch.index
    : content.length;
  return content.slice(startIdx, endIdx);
}

describe("TC-019: README Quick Start is doctor-centered", () => {
  it("Quick Start section contains 'specrunner doctor'", async () => {
    const content = await fs.readFile(README_PATH, "utf-8");
    const quickStart = extractQuickStart(content);
    expect(quickStart).toContain("specrunner doctor");
  });

  it("Quick Start section does not contain unconditional 'npx specrunner login' as a required step", async () => {
    const content = await fs.readFile(README_PATH, "utf-8");
    const quickStart = extractQuickStart(content);

    // Split into lines and look for bare `npx specrunner login` (not inside a comment/conditional)
    const lines = quickStart.split("\n");

    // A line is "unconditional" if it's a bare code line that just runs login without commentary
    // We check that every occurrence of 'specrunner login' is either:
    //   - inside a conditional comment (lines starting with #  or followed by text)
    //   - not present at all as a standalone required step
    //
    // Specifically: a line like `npx specrunner login` alone in a code block (no # comment) is forbidden.
    const unconditionalLoginLines = lines.filter((line) => {
      const trimmed = line.trim();
      // Matches: `npx specrunner login` or `specrunner login` on its own (no leading # comment in code)
      return /^npx specrunner login\s*$/.test(trimmed) || /^specrunner login\s*$/.test(trimmed);
    });

    if (unconditionalLoginLines.length > 0) {
      throw new Error(
        `README Quick Start has unconditional login steps (login should be conditional):\n${unconditionalLoginLines.join("\n")}`,
      );
    }

    expect(unconditionalLoginLines.length).toBe(0);
  });
});
