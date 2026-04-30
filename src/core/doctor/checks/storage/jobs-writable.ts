/**
 * TC-039, TC-040, TC-041, TC-042
 * Check that the jobs directory is writable.
 * Design D8:
 *  - dir exists + writable → pass
 *  - dir exists + not writable → fail
 *  - dir absent + first existing ancestor writable → warn
 *  - dir absent + first existing ancestor not writable → fail
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const jobsWritableCheck: DoctorCheck = {
  name: "jobs-writable",
  category: "storage",
  required: true,

  async check(ctx: DoctorContext) {
    const jobsDir = path.join(ctx.homeDir, ".local", "share", "specrunner", "jobs");
    const W_OK = ctx.fs.constants.W_OK;

    // Check if jobs dir is accessible (exists and writable)
    try {
      await ctx.fs.access(jobsDir, W_OK);
      // Access succeeded → dir exists and is writable
      return {
        status: "pass",
        message: `Jobs directory is writable: ${jobsDir}`,
      };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        // Dir doesn't exist — walk up to first existing ancestor and check W_OK
        let ancestor = path.dirname(jobsDir);
        while (ancestor !== path.dirname(ancestor)) {
          try {
            await ctx.fs.access(ancestor, W_OK);
            // Ancestor exists and is writable
            return {
              status: "warn",
              message: `Jobs directory does not exist yet: ${jobsDir}`,
              hint: "Run 'specrunner ps' once to initialize storage.",
            };
          } catch (ancestorErr: unknown) {
            const ancestorCode = (ancestorErr as NodeJS.ErrnoException).code;
            if (ancestorCode === "ENOENT") {
              // Keep walking up
              ancestor = path.dirname(ancestor);
              continue;
            }
            // EACCES or other: ancestor exists but not writable
            return {
              status: "fail",
              message: `Jobs directory is absent and parent directory is not writable: ${ancestor}`,
              hint: "Parent directory is not writable. Check permissions.",
            };
          }
        }
        // Reached filesystem root without finding a writable ancestor — treat as fail
        return {
          status: "fail",
          message: `Jobs directory is absent and parent directory is not writable: ${ancestor}`,
          hint: "Parent directory is not writable. Check permissions.",
        };
      }

      // EACCES or other permission error on jobs dir itself
      return {
        status: "fail",
        message: `Jobs directory is not writable: ${jobsDir}`,
        hint: `Check permissions on ${jobsDir}`,
      };
    }
  },
};
