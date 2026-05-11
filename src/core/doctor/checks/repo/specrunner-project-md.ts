/**
 * TC-029, TC-030
 * Check that specrunner/project.md exists in cwd.
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const specrunnerProjectMdCheck: DoctorCheck = {
  name: "specrunner-project-md",
  category: "repo",
  required: false,

  async check(ctx: DoctorContext) {
    const projectMdPath = path.join(ctx.cwd, "specrunner", "project.md");
    const exists = ctx.fs.existsSync(projectMdPath);

    if (exists) {
      return {
        status: "pass",
        message: "specrunner/project.md exists",
      };
    }

    return {
      status: "warn",
      message: `specrunner/project.md not found in ${ctx.cwd}`,
      hint: "specrunner/project.md is optional but recommended. It provides project-level context to the pipeline agents.",
    };
  },
};
