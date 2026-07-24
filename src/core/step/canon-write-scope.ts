/**
 * CanonWriteScope factory — wiring module that builds the canon write scope
 * from job state and step dependencies.
 *
 * Design D5: explicit map fallback adopted to avoid import cycles between
 * verdict derivation (judge-verdict.ts) and fixer step modules (code-fixer.ts,
 * implementer.ts, spec-fixer.ts). The drift-guard test (TC-029) validates that
 * the explicit map values match each fixer's actual writes() ∩ protectedCanonPaths.
 *
 * Single source of truth:
 *   - code-fixer:   ∅ (writes only gitState artifact, no canon files)
 *   - implementer:  {tasks.md} (declared for task checkbox updates)
 *   - spec-fixer:   {spec.md, design.md, tasks.md} (declared for spec/design/task corrections)
 */
import type { FixTarget } from "../../kernel/report-result.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "../port/step-types.js";
import { protectedCanonPaths } from "./write-scope.js";
import { changeFolderPath } from "../../util/paths.js";
import type { CanonWriteScope } from "./canon-escalation.js";
import { getJobSlug } from "../../state/job-slug.js";

/**
 * Shared internal builder: constructs a CanonWriteScope from a slug string.
 *
 * Single source of truth for the explicit D5 fixer → canon-paths map:
 *   - code-fixer:  ∅ (code-fixer and build-fixer write only gitState)
 *   - implementer: {tasks.md} (for task checkbox updates)
 *   - spec-fixer:  {spec.md, design.md, tasks.md} (for spec/design/task corrections)
 */
function buildScopeForSlug(slug: string): CanonWriteScope {
  const folder = changeFolderPath(slug);
  const canonPaths = new Set(protectedCanonPaths(slug));

  // Explicit map (D5): fixer → canon paths the fixer is legally allowed to write
  const writableByFixer = new Map<FixTarget, ReadonlySet<string>>([
    // code-fixer and build-fixer: no canon file writes (gitState only)
    ["code-fixer", new Set<string>()],
    // implementer: tasks.md only (task checkbox updates)
    ["implementer", new Set<string>([`${folder}/tasks.md`])],
    // spec-fixer: spec.md + design.md + tasks.md (spec/design/task corrections)
    ["spec-fixer", new Set<string>([`${folder}/spec.md`, `${folder}/design.md`, `${folder}/tasks.md`])],
  ]);

  return { canonPaths, writableByFixer };
}

/**
 * Build a CanonWriteScope for the given job state and step dependencies.
 *
 * canonPaths is derived from protectedCanonPaths(slug) — the single source of truth
 * for protected canon files.
 *
 * writableByFixer uses an explicit map (D5) to avoid import cycles:
 *   - code-fixer:  ∅ (code-fixer and build-fixer write only gitState)
 *   - implementer: {tasks.md} (for task checkbox updates)
 *   - spec-fixer:  {spec.md, design.md, tasks.md} (for spec/design/task corrections)
 *
 * Drift-guard (TC-029): canon-write-scope.test.ts asserts that each entry matches
 * the corresponding fixer's writes() ∩ protectedCanonPaths at test time.
 *
 * @param _state  - Current job state (reserved for future dynamic narrowing; unused).
 * @param deps    - Step dependencies providing slug for path resolution.
 */
export function buildCanonWriteScope(_state: JobState, deps: StepDeps): CanonWriteScope {
  return buildScopeForSlug(deps.slug);
}

/**
 * Build a CanonWriteScope from job state alone, without requiring step dependencies.
 *
 * Derives the slug from state via getJobSlug(state) and delegates to the shared
 * internal builder. Returns the same CanonWriteScope as
 * `buildCanonWriteScope(state, { slug: getJobSlug(state) })`.
 *
 * Used in pipeline-level predicates (spec-observation.ts) and other contexts where
 * StepDeps is unavailable.
 *
 * @param state - Current job state.
 */
export function buildCanonWriteScopeFromState(state: JobState): CanonWriteScope {
  return buildScopeForSlug(getJobSlug(state));
}
