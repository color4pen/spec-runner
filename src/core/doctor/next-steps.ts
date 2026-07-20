/**
 * Derive ordered next-step prescriptions from a set of doctor check results.
 *
 * Rules (dependency order):
 *   git-repository fail       → git init
 *   github-origin fail        → git remote add origin <url>
 *   config-file-exists fail   → specrunner init
 *   github-token-present fail
 *   OR github-token-valid fail → specrunner login
 *
 * Only `status === "fail"` results are considered.
 * Steps are returned in dependency order with duplicates removed.
 */
import type { DoctorResult } from "./types.js";

/** Ordered prescription rules. */
const RULES: Array<{
  checkNames: string[];
  step: string;
}> = [
  { checkNames: ["git-repository"], step: "git init" },
  { checkNames: ["github-origin"], step: "git remote add origin <url>" },
  { checkNames: ["config-file-exists"], step: "specrunner init" },
  { checkNames: ["github-token-present", "github-token-valid"], step: "specrunner login" },
];

/**
 * Derive an ordered list of next-step prescriptions from `DoctorResult[]`.
 * Returns an empty array when no checks have failed.
 */
export function deriveNextSteps(results: DoctorResult[]): string[] {
  const failedNames = new Set(
    results.filter((r) => r.status === "fail").map((r) => r.name),
  );

  const steps: string[] = [];
  for (const rule of RULES) {
    if (rule.checkNames.some((name) => failedNames.has(name))) {
      steps.push(rule.step);
    }
  }
  return steps;
}
