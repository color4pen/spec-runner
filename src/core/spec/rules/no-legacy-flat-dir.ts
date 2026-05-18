import type { DeltaSpecRule, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";

export const noLegacyFlatDir: DeltaSpecRule = {
  name: "no-legacy-flat-dir",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const { changePath, deps } = input;
    const violations: DeltaSpecViolation[] = [];

    let deltaSpecDirEntries: string[] = [];
    try {
      deltaSpecDirEntries = await deps.readdir(`${changePath}/delta-spec`);
    } catch {
      // Directory doesn't exist — OK
      return [];
    }

    for (const entry of deltaSpecDirEntries) {
      if (entry.endsWith(".md")) {
        violations.push({
          path: `${changePath}/delta-spec/${entry}`,
          reason: "legacy-flat-dir",
          suggested: `Move to ${changePath}/specs/${entry.replace(/\.md$/, "")}/spec.md`,
        });
      }
    }

    return violations;
  },
};
