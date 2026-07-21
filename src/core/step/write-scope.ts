/**
 * Write-scope single-source module.
 *
 * Defines which pipeline steps have broad ("guarded") vs. narrow ("scoped") write access,
 * and provides the canonical protected-path set and violation detection logic.
 *
 * Leaf module: imports ONLY from src/util/paths.ts. No other src/ dependencies.
 *
 * D2 (write-scope-enforcement): single source of truth for per-step staging mode and
 * forbidden write boundaries. Referenced by commit-push.ts to enforce at commit time.
 */

import {
  requestMdPath,
  factCheckAttestationPath,
  changeFolderPath,
} from "../../util/paths.js";

/**
 * Steps that require broad worktree write access (cannot enumerate outputs in advance).
 * These steps use "guarded" mode: pre-commit diff inspection + fail-closed halt on violation.
 *
 * All other steps use "scoped" mode: git add limited to their declared outputs.
 */
export const GUARDED_WRITE_STEPS: ReadonlySet<string> = new Set([
  "implementer",
  "build-fixer",
  "code-fixer",
  "test-materialize",
  "adr-gen",
]);

/**
 * Determine the commit-staging mode for a step.
 *
 * "scoped"  — stage only declared output paths (git add -A -- <paths>).
 *             Safe for deterministic steps whose outputs are fully enumerated by writes().
 * "guarded" — stage whole worktree (git add -A) after verifying no forbidden paths were touched.
 *             Required for broad-write steps where outputs cannot be enumerated in advance.
 *
 * Default: "scoped". Only GUARDED_WRITE_STEPS return "guarded".
 */
export function stagingModeFor(stepName: string): "scoped" | "guarded" {
  return GUARDED_WRITE_STEPS.has(stepName) ? "guarded" : "scoped";
}

/**
 * Return the canonical set of protected paths for a job slug.
 *
 * These are paths that constitute the "canon" for a change (request, spec, design, tasks,
 * test cases, and the request-review attestation). No pipeline step may write to these
 * paths unless it explicitly declares them as owned outputs via writes().
 *
 * All paths are worktree-relative (no leading slash).
 */
export function protectedCanonPaths(slug: string): string[] {
  const folder = changeFolderPath(slug);
  return [
    requestMdPath(slug),
    `${folder}/spec.md`,
    `${folder}/design.md`,
    `${folder}/tasks.md`,
    `${folder}/test-cases.md`,
    factCheckAttestationPath(slug),
  ];
}

/**
 * Test whether a path is a judge artifact (review result or feedback file) for the given slug.
 *
 * Matches:
 *   specrunner/changes/<slug>/*-result-*.md   (e.g. spec-review-result-001.md)
 *   specrunner/changes/<slug>/review-feedback-*.md
 *
 * Returns false for paths in a different slug's folder.
 */
export function isJudgeArtifact(filePath: string, slug: string): boolean {
  const folder = changeFolderPath(slug);
  const prefix = `${folder}/`;
  if (!filePath.startsWith(prefix)) return false;
  const filename = filePath.slice(prefix.length);
  return /-result-/.test(filename) || /^review-feedback-/.test(filename);
}

/**
 * Return the set of paths that are forbidden for a step to write.
 *
 * Computed as: protectedCanonPaths(slug) minus the paths the step has declared as
 * owned outputs (declaredWritePaths). If a step explicitly owns a canon path via
 * writes(), it is removed from the forbidden set for that step.
 *
 * @param stepName         - The pipeline step name (unused currently; reserved for future per-step narrowing).
 * @param slug             - The job slug.
 * @param declaredWritePaths - Paths declared by step.writes() (worktree-relative).
 */
export function forbiddenWritePaths(
  stepName: string,
  slug: string,
  declaredWritePaths: string[],
): string[] {
  const canon = protectedCanonPaths(slug);
  const declared = new Set(declaredWritePaths);
  return canon.filter((p) => !declared.has(p));
}

/**
 * Find paths in changedPaths that violate the write-scope for the given step.
 *
 * A violation is a changed path that:
 *   - is in forbiddenWritePaths(stepName, slug, declaredWritePaths), OR
 *   - is a judge artifact (isJudgeArtifact),
 *   AND is NOT in declaredWritePaths (step did not declare it as an output).
 *
 * @param stepName         - The pipeline step name.
 * @param slug             - The job slug.
 * @param changedPaths     - Worktree-relative paths that changed (from git status).
 * @param declaredWritePaths - Paths declared by step.writes() (worktree-relative).
 * @returns Array of violating paths (empty = no violations).
 */
export function findWriteScopeViolations(
  stepName: string,
  slug: string,
  changedPaths: string[],
  declaredWritePaths: string[],
): string[] {
  const forbidden = new Set(forbiddenWritePaths(stepName, slug, declaredWritePaths));
  const declared = new Set(declaredWritePaths);
  return changedPaths.filter(
    (p) => (forbidden.has(p) || isJudgeArtifact(p, slug)) && !declared.has(p),
  );
}
