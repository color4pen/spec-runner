/**
 * TC-033, TC-034
 * Check that all 7 required agents are registered in config.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const REQUIRED_AGENTS = [
  "propose",
  "spec-review",
  "spec-fixer",
  "implementer",
  "build-fixer",
  "code-review",
  "code-fixer",
] as const;

export const agentsRegisteredCheck: DoctorCheck = {
  name: "agents-registered",
  category: "agents",
  required: true,

  async check(ctx: DoctorContext) {
    const missing: string[] = [];

    for (const role of REQUIRED_AGENTS) {
      const agentId = ctx.config.get(`agents.${role}.agentId`);
      if (typeof agentId !== "string" || agentId.length === 0) {
        missing.push(role);
      }
    }

    if (missing.length === 0) {
      return {
        status: "pass",
        message: `All ${REQUIRED_AGENTS.length} agents are registered`,
      };
    }

    return {
      status: "fail",
      message: `Missing agents: ${missing.join(", ")}`,
      hint: "Run 'specrunner init' to register all agents.",
    };
  },
};
