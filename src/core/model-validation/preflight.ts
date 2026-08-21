/**
 * Model existence preflight assertion.
 *
 * Validates that all effective Anthropic model IDs in the composed pipeline
 * exist in the SDK's current supported-models list. Called by PipelineRunCommand.prepare()
 * after composeReviewerDescriptor + validateDescriptorInputCompleteness, before
 * assertNoDuplicateLiveJob / bootstrapJob.
 *
 * Design:
 * - Only fires when runtime.listSupportedModels is present (LocalRuntime only).
 * - Only calls the probe when there are anthropic-provider refs to validate.
 * - Throws CONFIG_INVALID on unknown Anthropic models (step name + config path in message).
 * - Warns and continues on probe unavailability (offline / auth / SDK unavailable).
 */
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { PipelineDescriptor } from "../pipeline/types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { ModelsConfig } from "../../config/model-registry.js";
import { collectEffectiveModels } from "./collect-effective-models.js";
import { checkModelExistence } from "./check-model-existence.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

// ---------------------------------------------------------------------------
// assertEffectiveModelsExist
// ---------------------------------------------------------------------------

export interface AssertEffectiveModelsExistOpts {
  /** Runtime strategy — only LocalRuntime (with listSupportedModels) triggers validation. */
  runtime: RuntimeStrategy;
  /** Composed pipeline descriptor (custom reviewers + regression-gate included). */
  descriptor: PipelineDescriptor;
  /** Full SpecRunnerConfig for step-config resolution. */
  config: SpecRunnerConfig;
  /** Current request type (enables byRequestType resolution levels). */
  requestType: string | undefined;
  /** Process environment for the probe (secrets stripped inside the probe). */
  env: Record<string, string | undefined>;
  /** Merged model registry (builtin + user-defined models). */
  merged: ModelsConfig;
  /** Warning logger (called when probe is unavailable — job continues). */
  logWarn: (message: string) => void;
}

/**
 * Assert that all effective Anthropic model IDs in the pipeline exist in the SDK list.
 *
 * - runtime has no listSupportedModels → return immediately (managed skip).
 * - No anthropic refs → return immediately (no probe needed).
 * - Probe unavailable → log warning and return (job continues).
 * - Unknown Anthropic model → throw SpecRunnerError(CONFIG_INVALID) with step + path details.
 * - All models known → return normally.
 */
export async function assertEffectiveModelsExist(
  opts: AssertEffectiveModelsExistOpts,
): Promise<void> {
  const { runtime, descriptor, config, requestType, env, merged, logWarn } = opts;

  // Skip if runtime doesn't support model listing (e.g. managed runtime).
  if (!runtime.listSupportedModels) return;

  // Collect effective model references from all agent steps.
  const refs = collectEffectiveModels(descriptor, config, requestType, merged);

  // Skip probe if there are no anthropic-provider refs to validate (optimization).
  const hasAnthropicRefs = refs.some((r) => r.provider === "anthropic");
  if (!hasAnthropicRefs) return;

  // Run the probe.
  const result = await runtime.listSupportedModels(env);
  const outcome = checkModelExistence(refs, result);

  if (outcome.kind === "skipped") {
    logWarn(
      `[specrunner] warn: model existence check skipped (${outcome.reason}). ` +
      `Ensure the configured model IDs are valid before running.`,
    );
    return;
  }

  if (outcome.kind === "invalid") {
    const lines = outcome.unknown.map((ref) => {
      const pathNote = ref.configPath ? ` (config: ${ref.configPath})` : "";
      return `  step "${ref.stepName}"${pathNote}: model "${ref.model}" is not in the supported list`;
    });
    throw new SpecRunnerError(
      ERROR_CODES.CONFIG_INVALID,
      "Update the model name(s) in your config to currently supported Anthropic model IDs.",
      `Unknown Anthropic model(s) in pipeline configuration:\n${lines.join("\n")}`,
    );
  }

  // outcome.kind === "ok" — all models known, continue normally.
}
