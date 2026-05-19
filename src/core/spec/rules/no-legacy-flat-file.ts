import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";

export const noLegacyFlatFile: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "no-legacy-flat-file",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const { changePath, deps } = input;

    let topLevelEntries: string[] = [];
    try {
      topLevelEntries = await deps.readdir(changePath);
    } catch {
      // Change folder doesn't exist — nothing to validate
      return [];
    }

    if (topLevelEntries.includes("delta-spec.md")) {
      return [
        {
          path: `${changePath}/delta-spec.md`,
          reason: "legacy-flat-file",
          suggested: `Move to ${changePath}/specs/<capability-name>/spec.md`,
        },
      ];
    }

    return [];
  },
};
