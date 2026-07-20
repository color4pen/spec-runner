/**
 * TC-025, TC-026
 * Check that cwd is inside a git repository.
 * Uses `git rev-parse --is-inside-work-tree` to detect nested repos correctly.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const gitRepositoryCheck: DoctorCheck = {
  name: "git-repository",
  category: "repo",
  required: true,

  async check(ctx: DoctorContext) {
    try {
      await ctx.execFile("git", ["rev-parse", "--is-inside-work-tree"], { signal: AbortSignal.timeout(5000) });
      return {
        status: "pass",
        message: "Current directory is a git repository",
      };
    } catch {
      return {
        status: "fail",
        // Display the invoker cwd in the fail message (where doctor was run from)
        message: `Not a git repository: ${ctx.repoRoot ?? ctx.cwd}`,
        hint: "Run 'git init' or navigate to a git repository.",
      };
    }
  },
};
