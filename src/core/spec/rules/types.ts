import type { DeltaSpecViolation, DeltaSpecValidatorFs } from "../delta-spec-validator.js";

export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
}

export interface DeltaSpecRule {
  name: string;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
