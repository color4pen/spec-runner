/**
 * Step execution config resolution.
 *
 * Implements the 4-level resolution chain defined in design.md D2:
 * 1. config.steps[stepName][field]    — step-level config
 * 2. config.steps.defaults[field]     — config-level defaults
 * 3. stepDefaults[field]              — hardcoded step definition values (caller-provided)
 * 4. SDK default (maxTurns undefined = unlimited, timeoutMs = null)
 *
 * null is a valid value meaning "unlimited" / "no timeout" — it does NOT fall back to the
 * next level. Only undefined (field absent) causes fallback to the next priority.
 *
 * TC-001 through TC-012 are covered by tests/config/step-config.test.ts
 */
import type { SpecRunnerConfig } from "./schema.js";

/**
 * Resolved execution config for a single step.
 * All fields are fully resolved — no undefined values.
 *
 * D2 (design.md): model is always present (step definition is the guaranteed fallback).
 * maxTurns: null = unlimited (SDK receives no maxTurns parameter)
 * timeoutMs: null = no timeout (not passed to SDK — SDK has no timeout parameter)
 */
export interface ResolvedStepConfig {
  model: string;
  maxTurns: number | null;
  timeoutMs: number | null;
}

/**
 * Hardcoded defaults from the step definition.
 * These are the last resort before SDK defaults.
 */
export interface StepDefaults {
  model: string;
  maxTurns?: number;
  timeoutMs?: number;
}

/**
 * Resolve the execution config for a given step.
 *
 * Resolution order per field (first defined value wins; null is a defined value):
 *   1. config.steps[stepName][field]
 *   2. config.steps.defaults[field]
 *   3. stepDefaults[field]
 *   4. SDK default: maxTurns → null (unlimited), timeoutMs → null
 *
 * @param config       Full SpecRunnerConfig
 * @param stepName     Step name (kebab-case: "implementer", "spec-review", etc.)
 * @param stepDefaults Hardcoded defaults from step definition — caller-provided
 */
export function getStepExecutionConfig(
  config: SpecRunnerConfig,
  stepName: string,
  stepDefaults: StepDefaults,
): ResolvedStepConfig {
  const stepLevel = config.steps?.[stepName];
  const defaultsLevel = config.steps?.defaults;

  // Resolve model: step-level > defaults > stepDefaults (always a string — no null semantics)
  const model =
    (stepLevel?.model !== undefined ? stepLevel.model : undefined) ??
    (defaultsLevel?.model !== undefined ? defaultsLevel.model : undefined) ??
    stepDefaults.model;

  // Resolve maxTurns: step-level > defaults > stepDefaults > null (unlimited)
  // null is a valid value that stops fallback.
  const maxTurns = resolveNullableNumber(
    stepLevel?.maxTurns,
    defaultsLevel?.maxTurns,
    stepDefaults.maxTurns ?? null,
  );

  // Resolve timeoutMs: step-level > defaults > stepDefaults > null (no timeout)
  const timeoutMs = resolveNullableNumber(
    stepLevel?.timeoutMs,
    defaultsLevel?.timeoutMs,
    stepDefaults.timeoutMs ?? null,
  );

  return { model, maxTurns, timeoutMs };
}

/**
 * Resolve a nullable number field through multiple priority levels.
 * null is a valid "stop fallback" value (unlimited / no timeout).
 * undefined means "not set at this level, try next".
 */
function resolveNullableNumber(
  stepLevel: number | null | undefined,
  defaultsLevel: number | null | undefined,
  fallback: number | null,
): number | null {
  if (stepLevel !== undefined) return stepLevel;
  if (defaultsLevel !== undefined) return defaultsLevel;
  return fallback;
}
