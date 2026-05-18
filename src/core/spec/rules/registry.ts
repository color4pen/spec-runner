import type { DeltaSpecRule, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";

/**
 * Async registry for DeltaSpecRule instances.
 *
 * Unlike the generic RuleRegistry, this registry uses async check methods
 * because DSV rules need to perform fs operations.
 */
export class DeltaSpecRuleRegistry {
  private rules: DeltaSpecRule[] = [];

  register(rule: DeltaSpecRule): void {
    if (this.rules.some((r) => r.name === rule.name)) {
      throw new Error(`Duplicate rule name: ${rule.name}`);
    }
    this.rules.push(rule);
  }

  async validate(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const violations: DeltaSpecViolation[] = [];
    for (const rule of this.rules) {
      violations.push(...(await rule.check(input)));
    }
    return violations;
  }
}
