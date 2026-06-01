/**
 * RuleRegistry — canonical location in shared-kernel (parser/validation/).
 *
 * Moved here from src/core/validation/registry.ts per structure-rulings D4.
 * The core/validation/registry.ts module re-exports from this file (domain → kernel, allowed).
 */
import type { ValidationRule } from "./types.js";

/**
 * Registry that collects ValidationRule instances and runs them against an input.
 *
 * - register(): adds a rule; throws on duplicate name
 * - validate(): runs all rules and returns a flat list of violations
 */
export class RuleRegistry<TInput, TViolation, TName extends string = string> {
  private rules: ValidationRule<TInput, TViolation, TName>[] = [];

  register(rule: ValidationRule<TInput, TViolation, TName>): void {
    if (this.rules.some((r) => r.name === rule.name)) {
      throw new Error(`Duplicate rule name: ${rule.name}`);
    }
    this.rules.push(rule);
  }

  validate(input: TInput): TViolation[] {
    return this.rules.flatMap((r) => r.check(input));
  }
}
