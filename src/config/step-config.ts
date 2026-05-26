/**
 * Step execution config resolution.
 *
 * Implements the 6-level resolution chain (extended from design.md D2):
 * 1. config.steps[stepName].byRequestType[requestType][field]  — type-aware step level (highest priority)
 * 2. config.steps[stepName][field]                             — step-level config
 * 3. config.steps.defaults.byRequestType[requestType][field]   — type-aware defaults
 * 4. config.steps.defaults[field]                              — config-level defaults
 * 5. stepDefaults[field]                                       — hardcoded step definition values
 * 6. SDK default (maxTurns undefined = unlimited, timeoutMs = null)
 *
 * null is a valid value meaning "unlimited" / "no timeout" — it does NOT fall back to the
 * next level. Only undefined (field absent) causes fallback to the next priority.
 *
 * When requestType is undefined, levels 1 and 3 are skipped (same as 4-level chain).
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
 *   1. config.steps[stepName].byRequestType[requestType][field]  (skipped when requestType undefined)
 *   2. config.steps[stepName][field]
 *   3. config.steps.defaults.byRequestType[requestType][field]   (skipped when requestType undefined)
 *   4. config.steps.defaults[field]
 *   5. stepDefaults[field]
 *   6. SDK default: maxTurns → null (unlimited), timeoutMs → null
 *
 * @param config       Full SpecRunnerConfig
 * @param stepName     Step name (kebab-case: "implementer", "spec-review", etc.)
 * @param stepDefaults Hardcoded defaults from step definition — caller-provided
 * @param requestType  Request type (e.g. "bug-fix", "spec-change") — enables levels 1 & 3
 */
export function getStepExecutionConfig(
  config: SpecRunnerConfig,
  stepName: string,
  stepDefaults: StepDefaults,
  requestType?: string,
): ResolvedStepConfig {
  const stepLevel = config.steps?.[stepName];
  const defaultsLevel = config.steps?.defaults;

  // Level 1: type-aware step level (skipped when requestType undefined)
  const stepByType = requestType ? stepLevel?.byRequestType?.[requestType] : undefined;
  // Level 3: type-aware defaults level (skipped when requestType undefined)
  const defaultsByType = requestType ? defaultsLevel?.byRequestType?.[requestType] : undefined;

  // Resolve model: levels 1 → 2 → 3 → 4 → 5
  // null is not a valid value for model (no "unlimited" semantics), so we only check undefined.
  const model =
    (stepByType?.model !== undefined ? stepByType.model : undefined) ??
    (stepLevel?.model !== undefined ? stepLevel.model : undefined) ??
    (defaultsByType?.model !== undefined ? defaultsByType.model : undefined) ??
    (defaultsLevel?.model !== undefined ? defaultsLevel.model : undefined) ??
    stepDefaults.model;

  // Resolve maxTurns: levels 1 → 2 → 3 → 4 → 5 → null (unlimited)
  // null is a valid value that stops fallback.
  const maxTurns = resolveNullableNumber(
    stepByType !== undefined ? stepByType.maxTurns : undefined,
    stepLevel?.maxTurns,
    defaultsByType !== undefined ? defaultsByType.maxTurns : undefined,
    defaultsLevel?.maxTurns,
    stepDefaults.maxTurns ?? null,
  );

  // Resolve timeoutMs: levels 1 → 2 → 3 → 4 → 5 → null (no timeout)
  const timeoutMs = resolveNullableNumber(
    stepByType !== undefined ? stepByType.timeoutMs : undefined,
    stepLevel?.timeoutMs,
    defaultsByType !== undefined ? defaultsByType.timeoutMs : undefined,
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
  level1: number | null | undefined,
  level2: number | null | undefined,
  level3: number | null | undefined,
  level4: number | null | undefined,
  fallback: number | null,
): number | null {
  if (level1 !== undefined) return level1;
  if (level2 !== undefined) return level2;
  if (level3 !== undefined) return level3;
  if (level4 !== undefined) return level4;
  return fallback;
}
