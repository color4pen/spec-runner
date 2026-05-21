import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";
import { loadSpecFiles, extractSection, parseRequirementBlocks } from "./spec-content-parser.js";

/**
 * Normalise a requirement header for fuzzy comparison:
 * lowercase + collapse whitespace runs to single space + trim.
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Validates that each `### Requirement:` header in the delta spec either:
 * - exactly matches a header in the baseline spec (MODIFIED), or
 * - does not match even fuzzily (ADDED — a new requirement).
 *
 * A violation occurs when the delta header does not exactly match a baseline
 * header BUT does match one after normalisation (lowercase + whitespace
 * collapse). This catches case typos and extra whitespace.
 *
 * If `baselineSpecLoader` is undefined or returns null, all requirements are
 * treated as ADDED and the rule passes (DJ1, DJ3).
 */
export const baselineHeaderMatch: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "baseline-header-match",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    if (!input.baselineSpecLoader) {
      return [];
    }

    const violations: DeltaSpecViolation[] = [];
    const specFiles = await loadSpecFiles(input);

    for (const { specPath, content, capability } of specFiles) {
      const baselineContent = await input.baselineSpecLoader(capability);
      if (baselineContent === null) {
        // New capability — all requirements are ADDED, skip
        continue;
      }

      // Extract baseline requirement headers
      const baselineSection = extractSection(baselineContent, "## Requirements");
      const baselineBlocks =
        baselineSection !== null ? parseRequirementBlocks(baselineSection) : [];

      const baselineExactHeaders = new Set(baselineBlocks.map((b) => b.header));
      const baselineNormalizedHeaders = new Map(
        baselineBlocks.map((b) => [normalizeHeader(b.header), b.header]),
      );

      // Extract delta requirement headers
      const deltaSection = extractSection(content, "## Requirements");
      if (deltaSection === null) {
        continue;
      }
      const deltaBlocks = parseRequirementBlocks(deltaSection);

      for (const block of deltaBlocks) {
        if (baselineExactHeaders.has(block.header)) {
          // Exact match — MODIFIED, OK
          continue;
        }

        // Check for normalized match (typo / case mismatch)
        const normalized = normalizeHeader(block.header);
        if (baselineNormalizedHeaders.has(normalized)) {
          violations.push({
            path: specPath,
            reason: "baseline-header-mismatch",
            suggested:
              "Match baseline header exactly for MODIFIED, or treat as ADDED if new",
          });
        }
        // No normalized match → ADDED, OK
      }
    }

    return violations;
  },
};
