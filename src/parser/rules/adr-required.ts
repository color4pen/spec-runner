import type { ValidationRule } from "../validation/types.js";
import type { ParsedRequestRaw, RequestMdRuleName, RequestMdViolation } from "./types.js";

export const adrRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName> = {
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
