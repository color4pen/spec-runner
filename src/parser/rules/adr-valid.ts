import type { ValidationRule } from "../../core/validation/types.js";
import type { ParsedRequestRaw, RequestMdRuleName, RequestMdViolation } from "./types.js";

export const adrValid: ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName> = {
  name: "adr-valid",
  severity: "error",
  check(input) {
    // adrRaw is null but adrAnyValue is non-null → invalid value was provided
    if (input.adrRaw === null && input.adrAnyValue !== null) {
      return [
        {
          rule: "adr-valid",
          severity: "error",
          message: `invalid value for 'adr' in Meta section in ${input.filePath}: must be 'true' or 'false', got '${input.adrAnyValue}'`,
          field: "adr",
        },
      ];
    }
    return [];
  },
};
