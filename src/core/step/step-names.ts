import type { StepName } from "../../state/schema.js";
export * from "../../kernel/step-names.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../../kernel/step-names.js";

const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);

/**
 * Cast a string to StepName (passthrough).
 * StepName is now string, so this function no longer throws.
 * Use isStandardStepName() for whitelist validation of standard pipeline step names.
 *
 * D3 (artifact-observability): toStepName is a passthrough — arbitrary step names
 * are accepted in read/record paths. Whitelist enforcement is via isStandardStepName().
 */
export function toStepName(name: string): StepName {
  return name as StepName;
}

/**
 * Check whether a step name is a standard pipeline step (in the whitelist).
 * Used by standard pipeline descriptor validation to enforce step name integrity.
 * Does NOT throw — returns boolean for caller-controlled error handling.
 */
export function isStandardStepName(name: string): boolean {
  return ALL_STEP_NAMES_SET.has(name);
}
