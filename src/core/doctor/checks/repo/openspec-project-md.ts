/**
 * TC-029, TC-030
 * Check that openspec/project.md exists in cwd.
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const openspecProjectMdCheck: DoctorCheck = {
  name: "openspec-project-md",
  category: "repo",
  required: true,

  async check(ctx: DoctorContext) {
    const projectMdPath = path.join(ctx.cwd, "openspec", "project.md");
    const exists = ctx.fs.existsSync(projectMdPath);

    if (exists) {
      return {
        status: "pass",
        message: "openspec/project.md exists",
      };
    }

    return {
      status: "fail",
      message: `openspec/project.md not found in ${ctx.cwd}`,
      hint: "Run 'openspec init' in the project root to initialize openspec.",
    };
  },
};
