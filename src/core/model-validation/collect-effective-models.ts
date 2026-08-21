/**
 * Collect effective (resolved) model references from a composed pipeline descriptor.
 *
 * Pure module (no I/O). Walks all AgentStep entries in the descriptor and resolves
 * their effective model via the 6-level config resolution chain. This ensures that
 * custom reviewer snapshot models, regression-gate models, and byRequestType overrides
 * are all captured — no static file-constant enumeration.
 *
 * Design:
 * - `configPath`: the dotted key path (e.g. "steps.design.model") used in error messages.
 *   Sourced from traceStepExecutionConfig().fields.model.source.path — null when the
 *   model comes from the step definition fallback (no config path).
 * - `provider`: resolved from merged registry; undefined when the model is not registered
 *   (registry-unknown models are not subject to live validation).
 */
import type { PipelineDescriptor } from "../pipeline/types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { ModelsConfig } from "../../config/model-registry.js";
import { getStepExecutionConfig, traceStepExecutionConfig } from "../../config/step-config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single resolved model reference from a composed pipeline AgentStep.
 *
 * configPath: dotted key path (e.g. "steps.design.model") for error messages.
 *   null = model resolved from step definition (no config-file key to report).
 *
 * NOTE: Do NOT confuse with TracedStepConfigSource.configPath which is the
 * absolute filesystem path to the config file. This field uses source.path.
 */
export interface EffectiveModelRef {
  /** Step name (e.g. "design", "my-reviewer", "regression-gate"). */
  stepName: string;
  /** Resolved model ID (e.g. "claude-sonnet-5", "sonnet"). */
  model: string;
  /** Provider from the merged registry; undefined when model is not registered. */
  provider: "anthropic" | "openai" | undefined;
  /** Dotted config key path (e.g. "steps.design.model"), or null for step-def fallback. */
  configPath: string | null;
}

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

/**
 * Collect effective model references from all AgentStep entries in the descriptor.
 *
 * Each AgentStep's model is resolved through the full 6-level config resolution chain:
 *   1. config.steps[stepName].byRequestType[requestType].model
 *   2. config.steps[stepName].model
 *   3. config.steps.defaults.byRequestType[requestType].model
 *   4. config.steps.defaults.model
 *   5. step.agent.model (step definition default)
 *   6. SDK default (not applicable for model field)
 *
 * CliStep entries (kind !== "agent") are excluded.
 *
 * @param descriptor   Composed pipeline descriptor (including custom reviewers / regression-gate).
 * @param config       Full SpecRunnerConfig (used by the resolution chain).
 * @param requestType  Current request type (enables byRequestType levels 1 & 3).
 * @param merged       Merged model registry (used to resolve provider).
 */
export function collectEffectiveModels(
  descriptor: PipelineDescriptor,
  config: SpecRunnerConfig,
  requestType: string | undefined,
  merged: ModelsConfig,
): EffectiveModelRef[] {
  const refs: EffectiveModelRef[] = [];

  for (const [stepName, step] of descriptor.steps) {
    if (step.kind !== "agent") continue;

    // Step defaults use the agent definition's model as the hardcoded fallback (level 5).
    const stepDefaults = { model: step.agent.model };

    // Resolve the effective model via the 6-level config chain.
    const model = getStepExecutionConfig(config, stepName, stepDefaults, requestType).model;

    // Trace to find the config key path (dotted path, or null for step-def fallback).
    const traced = traceStepExecutionConfig(config, stepName, stepDefaults, requestType);
    // source.path is the dotted key (e.g. "steps.design.model") — null for stepdef/sdk layers.
    const configPath: string | null = traced.fields.model.source.path ?? null;

    // Resolve provider from the merged registry (undefined = unregistered model).
    const provider = merged[model]?.provider as "anthropic" | "openai" | undefined;

    refs.push({ stepName, model, provider, configPath });
  }

  return refs;
}
