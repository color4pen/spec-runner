import type { DeltaSpecViolation, DeltaSpecValidatorFs } from "../delta-spec-validator.js";

export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
  baselineSpecLoader?: (capability: string) => Promise<string | null>;
}

export type DeltaSpecRuleName =
  | "canonical-spec-structure"
  | "no-legacy-flat-dir"
  | "no-legacy-flat-file"
  | "no-specs-for-required-type"
  | "removed-section-format"
  | "renamed-section-format"
  | "requirement-header-required"
  | "scenario-required-per-requirement"
  | "normative-keyword-required"
  | "baseline-header-match";

export interface DeltaSpecRule<TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
