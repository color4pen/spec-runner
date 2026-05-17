/**
 * Delta spec path / format validator.
 *
 * Detects legacy-path and format violations in a change folder's delta spec files.
 * Fully injectable (DI for readdir/readFile) so it can be tested without real fs.
 *
 * Design D1: no I/O imports at module level — all fs access goes through deps.
 * Design D2: changePath is the absolute (or resolved) path to the change folder.
 */

/**
 * Reason codes for delta spec violations.
 *
 * - legacy-flat-file: `<change>/delta-spec.md` or `<change>/specs/<name>.delta.md`
 * - legacy-flat-dir: `<change>/delta-spec/<capability>.md`
 * - non-canonical-path: `<change>/specs/<name>.md` placed directly in specs/ without subdir
 * - missing-requirements-section: canonical path but no ADDED/MODIFIED/REMOVED section header
 * - empty-section: section header present but no Requirement block found
 */
export type DeltaSpecViolationReason =
  | "legacy-flat-file"
  | "legacy-flat-dir"
  | "non-canonical-path"
  | "missing-requirements-section"
  | "empty-section"
  | "no-specs-for-required-type";

export interface DeltaSpecViolation {
  path: string;
  reason: DeltaSpecViolationReason;
  /** Human-readable suggested fix (optional). */
  suggested?: string;
}

/** Injectable filesystem interface for the validator (subset of FinishFs). */
export interface DeltaSpecValidatorFs {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
}

const TYPES_REQUIRING_SPECS = ["spec-change", "new-feature"];

/**
 * Validate delta spec paths and file contents under `changePath`.
 *
 * @param changePath - Absolute path to the change folder (e.g. `/work/specrunner/changes/my-change`)
 * @param deps - Injectable fs operations for testing
 * @param requestType - Request type from request.md Meta section. When "spec-change" or "new-feature", specs/ must contain at least one .md file.
 * @returns `{ ok: true }` when all checks pass; `{ ok: false, violations }` otherwise
 */
export async function validateDeltaSpecPaths(
  changePath: string,
  deps: DeltaSpecValidatorFs,
  requestType?: string,
): Promise<{ ok: true } | { ok: false; violations: DeltaSpecViolation[] }> {
  const violations: DeltaSpecViolation[] = [];

  // --- Step 5: Check specs/ presence for required types (spec-change, new-feature) ---
  if (requestType && TYPES_REQUIRING_SPECS.includes(requestType)) {
    let specsFound = false;
    try {
      const specsTopEntries = await deps.readdir(`${changePath}/specs`);
      for (const entry of specsTopEntries) {
        if (entry.endsWith(".md")) {
          specsFound = true;
          break;
        }
        try {
          const subEntries = await deps.readdir(`${changePath}/specs/${entry}`);
          if (subEntries.some((e) => e.endsWith(".md"))) {
            specsFound = true;
            break;
          }
        } catch {
          // not a dir
        }
      }
    } catch {
      // specs/ doesn't exist
    }

    if (!specsFound) {
      violations.push({
        path: `${changePath}/specs/`,
        reason: "no-specs-for-required-type",
        suggested: `Request type '${requestType}' requires a delta spec. Add a file under ${changePath}/specs/<capability-name>/spec.md`,
      });
      return { ok: false, violations };
    }
  }

  // --- Step 1: Check <change>/delta-spec.md (legacy flat file) ---
  let topLevelEntries: string[] = [];
  try {
    topLevelEntries = await deps.readdir(changePath);
  } catch {
    // Change folder doesn't exist → nothing to validate
    return { ok: true };
  }

  if (topLevelEntries.includes("delta-spec.md")) {
    violations.push({
      path: `${changePath}/delta-spec.md`,
      reason: "legacy-flat-file",
      suggested: `Move to ${changePath}/specs/<capability-name>/spec.md`,
    });
  }

  // --- Step 2: Check <change>/delta-spec/*.md (legacy flat dir) ---
  let deltaSpecDirEntries: string[] = [];
  try {
    deltaSpecDirEntries = await deps.readdir(`${changePath}/delta-spec`);
  } catch {
    // Directory doesn't exist — OK
  }
  for (const entry of deltaSpecDirEntries) {
    if (entry.endsWith(".md")) {
      violations.push({
        path: `${changePath}/delta-spec/${entry}`,
        reason: "legacy-flat-dir",
        suggested: `Move to ${changePath}/specs/${entry.replace(/\.md$/, "")}/spec.md`,
      });
    }
  }

  // --- Step 3: Check <change>/specs/ entries ---
  let specsEntries: string[] = [];
  try {
    specsEntries = await deps.readdir(`${changePath}/specs`);
  } catch {
    // No specs directory → no canonical or non-canonical paths to check
    return violations.length > 0 ? { ok: false, violations } : { ok: true };
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

    // Check if spec.md exists in this subdir
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
        suggested: "Add ## ADDED Requirements / ## MODIFIED Requirements / ## REMOVED Requirements section",
      });
      continue;
    }

    // Check for at least one valid section header
    const hasValidSection = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/m.test(content);
    if (!hasValidSection) {
      violations.push({
        path: specPath,
        reason: "missing-requirements-section",
        suggested: "Add ## ADDED Requirements, ## MODIFIED Requirements, or ## REMOVED Requirements section header",
      });
      continue;
    }

    // Check for at least one Requirement block
    const hasRequirement = /^### Requirement:/m.test(content);
    if (!hasRequirement) {
      violations.push({
        path: specPath,
        reason: "empty-section",
        suggested: "Add at least one ### Requirement: block under the section header",
      });
    }
  }

  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}
