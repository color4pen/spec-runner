/**
 * Detect legacy .specrunner/jobs/ directory and prompt manual removal.
 *
 * Design:
 *  - .specrunner/jobs/ present → warn (message: legacy dir detected, hint: rm -rf)
 *  - .specrunner/jobs/ absent → pass
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const legacyJobsDirCheck: DoctorCheck = {
  name: "legacy-jobs-dir",
  category: "storage",
  required: false,

  async check(ctx: DoctorContext) {
    const jobsDir = path.join(ctx.cwd, ".specrunner", "jobs");

    if (ctx.fs.existsSync(jobsDir)) {
      return {
        status: "warn",
        message: `Legacy job state directory detected: ${jobsDir}`,
        hint: `This directory is no longer used. Remove it with: rm -rf ${jobsDir}`,
      };
    }

    return {
      status: "pass",
      message: "No legacy job state directory found",
    };
  },
};
