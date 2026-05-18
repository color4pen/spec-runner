import { describe, it, expect } from "vitest";
import { RuleRegistry } from "../../../../src/core/validation/registry.js";
import type { ValidationRule } from "../../../../src/core/validation/types.js";

interface SimpleViolation {
  rule: string;
}

function makeRule(
  name: string,
  violations: SimpleViolation[],
): ValidationRule<unknown, SimpleViolation> {
  return {
    name,
    severity: "error",
    check: () => violations,
  };
}

// TC-REG-01: registered rule is called during validate
describe("TC-REG-01: register した rule が validate で呼ばれる", () => {
  it("returns violation from registered rule", () => {
    const registry = new RuleRegistry<unknown, SimpleViolation>();
    registry.register(makeRule("r1", [{ rule: "r1" }]));
    const result = registry.validate({});
    expect(result).toContainEqual({ rule: "r1" });
  });
});

// TC-REG-02: multiple rules, violations aggregated flat
describe("TC-REG-02: 複数 rule の violation が flat に集約される", () => {
  it("aggregates violations from all rules into a flat array", () => {
    const registry = new RuleRegistry<unknown, SimpleViolation>();
    registry.register(makeRule("r1", [{ rule: "r1" }]));
    registry.register(makeRule("r2", [{ rule: "r2a" }, { rule: "r2b" }]));
    const result = registry.validate({});
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ rule: "r1" });
    expect(result).toContainEqual({ rule: "r2a" });
    expect(result).toContainEqual({ rule: "r2b" });
  });
});

// TC-REG-03: duplicate rule name throws
describe("TC-REG-03: 同名 rule の重複 register で throw", () => {
  it("throws Error with duplicate rule name message", () => {
    const registry = new RuleRegistry<unknown, SimpleViolation>();
    registry.register(makeRule("dup", []));
    expect(() => registry.register(makeRule("dup", []))).toThrow(
      "Duplicate rule name: dup",
    );
  });
});

// TC-REG-04: empty registry returns empty array
describe("TC-REG-05: 空の RuleRegistry で validate すると [] が返る", () => {
  it("returns empty array when no rules are registered", () => {
    const registry = new RuleRegistry<unknown, SimpleViolation>();
    expect(registry.validate({})).toEqual([]);
  });
});
