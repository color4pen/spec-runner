import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";
import { loadSpecFiles, extractSection } from "./spec-content-parser.js";

/**
 * Validates that every non-empty line in `## Renamed` sections matches:
 * `- "old" → "new"` (also accepts `->` and `=>` arrow variants)
 */
export const renamedSectionFormat: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "renamed-section-format",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const violations: DeltaSpecViolation[] = [];
    const specFiles = await loadSpecFiles(input);

    // Matches: - "old" → "new" (or -> or =>)
    const validLineRegex = /^-\s+"(.+?)"\s*(?:→|->|=>)\s*"(.+?)"\s*$/;

    for (const { specPath, content } of specFiles) {
      const section = extractSection(content, "## Renamed");
      if (section === null) {
        continue;
      }

      const lines = section.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines only
        if (trimmed === "") {
          continue;
        }
        if (!validLineRegex.test(trimmed)) {
          violations.push({
            path: specPath,
            reason: "renamed-section-format",
            suggested: 'Replace with - "old" → "new" format per rules.md',
          });
        }
      }
    }

    return violations;
  },
};
