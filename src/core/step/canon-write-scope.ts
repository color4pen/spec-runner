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
  const slug = deps.slug;
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
