import type { StepName } from "../../state/schema.js";
export * from "../../kernel/step-names.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../../kernel/step-names.js";

const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);

/**
 * Validated cast from string to StepName.
 * Throws if the name is not a registered step name.
 */
export function toStepName(name: string): StepName {
  if (!ALL_STEP_NAMES_SET.has(name)) {
    throw new Error(
      `Unknown step name: "${name}". Registered steps: ${[...ALL_STEP_NAMES_SET].join(", ")}.`,
    );
  }
  return name as StepName;
}
