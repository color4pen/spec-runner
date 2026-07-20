/**
 * Check that the detected package manager is installed and available.
 * Detection uses the same lockfile-based logic as worktree install and verification.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { detectPackageManager } from "../../../../util/detect-pm.js";

const installHints: Record<string, string> = {
  bun: "Install bun: https://bun.sh/docs/installation",
  pnpm: "Install pnpm: https://pnpm.io/installation",
  yarn: "Install yarn: https://yarnpkg.com/getting-started/install",
  npm: "npm comes with Node.js: https://nodejs.org",
};

export const packageManagerCheck: DoctorCheck = {
  name: "package-manager",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    // Use repoRoot when available so checks are equivalent from any subdirectory.
    const { pm } = await detectPackageManager(ctx.repoRoot ?? ctx.cwd, ctx.fs);
    try {
      const result = await ctx.execFile(pm, ["--version"], { signal: AbortSignal.timeout(5000) });
      const version = result.stdout.trim();
      return {
        status: "pass",
        message: `${pm} ${version}`,
      };
    } catch {
      return {
        status: "fail",
        message: `${pm} is not installed or not in PATH`,
        hint: installHints[pm] ?? `Install ${pm}`,
      };
    }
  },
};
