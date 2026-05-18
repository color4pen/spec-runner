import type { ValidationRule } from "../../core/validation/types.js";
import type { ParsedRequestRaw, RequestMdViolation } from "./types.js";

export const typeRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation> = {
  name: "type-required",
  severity: "error",
  check(input) {
    if (input.type === null) {
      return [
        {
          rule: "type-required",
          severity: "error",
          message: `missing 'type' in Meta section in ${input.filePath}`,
          field: "type",
        },
      ];
    }
    return [];
  },
};
