/**
 * TC-031, TC-032, TC-033
 * Check that specrunner/drafts/ and specrunner/changes/ exist.
 * specrunner/requests/active/ presence triggers a deprecation warning.
 * Missing dirs = warn (not fail).
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const workflowStructureCheck: DoctorCheck = {
  name: "workflow-structure",
  category: "repo",
  required: false,

  async check(ctx: DoctorContext) {
    const missingDirs: string[] = [];

    // Check specrunner/drafts/ exists
    const draftsDirPath = path.join(ctx.cwd, "specrunner", "drafts");
    if (!ctx.fs.existsSync(draftsDirPath)) {
      missingDirs.push("drafts");
    }

    // Check specrunner/changes/ exists
    const changesDirPath = path.join(ctx.cwd, "specrunner", "changes");
    if (!ctx.fs.existsSync(changesDirPath)) {
      missingDirs.push("changes");
    }

    // Deprecation: requests/active/ should no longer be used
    const activeDirPath = path.join(ctx.cwd, "specrunner", "requests", "active");
    const isDeprecatedPresent = ctx.fs.existsSync(activeDirPath);

    // Collect all issues before returning so missing-dir warnings are not masked
    // by the deprecation early-return when both conditions are true simultaneously.
    if (!isDeprecatedPresent && missingDirs.length === 0) {
      return {
        status: "pass",
        message: "specrunner/ structure is complete",
      };
    }

    const messageParts: string[] = [];
    const hintParts: string[] = [];

    if (isDeprecatedPresent) {
      messageParts.push(
        "specrunner/requests/active/ is deprecated. Use specrunner/drafts/ instead."
      );
      hintParts.push(
        "Move any remaining files from requests/active/ to specrunner/drafts/ and remove the active/ directory."
      );
    }
    if (missingDirs.length > 0) {
      messageParts.push(`specrunner/ is missing dirs: ${missingDirs.join(", ")}`);
      hintParts.push("Create the missing directories manually.");
    }

    return {
      status: "warn",
      message: messageParts.join(" "),
      hint: hintParts.join(" "),
    };
  },
};
