import type { ValidationRule } from "../../core/validation/types.js";
import type { ParsedRequestRaw, RequestMdRuleName, RequestMdViolation } from "./types.js";
import { BASE_BRANCH_REGEX } from "../../util/validation-patterns.js";

export const baseBranchRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName> = {
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
    if (!BASE_BRANCH_REGEX.test(input.baseBranch)) {
      return [
        {
          rule: "base-branch-required",
          severity: "error",
          message: `invalid base-branch '${input.baseBranch}' in ${input.filePath}. Must match /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/`,
          field: "baseBranch",
        },
      ];
    }
    return [];
  },
};
