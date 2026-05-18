import { DeltaSpecRuleRegistry } from "./registry.js";
import { noLegacyFlatFile } from "./no-legacy-flat-file.js";
import { noLegacyFlatDir } from "./no-legacy-flat-dir.js";
import { canonicalSpecStructure } from "./canonical-spec-structure.js";

export { noSpecsForRequiredType } from "./no-specs-for-required-type.js";
export { DeltaSpecRuleRegistry };

/**
 * Create a registry with all standard DSV rules (excluding no-specs-for-required-type,
 * which is run separately as an early-return check per D9).
 */
export function createDeltaSpecRegistry(): DeltaSpecRuleRegistry {
  const registry = new DeltaSpecRuleRegistry();
  registry.register(noLegacyFlatFile);
  registry.register(noLegacyFlatDir);
  registry.register(canonicalSpecStructure);
  return registry;
}
