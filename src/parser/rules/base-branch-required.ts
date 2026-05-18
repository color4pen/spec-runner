import type { ValidationRule } from "../../core/validation/types.js";
import type { ParsedRequestRaw, RequestMdViolation } from "./types.js";

export const baseBranchRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation> = {
  name: "base-branch-required",
  severity: "error",
  check(input) {
    if (input.baseBranch === null || input.baseBranch.length === 0) {
      return [
        {
          rule: "base-branch-required",
          severity: "error",
          message: `missing 'base-branch' in Meta section in ${input.filePath}`,
          field: "baseBranch",
        },
      ];
    }
    return [];
  },
};
