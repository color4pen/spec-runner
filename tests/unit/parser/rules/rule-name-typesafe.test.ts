/**
 * Type-level tests verifying that RequestMdRuleName constrains ValidationRule.name at compile time.
 *
 * These tests use @ts-expect-error to assert that typo'd rule names cause type errors,
 * and verify that valid names compile without error.
 */
import { describe, expect, it } from "vitest";
import type { ValidationRule } from "../../../../src/core/validation/types.js";
import type {
  ParsedRequestRaw,
  RequestMdRuleName,
  RequestMdViolation,
} from "../../../../src/parser/rules/types.js";

describe("RequestMdRuleName type safety", () => {
  it("accepts all 7 valid rule names", () => {
    const validNames: RequestMdRuleName[] = [
      "type-required",
      "type-known",
      "slug-required",
      "base-branch-required",
      "adr-required",
      "adr-valid",
      "title-required",
    ];
    expect(validNames).toHaveLength(7);
  });

  it("valid name compiles without error", () => {
    const rule: ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName> = {
      name: "type-required",
      severity: "error",
      check: () => [],
    };
    expect(rule.name).toBe("type-required");
  });

  it("typo'd name causes a compile-time type error", () => {
    // Helper that accepts only typed ValidationRule — used to trigger compile-time check
    function assertRuleType(
      _rule: ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>,
    ): void {}

    // @ts-expect-error "type-requied" is not assignable to RequestMdRuleName
    assertRuleType({ name: "type-requied", severity: "error", check: () => [] });

    // This should compile fine (no @ts-expect-error needed)
    assertRuleType({ name: "type-required", severity: "error", check: () => [] });

    expect(true).toBe(true); // test passes at runtime; type error caught at compile time
  });

  it("backward-compatible: ValidationRule<TInput, TViolation> without TName still accepts any string", () => {
    const rule: ValidationRule<ParsedRequestRaw, RequestMdViolation> = {
      name: "any-free-string",
      severity: "warning",
      check: () => [],
    };
    expect(rule.name).toBe("any-free-string");
  });
});
