import type { DeltaSpecViolation, DeltaSpecValidatorFs } from "../delta-spec-validator.js";

export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
  baselineSpecLoader?: (capability: string) => Promise<string | null>;
  /**
   * List of files changed relative to the repo root (from `git diff <base>..HEAD --name-only`).
   * Injected by DeltaSpecValidationStep.run() so that rules like no-authority-spec-direct-edit
   * can detect files outside the change folder.
   * Optional — undefined means git diff was unavailable (graceful degradation).
   */
  changedFiles?: string[];
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
  | "baseline-header-match"
  | "no-authority-spec-direct-edit";

export interface DeltaSpecRule<TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
