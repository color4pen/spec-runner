/**
 * Port types for SDK model listing.
 *
 * Pure port layer: no imports from adapter/ or core/runtime/ (no back-edges).
 * Consumed by RuntimeStrategy (optional listSupportedModels), collector, checker, and adapter probe.
 */

// ---------------------------------------------------------------------------
// SupportedModelsResult
// ---------------------------------------------------------------------------

/**
 * Discriminated union returned by a SupportedModelsProbe.
 *
 * - `{ kind: "listed"; models: string[] }` — listing succeeded; models contains ModelInfo.value entries.
 * - `{ kind: "unavailable"; reason: string }` — listing could not be completed (offline / auth
 *   unset / SDK unavailable / timeout). The job should continue with a warning.
 */
export type SupportedModelsResult =
  | { kind: "listed"; models: string[] }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// SupportedModelsProbe
// ---------------------------------------------------------------------------

/**
 * Injectable seam for retrieving the list of supported Anthropic models.
 *
 * Receives the sanitized process environment (secrets stripped by the caller).
 * The adapter implementation enriches the env with a resolved OAuth token and
 * calls sdk.query().supportedModels() in streaming input mode.
 *
 * Contract:
 * - Never throws — all errors are captured and returned as { kind: "unavailable", reason }.
 * - On success, returns { kind: "listed", models } where models is the ModelInfo.value array.
 * - Test fakes return a predetermined result without any real network call.
 */
export type SupportedModelsProbe = (
  env: Record<string, string | undefined>,
) => Promise<SupportedModelsResult>;
