/**
 * Unit tests for rollover-prompt.ts (T-03).
 *
 * TC-006: fresh session の prompt に git diff / tasks.md / 変更保持 / completion report の 4 要素が含まれる
 * TC-023: rollover 継続セクションに git commit / git push を指示する文言が含まれない
 * TC-024: rollover 継続セクションに attempt と maxRollovers が反映される
 */
import { describe, it, expect } from "vitest";
import { buildRolloverContinuationSection } from "../../../../src/adapter/claude-code/rollover-prompt.js";

describe("buildRolloverContinuationSection", () => {
  it("TC-006: contains git diff, tasks.md, change-preservation, and completion report references", () => {
    const result = buildRolloverContinuationSection({ attempt: 1, maxRollovers: 1 });

    // git diff reference (1)
    expect(result).toMatch(/git\s+diff/);
    // tasks.md reference (2)
    expect(result).toContain("tasks.md");
    // preserve / keep existing changes (3)
    expect(result).toMatch(/保持|preserve|revert\s*せず/i);
    // completion report reference (4)
    expect(result).toMatch(/completion report/i);
  });

  it("TC-023: does not contain git commit or git push instructions", () => {
    const result = buildRolloverContinuationSection({ attempt: 1, maxRollovers: 1 });

    // Must not instruct git commit
    expect(result).not.toMatch(/(?<![`\w])git\s+commit(?!\s*\w*\s*を実行しないで)/);
    // Check for commit instruction explicitly — the text "git commit は実行しないでください" is ALLOWED
    // (it is a prohibition, not an instruction). We check it does not appear as an instruction.
    // Simpler: the word "commit" appears only in prohibition context
    const lower = result.toLowerCase();
    const commitIdx = lower.indexOf("git commit");
    if (commitIdx !== -1) {
      // verify it's followed by a prohibition (しないで / don't / not)
      const surroundingText = result.slice(commitIdx, commitIdx + 50).toLowerCase();
      expect(surroundingText).toMatch(/しないで|don't|do not|not/);
    }

    // Must not instruct git push
    const pushIdx = lower.indexOf("git push");
    if (pushIdx !== -1) {
      const surroundingText = result.slice(pushIdx, pushIdx + 50).toLowerCase();
      expect(surroundingText).toMatch(/しないで|don't|do not|not/);
    }
  });

  it("TC-024: attempt and maxRollovers are reflected in the text", () => {
    const result = buildRolloverContinuationSection({ attempt: 2, maxRollovers: 3 });

    expect(result).toContain("2");
    expect(result).toContain("3");
  });

  it("attempt 1, maxRollovers 1 are in the text", () => {
    const result = buildRolloverContinuationSection({ attempt: 1, maxRollovers: 1 });
    // "1/1" or "1" ... "1"
    expect(result).toContain("1");
  });

  it("returns a non-empty string", () => {
    const result = buildRolloverContinuationSection({ attempt: 1, maxRollovers: 1 });
    expect(result.trim().length).toBeGreaterThan(0);
  });
});
