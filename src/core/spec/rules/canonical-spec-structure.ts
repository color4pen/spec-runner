import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";

/**
 * Validates the canonical spec structure under <changePath>/specs/.
 *
 * Handles Step 3 + Step 4 from the original delta-spec-validator:
 * - .delta.md files directly in specs/ → legacy-flat-file
 * - .md files directly in specs/ → non-canonical-path
 * - subdirs → validate spec.md presence and content
 */
export const canonicalSpecStructure: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "canonical-spec-structure",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const { changePath, deps } = input;
    const violations: DeltaSpecViolation[] = [];

    // --- Step 3: Check <change>/specs/ entries ---
    let specsEntries: string[] = [];
    try {
      specsEntries = await deps.readdir(`${changePath}/specs`);
    } catch {
      // No specs directory — nothing to check here
      return [];
    }

    const specsSubdirs: string[] = [];
    for (const entry of specsEntries) {
      if (entry.endsWith(".delta.md")) {
        // <change>/specs/<name>.delta.md → legacy-flat-file
        violations.push({
          path: `${changePath}/specs/${entry}`,
          reason: "legacy-flat-file",
          suggested: `Move to ${changePath}/specs/${entry.replace(/\.delta\.md$/, "")}/spec.md`,
        });
      } else if (entry.endsWith(".md")) {
        // <change>/specs/<name>.md directly in specs/ (no subdir) → non-canonical-path
        violations.push({
          path: `${changePath}/specs/${entry}`,
          reason: "non-canonical-path",
          suggested: `Move to ${changePath}/specs/${entry.replace(/\.md$/, "")}/spec.md`,
        });
      } else {
        // Likely a capability subdirectory
        specsSubdirs.push(entry);
      }
    }

    // --- Step 4: Validate canonical paths <change>/specs/<cap>/spec.md ---
    for (const subdir of specsSubdirs) {
      const specPath = `${changePath}/specs/${subdir}/spec.md`;

      let subdirEntries: string[] = [];
      try {
        subdirEntries = await deps.readdir(`${changePath}/specs/${subdir}`);
      } catch {
        // Can't list subdir — skip
        continue;
      }

      if (!subdirEntries.includes("spec.md")) {
        // No spec.md — any .md files in here are non-canonical
        for (const entry of subdirEntries) {
          if (entry.endsWith(".md")) {
            violations.push({
              path: `${changePath}/specs/${subdir}/${entry}`,
              reason: "non-canonical-path",
              suggested: `Rename to spec.md: ${changePath}/specs/${subdir}/spec.md`,
            });
          }
        }
        continue;
      }

      // Read spec.md and validate content
      let content: string;
      try {
        content = await deps.readFile(specPath);
      } catch {
        violations.push({
          path: specPath,
          reason: "missing-requirements-section",
          suggested: "Add ## Requirements section",
        });
        continue;
      }

      // Check for legacy section headers (old format — HIGH violation)
      const legacyMatches = content.match(/^## (?:ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/gm) ?? [];
      for (const _match of legacyMatches) {
        violations.push({
          path: specPath,
          reason: "legacy-section-header",
          suggested:
            "Replace ## ADDED/MODIFIED/REMOVED/RENAMED Requirements with ## Requirements (tool auto-classifies ADDED/MODIFIED)",
        });
      }

      // Check for ## Requirements section (required in new format)
      const hasRequirementsSection = /^## Requirements\s*$/m.test(content);
      if (!hasRequirementsSection) {
        violations.push({
          path: specPath,
          reason: "missing-requirements-section",
          suggested: "Add ## Requirements section",
        });
        continue;
      }

      // Check for at least one Requirement block
      const hasRequirement = /^### Requirement:/m.test(content);
      if (!hasRequirement) {
        violations.push({
          path: specPath,
          reason: "empty-section",
          suggested: "Add at least one ### Requirement: block under the ## Requirements section",
        });
      }
    }

    return violations;
  },
};
