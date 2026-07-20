/**
 * Check that the machine-local sidecar state directory is writable.
 * Target: <cwd>/.specrunner/local/
 *
 * Design:
 *  - dir exists + writable → pass
 *  - dir exists + not writable → fail
 *  - dir absent + first existing ancestor writable → warn
 *  - dir absent + first existing ancestor not writable → fail
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const localStateWritableCheck: DoctorCheck = {
  name: "local-state-writable",
  category: "storage",
  required: true,

  async check(ctx: DoctorContext) {
    // Use repoRoot when available so checks are equivalent from any subdirectory.
    const localDir = path.join(ctx.repoRoot ?? ctx.cwd, ".specrunner", "local");
    const W_OK = ctx.fs.constants.W_OK;

    try {
      await ctx.fs.access(localDir, W_OK);
      return {
        status: "pass",
        message: `Local state directory is writable: ${localDir}`,
      };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        // Dir doesn't exist — walk up to first existing ancestor and check W_OK
        let ancestor = path.dirname(localDir);
        while (ancestor !== path.dirname(ancestor)) {
          try {
            await ctx.fs.access(ancestor, W_OK);
            return {
              status: "warn",
              message: `Local state directory does not exist yet: ${localDir}`,
              hint: "The local state directory will be created automatically on the first run.",
            };
          } catch (ancestorErr: unknown) {
            const ancestorCode = (ancestorErr as NodeJS.ErrnoException).code;
            if (ancestorCode === "ENOENT") {
              ancestor = path.dirname(ancestor);
              continue;
            }
            return {
              status: "fail",
              message: `Local state directory is absent and parent directory is not writable: ${ancestor}`,
              hint: "Parent directory is not writable. Check permissions.",
            };
          }
        }
        return {
          status: "fail",
          message: `Local state directory is absent and parent directory is not writable: ${ancestor}`,
          hint: "Parent directory is not writable. Check permissions.",
        };
      }

      return {
        status: "fail",
        message: `Local state directory is not writable: ${localDir}`,
        hint: `Check permissions on ${localDir}`,
      };
    }
  },
};
