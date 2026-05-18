import type { ValidationRule } from "../../core/validation/types.js";
import type { ParsedRequestRaw, RequestMdViolation } from "./types.js";

export const slugRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation> = {
  name: "slug-required",
  severity: "error",
  check(input) {
    if (input.slug === null || input.slug.length === 0) {
      return [
        {
          rule: "slug-required",
          severity: "error",
          message: `missing 'slug' in Meta section in ${input.filePath}`,
          field: "slug",
        },
      ];
    }
    return [];
  },
};
