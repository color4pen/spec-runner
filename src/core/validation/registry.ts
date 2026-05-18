import type { ValidationRule } from "./types.js";

/**
 * Registry that collects ValidationRule instances and runs them against an input.
 *
 * - register(): adds a rule; throws on duplicate name
 * - validate(): runs all rules and returns a flat list of violations
 */
export class RuleRegistry<TInput, TViolation> {
  private rules: ValidationRule<TInput, TViolation>[] = [];

  register(rule: ValidationRule<TInput, TViolation>): void {
    if (this.rules.some((r) => r.name === rule.name)) {
      throw new Error(`Duplicate rule name: ${rule.name}`);
    }
    this.rules.push(rule);
  }

  validate(input: TInput): TViolation[] {
    return this.rules.flatMap((r) => r.check(input));
  }
}
