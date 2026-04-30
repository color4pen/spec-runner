/**
 * TC-059, TC-060
 * Check old state file count. 100+ = gc recommended warn.
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

const GC_THRESHOLD = 100;

export const oldStateFilesCheck: DoctorCheck = {
  name: "old-state-files",
  category: "storage",
  required: false,

  async check(ctx: DoctorContext) {
    const jobsDir = path.join(ctx.homeDir, ".local", "share", "specrunner", "jobs");

    let files: string[];
    try {
      files = ctx.fs.readdirSync(jobsDir).filter((f) => f.endsWith(".json"));
    } catch {
      // Jobs dir doesn't exist — nothing to count
      return {
        status: "pass",
        message: "Jobs directory does not exist (no files to count)",
      };
    }

    const count = files.length;

    if (count > GC_THRESHOLD) {
      return {
        status: "warn",
        message: `${count} job state files found (more than ${GC_THRESHOLD})`,
        hint: `Manually remove old .json files in ${jobsDir}`,
        details: [`Total .json files: ${count}`],
      };
    }

    return {
      status: "pass",
      message: `${count} job state files found (within limit)`,
    };
  },
};
