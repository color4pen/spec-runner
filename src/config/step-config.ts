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
import type { SourceAwareConfigLoadResult } from "./store.js";

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

export type TraceField = "model" | "maxTurns" | "timeoutMs";
export type TraceConfigLevel =
  | "step.byRequestType"
  | "step"
  | "defaults.byRequestType"
  | "defaults";
export type TraceSourceLevel = TraceConfigLevel | "stepdef" | "sdk";
export type TraceSourceLayer = "project" | "user" | "stepdef" | "sdk";

export interface TracedStepConfigSource {
  layer: TraceSourceLayer;
  level: TraceSourceLevel;
  path: string | null;
  configPath?: string;
}

export interface TracedStepConfigField<T> {
  value: T;
  source: TracedStepConfigSource;
}

export interface TracedStepExecutionConfig {
  step: string;
  requestType: string | null;
  fields: {
    model: TracedStepConfigField<string>;
    maxTurns: TracedStepConfigField<number | null>;
    timeoutMs: TracedStepConfigField<number | null>;
  };
}

interface TraceLayerInputs {
  userGlobal?: { migrated: unknown | null; path: string };
  projectLocal?: { migrated: unknown | null; path: string };
}

interface Candidate<T> {
  value: T | undefined;
  level: TraceConfigLevel;
  path: string;
}

export function traceStepExecutionConfig(
  config: SpecRunnerConfig,
  stepName: string,
  stepDefaults: StepDefaults,
  requestType?: string,
  layers: TraceLayerInputs = {},
): TracedStepExecutionConfig {
  return {
    step: stepName,
    requestType: requestType ?? null,
    fields: {
      model: traceField(
        buildConfigCandidates(config, stepName, "model", requestType),
        stepDefaults.model,
        layers,
      ) as TracedStepConfigField<string>,
      maxTurns: traceField(
        buildConfigCandidates(config, stepName, "maxTurns", requestType),
        stepDefaults.maxTurns,
        layers,
      ) as TracedStepConfigField<number | null>,
      timeoutMs: traceField(
        buildConfigCandidates(config, stepName, "timeoutMs", requestType),
        stepDefaults.timeoutMs,
        layers,
      ) as TracedStepConfigField<number | null>,
    },
  };
}

export function traceStepExecutionConfigFromLoadResult(
  loadResult: SourceAwareConfigLoadResult,
  stepName: string,
  stepDefaults: StepDefaults,
  requestType?: string,
): TracedStepExecutionConfig {
  return traceStepExecutionConfig(loadResult.config, stepName, stepDefaults, requestType, {
    userGlobal: { migrated: loadResult.userGlobal.migrated, path: loadResult.userGlobal.path },
    projectLocal: { migrated: loadResult.projectLocal.migrated, path: loadResult.projectLocal.path },
  });
}

function buildConfigCandidates(
  config: SpecRunnerConfig,
  stepName: string,
  field: TraceField,
  requestType?: string,
): Candidate<string | number | null>[] {
  const candidates: Candidate<string | number | null>[] = [];
  const stepLevel = config.steps?.[stepName];
  const defaultsLevel = config.steps?.defaults;

  if (requestType) {
    candidates.push({
      value: stepLevel?.byRequestType?.[requestType]?.[field],
      level: "step.byRequestType",
      path: `steps.${stepName}.byRequestType.${requestType}.${field}`,
    });
  }
  candidates.push({
    value: stepLevel?.[field],
    level: "step",
    path: `steps.${stepName}.${field}`,
  });
  if (requestType) {
    candidates.push({
      value: defaultsLevel?.byRequestType?.[requestType]?.[field],
      level: "defaults.byRequestType",
      path: `steps.defaults.byRequestType.${requestType}.${field}`,
    });
  }
  candidates.push({
    value: defaultsLevel?.[field],
    level: "defaults",
    path: `steps.defaults.${field}`,
  });
  return candidates;
}

function traceField<T extends string | number | null>(
  candidates: Candidate<T>[],
  stepDefault: T | undefined,
  layers: TraceLayerInputs,
): TracedStepConfigField<T | null> {
  for (const candidate of candidates) {
    if (candidate.value !== undefined) {
      return {
        value: candidate.value,
        source: resolveConfigCandidateSource(candidate.level, candidate.path, layers),
      };
    }
  }
  if (stepDefault !== undefined) {
    return {
      value: stepDefault,
      source: { layer: "stepdef", level: "stepdef", path: null },
    };
  }
  return {
    value: null,
    source: { layer: "sdk", level: "sdk", path: null },
  };
}

function resolveConfigCandidateSource(
  level: TraceConfigLevel,
  dottedPath: string,
  layers: TraceLayerInputs,
): TracedStepConfigSource {
  if (hasDottedPath(layers.projectLocal?.migrated, dottedPath)) {
    return {
      layer: "project",
      level,
      path: dottedPath,
      configPath: layers.projectLocal?.path,
    };
  }
  if (hasDottedPath(layers.userGlobal?.migrated, dottedPath)) {
    return {
      layer: "user",
      level,
      path: dottedPath,
      configPath: layers.userGlobal?.path,
    };
  }
  return { layer: "user", level, path: dottedPath, configPath: layers.userGlobal?.path };
}

function hasDottedPath(root: unknown, dottedPath: string): boolean {
  if (typeof root !== "object" || root === null) return false;
  let current: unknown = root;
  for (const part of dottedPath.split(".")) {
    if (typeof current !== "object" || current === null) return false;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
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
