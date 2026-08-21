/**
 * Check whether effective Anthropic model references exist in the SDK's supported model list.
 *
 * Pure module (no I/O). Accepts the pre-collected EffectiveModelRef list and a
 * SupportedModelsResult (from the runtime probe) and computes whether any Anthropic
 * model IDs are unknown (not in the SDK list and not an alias).
 *
 * Scope rules:
 * - provider !== "anthropic"  → excluded (OpenAI / undefined models are never validated).
 * - ANTHROPIC_MODEL_ALIASES   → always valid (SDK resolves aliases; they never appear in list).
 * - Otherwise                 → must appear in result.models to be valid.
 */
import { ANTHROPIC_MODEL_ALIASES } from "../../config/model-registry.js";
import type { EffectiveModelRef } from "./collect-effective-models.js";
import type { SupportedModelsResult } from "../port/model-listing.js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * Outcome of the model existence check.
 *
 * - ok:      All applicable Anthropic models are in the supported list (or are aliases).
 * - skipped: The supported-models listing was unavailable (offline / auth unset / timeout).
 *            The job should continue with a warning.
 * - invalid: One or more Anthropic model IDs were not found in the supported list.
 *            The job must be halted with CONFIG_INVALID.
 */
export type ModelExistenceOutcome =
  | { kind: "ok" }
  | { kind: "skipped"; reason: string }
  | { kind: "invalid"; unknown: EffectiveModelRef[] };

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

/**
 * Check whether all Anthropic effective model refs exist in the supported models list.
 *
 * @param refs    Effective model references (from collectEffectiveModels).
 * @param result  Supported models listing result (from the runtime probe).
 * @returns ModelExistenceOutcome indicating ok / skipped / invalid.
 */
export function checkModelExistence(
  refs: EffectiveModelRef[],
  result: SupportedModelsResult,
): ModelExistenceOutcome {
  // Listing unavailable → always skip (offline / auth / timeout — not a config error).
  if (result.kind === "unavailable") {
    return { kind: "skipped", reason: result.reason };
  }

  // Narrow to anthropic models only (openai and undefined are not subject to live validation).
  const anthropicRefs = refs.filter((r) => r.provider === "anthropic");

  const supportedSet = new Set(result.models);
  const unknown: EffectiveModelRef[] = [];

  for (const ref of anthropicRefs) {
    // Aliases are always treated as valid — SDK resolves them at execution time.
    if (ANTHROPIC_MODEL_ALIASES.has(ref.model)) continue;
    // Full IDs must appear in the listing.
    if (!supportedSet.has(ref.model)) {
      unknown.push(ref);
    }
  }

  return unknown.length > 0
    ? { kind: "invalid", unknown }
    : { kind: "ok" };
}
