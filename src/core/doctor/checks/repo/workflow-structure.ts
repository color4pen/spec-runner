/**
 * TC-031, TC-032
 * Check that specrunner/requests/{active,merged}/ all exist.
 * Missing dirs = warn (not fail).
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

const REQUIRED_DIRS = ["active", "merged"] as const;

export const workflowStructureCheck: DoctorCheck = {
  name: "workflow-structure",
  category: "repo",
  required: false,

  async check(ctx: DoctorContext) {
    const missing: string[] = [];

    for (const dir of REQUIRED_DIRS) {
      const fullPath = path.join(ctx.cwd, "specrunner", "requests", dir);
      if (!ctx.fs.existsSync(fullPath)) {
        missing.push(dir);
      }
    }

    if (missing.length === 0) {
      return {
        status: "pass",
        message: "specrunner/requests/ structure is complete",
      };
    }

    return {
      status: "warn",
      message: `specrunner/requests/ is missing dirs: ${missing.join(", ")}`,
      hint: "Create the missing directories manually.",
    };
  },
};
