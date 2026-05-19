import { DeltaSpecRuleRegistry } from "./registry.js";
import type { DeltaSpecRuleName } from "./types.js";
import { noLegacyFlatFile } from "./no-legacy-flat-file.js";
import { noLegacyFlatDir } from "./no-legacy-flat-dir.js";
import { canonicalSpecStructure } from "./canonical-spec-structure.js";

export { noSpecsForRequiredType } from "./no-specs-for-required-type.js";
export { DeltaSpecRuleRegistry };
export type { DeltaSpecRuleName } from "./types.js";

/**
 * Create a registry with all standard DSV rules (excluding no-specs-for-required-type,
 * which is run separately as an early-return check per D9).
 *
 * Note: `DeltaSpecRuleName` union constrains valid rule names for type safety.
 * It is NOT a 1:1 enumeration of rules registered here — `no-specs-for-required-type`
 * is a valid DeltaSpecRuleName but is intentionally excluded from this registry
 * because it runs as an early-return check (D9 design).
 */
export function createDeltaSpecRegistry(): DeltaSpecRuleRegistry<DeltaSpecRuleName> {
  const registry = new DeltaSpecRuleRegistry<DeltaSpecRuleName>();
  registry.register(noLegacyFlatFile);
  registry.register(noLegacyFlatDir);
  registry.register(canonicalSpecStructure);
  return registry;
}
