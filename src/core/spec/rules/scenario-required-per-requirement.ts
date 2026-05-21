import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";
import { loadSpecFiles, extractSection, parseRequirementBlocks } from "./spec-content-parser.js";

/**
 * Validates that each `### Requirement:` block contains at least one
 * `#### Scenario:` entry.
 */
export const scenarioRequiredPerRequirement: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "scenario-required-per-requirement",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const violations: DeltaSpecViolation[] = [];
    const specFiles = await loadSpecFiles(input);

    for (const { specPath, content } of specFiles) {
      const section = extractSection(content, "## Requirements");
      if (section === null) {
        continue;
      }

      const blocks = parseRequirementBlocks(section);
      for (const block of blocks) {
        if (!block.hasScenario) {
          violations.push({
            path: specPath,
            reason: "missing-scenario",
            suggested: "Add at least one #### Scenario: block describing observable behavior",
          });
        }
      }
    }

    return violations;
  },
};
