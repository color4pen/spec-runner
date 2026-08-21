/**
 * Doctor check: effective model existence.
 *
 * Validates that all effective Anthropic model IDs in the base standard pipeline
 * exist in the SDK's current supported-models list. Uses the same collectEffectiveModels /
 * checkModelExistence logic as the preflight assertion (no duplicate logic).
 *
 * Status mapping:
 * - probe absent / unavailable → warn (skip — not a hard failure in doctor context)
 * - listed + unknown models    → fail (details include step name / config path)
 * - listed + all known         → pass
 *
 * required: false (model staleness is not a hard doctor requirement — users may be offline).
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { mergeModelRegistry } from "../../../../config/model-registry.js";
import { STANDARD_DESCRIPTOR } from "../../../pipeline/registry.js";
import { collectEffectiveModels } from "../../../model-validation/collect-effective-models.js";
import { checkModelExistence } from "../../../model-validation/check-model-existence.js";
import type { SpecRunnerConfig } from "../../../../config/schema.js";

/** Fallback SpecRunnerConfig when ctx.rawConfig is absent (config failed to load). */
const MINIMAL_CONFIG: SpecRunnerConfig = { version: 1, agents: {} };

export const modelExistenceCheck: DoctorCheck = {
  name: "config/model-existence",
  category: "config",
  required: false,

  async check(ctx: DoctorContext) {
    const probe = ctx.supportedModelsProbe;

    // No probe injected → skip (warn) — probe is only injected for local runtime.
    if (!probe) {
      return {
        status: "warn",
        message: "Model existence check skipped (probe not available for this runtime)",
        hint: "This check is only active for local runtime. Ensure the Claude Code SDK is installed.",
      };
    }

    // Use the loaded config (or MINIMAL_CONFIG fallback) to honour step-level model overrides.
    // Use mergeModelRegistry so that user-defined model entries are included alongside built-ins.
    const rawConfig = ctx.rawConfig ?? MINIMAL_CONFIG;
    const merged = mergeModelRegistry(rawConfig);

    // Collect effective models from the base standard descriptor (no custom reviewers — doctor
    // cannot know which reviewers the current job would inject).
    const refs = collectEffectiveModels(STANDARD_DESCRIPTOR, rawConfig, undefined, merged);

    // Run the probe.
    const result = await probe(ctx.env);
    const outcome = checkModelExistence(refs, result);

    if (outcome.kind === "skipped") {
      return {
        status: "warn",
        message: `Model existence check skipped: ${outcome.reason}`,
        hint: "Check network connectivity and Claude Code authentication.",
      };
    }

    if (outcome.kind === "invalid") {
      const details = outcome.unknown.map((ref) => {
        const pathNote = ref.configPath ? ` (${ref.configPath})` : "";
        return `step "${ref.stepName}"${pathNote}: "${ref.model}" is not in the supported list`;
      });
      return {
        status: "fail",
        message: `${outcome.unknown.length} Anthropic model(s) not found in the supported list`,
        hint: "Update the model name(s) in your config to currently supported Anthropic model IDs.",
        details,
      };
    }

    return {
      status: "pass",
      message: "All effective Anthropic model IDs are in the supported list",
    };
  },
};
