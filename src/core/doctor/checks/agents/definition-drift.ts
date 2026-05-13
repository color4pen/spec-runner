/**
 * TC-037, TC-038, TC-079
 * Check that agent definition hashes in config match current prompt hashes.
 * Reuses AgentRegistry.hashOf() and existing Step definitions.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { AgentRegistry } from "../../../agent/index.js";
import { DesignStep } from "../../../step/design.js";
import { SpecReviewStep } from "../../../step/spec-review.js";
import { SpecFixerStep } from "../../../step/spec-fixer.js";
import { ImplementerStep } from "../../../step/implementer.js";
import { BuildFixerStep } from "../../../step/build-fixer.js";
import { CodeReviewStep } from "../../../step/code-review.js";
import { CodeFixerStep } from "../../../step/code-fixer.js";

function buildRegistry(): AgentRegistry {
  return AgentRegistry.fromSteps([
    DesignStep,
    SpecReviewStep,
    SpecFixerStep,
    ImplementerStep,
    BuildFixerStep,
    CodeReviewStep,
    CodeFixerStep,
  ]);
}

const AGENT_ROLES = [
  "design",
  "spec-review",
  "spec-fixer",
  "implementer",
  "build-fixer",
  "code-review",
  "code-fixer",
] as const;

export const definitionDriftCheck: DoctorCheck = {
  name: "agent-definition-drift",
  category: "agents",
  required: false,

  async check(ctx: DoctorContext) {
    const registry = buildRegistry();
    const drifted: string[] = [];

    for (const role of AGENT_ROLES) {
      const storedHash = ctx.config.get(`agents.${role}.definitionHash`);
      if (typeof storedHash !== "string" || storedHash.length === 0) {
        // Not registered — skip drift check for this role (agents-registered catches missing)
        continue;
      }
      try {
        const currentHash = registry.hashOf(role);
        if (currentHash !== storedHash) {
          drifted.push(role);
        }
      } catch {
        // Role not in registry — skip
        continue;
      }
    }

    if (drifted.length === 0) {
      return {
        status: "pass",
        message: "All agent definitions match config hashes",
      };
    }

    return {
      status: "warn",
      message: `Agent definition drifted: ${drifted.join(", ")}`,
      hint: "Re-run 'specrunner init' to refresh agent definitions.",
    };
  },
};
