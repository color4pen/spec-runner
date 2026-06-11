/**
 * Load-time validator for custom reviewer definitions.
 *
 * Checks all definitions in a single pass and collects all violations before throwing,
 * so the user sees the complete error picture at once.
 */
import type { ReviewerDefinition, ReviewerViolation } from "./types.js";
import { ReviewerValidationError, MAX_REVIEWER_ITERATIONS } from "./types.js";
import { isStandardStepName } from "../step/step-names.js";

/** Minimum allowed maxIterations value. */
const MIN_REVIEWER_ITERATIONS = 1;

/**
 * Name charset constraint: must match /^[a-z0-9][a-z0-9\-_]*$/
 * This also blocks path-traversal patterns like "../etc/passwd".
 */
const NAME_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/;

/**
 * Required section fields in a ReviewerDefinition.
 * Values must be non-empty strings.
 */
const REQUIRED_SECTION_FIELDS: Array<{ field: keyof ReviewerDefinition; sectionName: string }> = [
  { field: "purpose",  sectionName: "目的" },
  { field: "criteria", sectionName: "観点" },
  { field: "judgment", sectionName: "判定基準" },
];

/**
 * Validate all reviewer definitions.
 *
 * Checks performed (in order, all accumulated before throw):
 *   1. name matches charset constraint /^[a-z0-9][a-z0-9\-_]*$/ (also catches missing/empty name)
 *   2. name matches filename stem
 *   3. maxIterations is an integer and within [1, MAX_REVIEWER_ITERATIONS]
 *   4. required sections (目的 / 観点 / 判定基準) are present and non-empty
 *   5. name does not collide with a standard pipeline step name
 *   6. name is not duplicated across definitions
 *
 * @throws ReviewerValidationError when one or more violations are found.
 */
export function validateReviewerDefinitions(defs: ReviewerDefinition[]): void {
  const violations: ReviewerViolation[] = [];
  const seenNames = new Map<string, string>(); // name → first filename

  for (const def of defs) {
    const { filename } = def;

    // (1) Charset check — blocks path traversal, catches missing/empty name, and gates further checks
    if (!def.name || !NAME_PATTERN.test(def.name)) {
      violations.push({
        filename,
        message: `name "${def.name}" violates charset constraint /^[a-z0-9][a-z0-9\\-_]*$/`,
      });
      // Skip further per-name checks since name is invalid
      continue;
    }

    // (2) name must match filename stem
    const stem = filename.endsWith(".md") ? filename.slice(0, -3) : filename;
    if (def.name !== stem) {
      violations.push({
        filename,
        message: `frontmatter name "${def.name}" does not match filename stem "${stem}"`,
      });
    }

    // (3) maxIterations: integer and within range
    if (
      !Number.isInteger(def.maxIterations) ||
      def.maxIterations < MIN_REVIEWER_ITERATIONS ||
      def.maxIterations > MAX_REVIEWER_ITERATIONS
    ) {
      violations.push({
        filename,
        message: `maxIterations must be an integer between ${MIN_REVIEWER_ITERATIONS} and ${MAX_REVIEWER_ITERATIONS} (got ${def.maxIterations})`,
      });
    }

    // (4) Required sections present and non-empty
    for (const { field, sectionName } of REQUIRED_SECTION_FIELDS) {
      const value = def[field] as string;
      if (!value || !value.trim()) {
        violations.push({
          filename,
          message: `required section "## ${sectionName}" is missing or empty`,
        });
      }
    }

    // (5) No collision with standard pipeline step names
    if (isStandardStepName(def.name)) {
      violations.push({
        filename,
        message: `name "${def.name}" collides with a built-in pipeline step name`,
      });
    }

    // (6) No duplicate names across definitions
    const prev = seenNames.get(def.name);
    if (prev !== undefined) {
      violations.push({
        filename,
        message: `name "${def.name}" is already used by ${prev}`,
      });
    } else {
      seenNames.set(def.name, filename);
    }

    // (7) paths — when present: must be a non-empty array of non-empty strings
    if (def.paths !== undefined) {
      if (!Array.isArray(def.paths) || def.paths.length === 0) {
        violations.push({
          filename,
          message: `paths must be a non-empty array when present`,
        });
      } else {
        for (const p of def.paths) {
          if (typeof p !== "string" || p.trim() === "") {
            violations.push({
              filename,
              message: `each element of paths must be a non-empty string`,
            });
            break;
          }
        }
      }
    }

    // (8) requestTypes — when present: must be a non-empty array of non-empty strings
    if (def.requestTypes !== undefined) {
      if (!Array.isArray(def.requestTypes) || def.requestTypes.length === 0) {
        violations.push({
          filename,
          message: `requestTypes must be a non-empty array when present`,
        });
      } else {
        for (const rt of def.requestTypes) {
          if (typeof rt !== "string" || rt.trim() === "") {
            violations.push({
              filename,
              message: `each element of requestTypes must be a non-empty string`,
            });
            break;
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    const summary = violations.map((v) => `  [${v.filename}] ${v.message}`).join("\n");
    throw new ReviewerValidationError(
      `Reviewer definition validation failed:\n${summary}`,
      violations,
    );
  }
}
