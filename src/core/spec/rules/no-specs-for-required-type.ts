import type { DeltaSpecRule, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";

const TYPES_REQUIRING_SPECS = ["spec-change", "new-feature"];

export const noSpecsForRequiredType: DeltaSpecRule = {
  name: "no-specs-for-required-type",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const { changePath, deps, requestType } = input;

    if (!requestType || !TYPES_REQUIRING_SPECS.includes(requestType)) {
      return [];
    }

    let specsFound = false;
    try {
      const specsTopEntries = await deps.readdir(`${changePath}/specs`);
      for (const entry of specsTopEntries) {
        if (entry.endsWith(".md")) {
          specsFound = true;
          break;
        }
        try {
          const subEntries = await deps.readdir(`${changePath}/specs/${entry}`);
          if (subEntries.some((e) => e.endsWith(".md"))) {
            specsFound = true;
            break;
          }
        } catch {
          // not a dir
        }
      }
    } catch {
      // specs/ doesn't exist
    }

    if (!specsFound) {
      return [
        {
          path: `${changePath}/specs/`,
          reason: "no-specs-for-required-type",
          suggested: `Request type '${requestType}' requires a delta spec. Add a file under ${changePath}/specs/<capability-name>/spec.md`,
        },
      ];
    }

    return [];
  },
};
