import { DeltaSpecRuleRegistry } from "./registry.js";
import type { DeltaSpecRuleName } from "./types.js";
import { noLegacyFlatFile } from "./no-legacy-flat-file.js";
import { noLegacyFlatDir } from "./no-legacy-flat-dir.js";
import { canonicalSpecStructure } from "./canonical-spec-structure.js";
import { removedSectionFormat } from "./removed-section-format.js";
import { renamedSectionFormat } from "./renamed-section-format.js";
import { requirementHeaderRequired } from "./requirement-header-required.js";
import { scenarioRequiredPerRequirement } from "./scenario-required-per-requirement.js";
import { normativeKeywordRequired } from "./normative-keyword-required.js";
import { baselineHeaderMatch } from "./baseline-header-match.js";
import { noAuthoritySpecDirectEdit } from "./no-authority-spec-direct-edit.js";

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
  // Existing 3 rules
  registry.register(noLegacyFlatFile);
  registry.register(noLegacyFlatDir);
  registry.register(canonicalSpecStructure);
  // New 6 rules
  registry.register(removedSectionFormat);
  registry.register(renamedSectionFormat);
  registry.register(requirementHeaderRequired);
  registry.register(scenarioRequiredPerRequirement);
  registry.register(normativeKeywordRequired);
  registry.register(baselineHeaderMatch);
  registry.register(noAuthoritySpecDirectEdit);
  return registry;
}
