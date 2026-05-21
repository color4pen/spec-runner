import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";
import { loadSpecFiles, extractSection } from "./spec-content-parser.js";

/**
 * Validates that every non-empty, non-heading line in `## Removed` sections
 * matches the required format: `- "<requirement-name>"`
 */
export const removedSectionFormat: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "removed-section-format",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const violations: DeltaSpecViolation[] = [];
    const specFiles = await loadSpecFiles(input);

    // Matches: - "any text"
    const validLineRegex = /^-\s+"(.+?)"\s*$/;

    for (const { specPath, content } of specFiles) {
      const section = extractSection(content, "## Removed");
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
            reason: "removed-section-format",
            suggested: 'Replace with - "<requirement-name>" format per rules.md',
          });
        }
      }
    }

    return violations;
  },
};
