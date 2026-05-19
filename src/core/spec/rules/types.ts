import type { DeltaSpecViolation, DeltaSpecValidatorFs } from "../delta-spec-validator.js";

export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
}

export type DeltaSpecRuleName =
  | "canonical-spec-structure"
  | "no-legacy-flat-dir"
  | "no-legacy-flat-file"
  | "no-specs-for-required-type";

export interface DeltaSpecRule<TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
