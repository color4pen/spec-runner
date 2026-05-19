import type { ValidationRule } from "../../core/validation/types.js";
import { TYPE_CONFIG } from "../../config/type-config.js";
import type { ParsedRequestRaw, RequestMdRuleName, RequestMdViolation } from "./types.js";

function isAllowedType(t: string): t is keyof typeof TYPE_CONFIG {
  return t in TYPE_CONFIG;
}

export const typeKnown: ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName> = {
  name: "type-known",
  severity: "warning",
  check(input) {
    if (input.type !== null && !isAllowedType(input.type)) {
      return [
        {
          rule: "type-known",
          severity: "warning",
          message: `Warning: unknown request type '${input.type}'.`,
          field: "type",
        },
      ];
    }
    return [];
  },
};
