/**
 * Deep merge utility for SpecRunnerConfig.
 *
 * Used by loadConfig() to combine user global config with project local overlay.
 * Merge rules:
 *   - object values: recursively merged (neither is replaced wholesale)
 *   - primitive values: overlay wins over base
 *   - undefined in overlay: base value is kept (overlay "absent" = no change)
 *   - null in overlay: overwrites base value (explicit null = "reset to null")
 *   - arrays: overlay replaces base (no array merging)
 */
import type { SpecRunnerConfig } from "./schema.js";

/**
 * Deep merge a project local config overlay on top of a user global base config.
 *
 * @param base    User global config (must be a fully valid SpecRunnerConfig)
 * @param overlay Project local config (may be partial — missing keys are inherited from base)
 * @returns       Merged config. Type-cast to SpecRunnerConfig; caller must validate.
 */
export function deepMergeConfig(
  base: SpecRunnerConfig,
  overlay: Partial<SpecRunnerConfig>,
): SpecRunnerConfig {
  return deepMergeObjects(
    base as unknown as Record<string, unknown>,
    overlay as unknown as Record<string, unknown>,
  ) as unknown as SpecRunnerConfig;
}

/**
 * Recursively merge two plain objects.
 * - object: recurse
 * - array: overlay replaces base
 * - null: overlay wins (explicit reset)
 * - undefined: skip (base wins)
 * - primitive: overlay wins
 */
function deepMergeObjects(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, overlayVal] of Object.entries(overlay)) {
    if (overlayVal === undefined) {
      // undefined in overlay → keep base value unchanged
      continue;
    }
    if (overlayVal === null) {
      // null in overlay → explicit null (overwrites base)
      result[key] = null;
      continue;
    }
    const baseVal = result[key];
    if (
      typeof overlayVal === "object" &&
      !Array.isArray(overlayVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      // Both sides are plain objects → recurse
      result[key] = deepMergeObjects(
        baseVal as Record<string, unknown>,
        overlayVal as Record<string, unknown>,
      );
    } else {
      // Primitive, array, or base is not an object → overlay wins
      result[key] = overlayVal;
    }
  }
  return result;
}
