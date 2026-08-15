/**
 * Prompt-contract tests for artifact-hygiene discipline in COMMIT_DISCIPLINE
 * and composed producer system prompts.
 *
 * Covers:
 *   TC-040 (must): Artifact-hygiene discipline wording is present in COMMIT_DISCIPLINE
 *                  and all composed producer prompts (implementer, build-fixer, code-fixer)
 *
 * RED state: tests fail until:
 *   - T-05: COMMIT_DISCIPLINE fragment in src/prompts/fragments.ts is extended
 *            with the generated-artifact / scratch-file hygiene clause
 *
 * Mirror of coverage-gate-prohibition.test.ts style.
 * Do NOT edit individual producer prompt files (implementer-system.ts, build-fixer-system.ts,
 * code-fixer-system.ts) — the discipline must reach them through the shared COMMIT_DISCIPLINE fragment.
 */

import { describe, it, expect } from "vitest";
import { COMMIT_DISCIPLINE } from "../fragments.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../implementer-system.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../code-fixer-system.js";

// ---------------------------------------------------------------------------
// TC-040: COMMIT_DISCIPLINE retains git-operations prohibition AND adds hygiene clause
// ---------------------------------------------------------------------------

describe("TC-040: COMMIT_DISCIPLINE retains git-operations prohibition", () => {
  it(
    // TC-040
    "TC-040: COMMIT_DISCIPLINE still prohibits git add",
    () => {
      // GIVEN the COMMIT_DISCIPLINE fragment
      // WHEN its text is inspected
      // THEN it still contains the git add prohibition
      expect(COMMIT_DISCIPLINE).toContain("git add");
    },
  );

  it(
    // TC-040
    "TC-040: COMMIT_DISCIPLINE still prohibits git commit",
    () => {
      expect(COMMIT_DISCIPLINE).toContain("git commit");
    },
  );

  it(
    // TC-040
    "TC-040: COMMIT_DISCIPLINE still prohibits git push",
    () => {
      expect(COMMIT_DISCIPLINE).toContain("git push");
    },
  );
});

describe("TC-040: COMMIT_DISCIPLINE contains the artifact-hygiene clause", () => {
  it(
    // TC-040
    "TC-040: COMMIT_DISCIPLINE references build outputs / generated artifacts (生成物)",
    () => {
      // The hygiene clause must reference build outputs / generated artifacts
      // Using the Japanese term from the spec: 生成物
      expect(COMMIT_DISCIPLINE).toContain("生成物");
    },
  );

  it(
    // TC-040
    "TC-040: COMMIT_DISCIPLINE references scratch files",
    () => {
      // The hygiene clause must reference scratch files
      expect(COMMIT_DISCIPLINE).toContain("scratch");
    },
  );

  it(
    // TC-040
    "TC-040: COMMIT_DISCIPLINE instructs agents about .gitignore",
    () => {
      // The hygiene clause must name .gitignore as the escape hatch
      expect(COMMIT_DISCIPLINE).toContain(".gitignore");
    },
  );

  it(
    // TC-040
    "TC-040: COMMIT_DISCIPLINE instructs agents not to emit outputs into tracked locations",
    () => {
      // The clause must address tracked/staged locations (tracked or staged)
      const hasTracked = COMMIT_DISCIPLINE.includes("tracked");
      const hasStaged = COMMIT_DISCIPLINE.includes("staged");
      expect(hasTracked || hasStaged).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-040: Artifact-hygiene wording is present in all composed producer prompts
// (verifying the fragment composes through buildSystemPrompt)
// ---------------------------------------------------------------------------

describe("TC-040: IMPLEMENTER_SYSTEM_PROMPT contains artifact-hygiene wording", () => {
  it(
    // TC-040
    "TC-040: IMPLEMENTER_SYSTEM_PROMPT includes 生成物 (artifact-hygiene clause)",
    () => {
      // GIVEN IMPLEMENTER_SYSTEM_PROMPT composed via buildSystemPrompt
      // WHEN its text is inspected
      // THEN it contains the artifact-hygiene wording (from COMMIT_DISCIPLINE)
      expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("生成物");
    },
  );

  it(
    // TC-040
    "TC-040: IMPLEMENTER_SYSTEM_PROMPT includes .gitignore reference (artifact-hygiene clause)",
    () => {
      expect(IMPLEMENTER_SYSTEM_PROMPT).toContain(".gitignore");
    },
  );
});

// TC-040: BUILD_FIXER_SYSTEM_PROMPT は廃止済みのためテストを除去。

describe("TC-040: CODE_FIXER_SYSTEM_PROMPT contains artifact-hygiene wording", () => {
  it(
    // TC-040
    "TC-040: CODE_FIXER_SYSTEM_PROMPT includes 生成物 (artifact-hygiene clause)",
    () => {
      // GIVEN CODE_FIXER_SYSTEM_PROMPT composed via buildSystemPrompt with COMMIT_DISCIPLINE
      // WHEN its text is inspected
      // THEN it contains the artifact-hygiene wording
      expect(CODE_FIXER_SYSTEM_PROMPT).toContain("生成物");
    },
  );

  it(
    // TC-040
    "TC-040: CODE_FIXER_SYSTEM_PROMPT includes .gitignore reference (artifact-hygiene clause)",
    () => {
      expect(CODE_FIXER_SYSTEM_PROMPT).toContain(".gitignore");
    },
  );
});
