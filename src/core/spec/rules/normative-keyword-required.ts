import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";
import { loadSpecFiles, extractSection, parseRequirementBlocks } from "./spec-content-parser.js";

/**
 * Validates that each `### Requirement:` block's body (the text between the
 * header and the first `#### Scenario:`) contains the word `SHALL` or `MUST`.
 *
 * Note: only the body is checked — the header line itself is not body text.
 */
export const normativeKeywordRequired: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "normative-keyword-required",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const violations: DeltaSpecViolation[] = [];
    const specFiles = await loadSpecFiles(input);

    const normativeRegex = /\bSHALL\b|\bMUST\b/;

    for (const { specPath, content } of specFiles) {
      const section = extractSection(content, "## Requirements");
      if (section === null) {
        continue;
      }

      const blocks = parseRequirementBlocks(section);
      for (const block of blocks) {
        if (!normativeRegex.test(block.body)) {
          violations.push({
            path: specPath,
            reason: "missing-normative-keyword",
            suggested: "Add SHALL or MUST in Requirement body to express normative intent",
          });
        }
      }
    }

    return violations;
  },
};
