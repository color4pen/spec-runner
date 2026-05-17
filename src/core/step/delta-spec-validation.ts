import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import type { CliStep, CliStepDeps, ParsedStepResult } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { validateDeltaSpecPaths } from "../spec/delta-spec-validator.js";
import type { DeltaSpecViolation } from "../spec/delta-spec-validator.js";
import { deltaSpecValidationResultPath, changeFolderPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";

/**
 * Format a violations table in Markdown for embedding in the result file.
 * delta-spec-fixer will read this file to understand what needs to be fixed.
 */
function formatViolationsTable(violations: DeltaSpecViolation[]): string {
  // Build a Markdown table
  const header = "| Path | Reason | Suggested Fix |\n|------|--------|---------------|\n";
  const rows = violations.map((v) => {
    const path = v.path.replace(/\|/g, "\\|");
    const reason = v.reason;
    const suggested = (v.suggested ?? "—").replace(/\|/g, "\\|");
    return `| \`${path}\` | \`${reason}\` | ${suggested} |`;
  });
  return header + rows.join("\n");
}

/**
 * DeltaSpecValidationStep: CliStep that validates delta spec paths/format.
 *
 * kind: "cli" — no agent session, runs synchronously.
 * Calls validateDeltaSpecPaths() and writes delta-spec-validation-result.md.
 * Verdict: "approved" if all checks pass, "needs-fix" if violations found.
 *
 * Design D1: mirrored after VerificationStep — deterministic, no agent runner.
 * Design D2: result file content is the sole source of truth for verdict.
 */
export const DeltaSpecValidationStep: CliStep = {
  kind: "cli",
  name: STEP_NAMES.DELTA_SPEC_VALIDATION,

  async run(state: JobState, deps: CliStepDeps): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const changePath = nodePath.join(cwd, changeFolderPath(deps.slug));

    const result = await validateDeltaSpecPaths(changePath, {
      readdir: (p: string) => nodeFs.readdir(p),
      readFile: (p: string) => nodeFs.readFile(p, "utf-8"),
    });

    const resultRelPath = deltaSpecValidationResultPath(deps.slug);
    const resultAbsPath = nodePath.resolve(cwd, resultRelPath);
    const resultDir = nodePath.dirname(resultAbsPath);
    await nodeFs.mkdir(resultDir, { recursive: true });

    if (result.ok) {
      await nodeFs.writeFile(
        resultAbsPath,
        `# Delta Spec Validation Result\n\n## Verdict: approved\n\nAll delta spec files conform to the canonical path and format.\n`,
        "utf-8",
      );
    } else {
      const table = formatViolationsTable(result.violations);
      await nodeFs.writeFile(
        resultAbsPath,
        `# Delta Spec Validation Result\n\n## Verdict: needs-fix\n\n## Violations\n\n${table}\n\n## How to Fix\n\n- Move all delta spec files to \`specs/<capability-name>/spec.md\` (canonical path)\n- Ensure each spec.md has at least one \`## ADDED Requirements\`, \`## MODIFIED Requirements\`, or \`## REMOVED Requirements\` section\n- Ensure each section contains at least one \`### Requirement:\` block\n`,
        "utf-8",
      );
    }
  },

  resultFilePath(_state: JobState, deps: StepDeps): string {
    return deltaSpecValidationResultPath(deps.slug);
  },

  parseResult(content: string, deps: StepDeps): ParsedStepResult {
    const match = /^## Verdict: (approved|needs-fix)$/m.exec(content);
    const verdict = match?.[1] as "approved" | "needs-fix" | undefined;
    const filePath = deltaSpecValidationResultPath(deps.slug);
    return {
      verdict: verdict ?? null,
      findingsPath: verdict === "needs-fix" ? filePath : null,
    };
  },
};
