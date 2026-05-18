import type { ValidationRule } from "../../core/validation/types.js";
import type { ParsedRequestRaw, RequestMdViolation } from "./types.js";

export const adrRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation> = {
  name: "adr-required",
  severity: "error",
  check(input) {
    if (input.adrRaw === null && input.adrAnyValue === null) {
      return [
        {
          rule: "adr-required",
          severity: "error",
          message: `missing 'adr' in Meta section in ${input.filePath}`,
          field: "adr",
        },
      ];
    }
    return [];
  },
};
