/**
 * TC-031, TC-032
 * Check that openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/ all exist.
 * Missing dirs = warn (not fail).
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

const REQUIRED_DIRS = ["active", "awaiting-merge", "merged", "canceled"] as const;

export const workflowStructureCheck: DoctorCheck = {
  name: "workflow-structure",
  category: "repo",
  required: false,

  async check(ctx: DoctorContext) {
    const missing: string[] = [];

    for (const dir of REQUIRED_DIRS) {
      const fullPath = path.join(ctx.cwd, "openspec-workflow", "requests", dir);
      if (!ctx.fs.existsSync(fullPath)) {
        missing.push(dir);
      }
    }

    if (missing.length === 0) {
      return {
        status: "pass",
        message: "openspec-workflow/requests/ structure is complete",
      };
    }

    return {
      status: "warn",
      message: `openspec-workflow/requests/ is missing dirs: ${missing.join(", ")}`,
      hint: "Run 'openspec init' or create the missing directories manually.",
    };
  },
};
