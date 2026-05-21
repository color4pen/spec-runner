import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";
import { loadSpecFiles, extractSection } from "./spec-content-parser.js";

/**
 * Validates that every `### ` heading within `## Requirements` starts with
 * `### Requirement:`. Any other h3 prefix is a violation.
 */
export const requirementHeaderRequired: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "requirement-header-required",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const violations: DeltaSpecViolation[] = [];
    const specFiles = await loadSpecFiles(input);

    for (const { specPath, content } of specFiles) {
      const section = extractSection(content, "## Requirements");
      if (section === null) {
        continue;
      }

      const lines = section.split("\n");
      for (const line of lines) {
        if (line.startsWith("### ") && !line.startsWith("### Requirement:")) {
          violations.push({
            path: specPath,
            reason: "non-standard-requirement-header",
            suggested: "Use ### Requirement: prefix for all requirement headers",
          });
        }
      }
    }

    return violations;
  },
};
