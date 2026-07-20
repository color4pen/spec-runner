/**
 * TC-033, TC-034
 * Check that all 7 required agents are registered in config.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { STEP_NAMES } from "../../../step/step-names.js";

export const REQUIRED_AGENTS = [
  STEP_NAMES.DESIGN,
  STEP_NAMES.SPEC_REVIEW,
  STEP_NAMES.SPEC_FIXER,
  STEP_NAMES.IMPLEMENTER,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_REVIEW,
  STEP_NAMES.CODE_FIXER,
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
      hint: "Run specrunner runtime setup to register all agents.",
    };
  },
};
