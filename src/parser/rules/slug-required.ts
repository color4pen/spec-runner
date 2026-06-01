import type { ValidationRule } from "../validation/types.js";
import type { ParsedRequestRaw, RequestMdRuleName, RequestMdViolation } from "./types.js";
import { SLUG_REGEX } from "../../util/validation-patterns.js";

export const slugRequired: ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName> = {
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
    if (!SLUG_REGEX.test(input.slug)) {
      return [
        {
          rule: "slug-required",
          severity: "error",
          message: `invalid slug '${input.slug}' in ${input.filePath}. Must match /^[a-z0-9][a-z0-9-]{0,63}$/`,
          field: "slug",
        },
      ];
    }
    return [];
  },
};
