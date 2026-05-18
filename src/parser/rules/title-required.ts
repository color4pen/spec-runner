import type { ValidationRule } from "../../core/validation/types.js";
import type { ParsedRequestRaw, RequestMdViolation } from "./types.js";

export const titleRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation> = {
  name: "title-required",
  severity: "error",
  check(input) {
    if (input.title === null) {
      return [
        {
          rule: "title-required",
          severity: "error",
          message: `missing title (top-level # heading required) in ${input.filePath}`,
          field: "title",
        },
      ];
    }
    return [];
  },
};
