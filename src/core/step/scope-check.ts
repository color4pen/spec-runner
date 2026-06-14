/**
 * Scope breach check orchestration for judge/conformance steps.
 *
 * Extracted from executor.ts following the commit-push.ts / rules-resolve.ts
 * pattern: new logic lives in a sibling file, executor delegates.
 *
 * Wiring:
 *   1. Guard: permissionScope absent / step not checkpoint / no runtimeStrategy → [].
 *   2. Fetch changed files via runtimeStrategy seam (B-5: no direct I/O here).
 *   3. Derive breach via pure function in scope.ts.
 *   4. Synthesize decision-needed findings via pure function in scope.ts.
 *
 * Pure inputs: permissionScope declaration + changedFiles (seam-injected) + state.
 * Returns: extra Finding[] to merge into judge/conformance findings before verdict.
 */
import type { Finding } from "../../kernel/report-result.js";
import type { PermissionScope } from "../pipeline/types.js";
import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import { deriveScopeBreach, synthesizeScopeFindings, synthesizeScopeUnverifiableFinding } from "../pipeline/scope.js";

/**
 * Compute synthesized scope findings for a judge/conformance step.
 *
 * Returns [] when:
 * - permissionScope is absent (no scope declared → existing behavior)
 * - step name does not match the declared checkpoint
 * - runtimeStrategy is unavailable (no seam → cannot fetch changed files)
 * - no forbidden surface is breached
 *
 * Returns one decision-needed Finding (origin:"scope") when a breach is detected.
 * The finding is deterministic — same breach produces the same computeFindingKey —
 * so human-resolved decisions suppress re-escalation automatically.
 */
export async function computeExtraScopeFindings(
  stepName: string,
  permissionScope: PermissionScope | undefined,
  state: JobState,
  deps: PipelineDeps,
): Promise<Finding[]> {
  if (!permissionScope) return [];
  if (stepName !== permissionScope.checkpoint) return [];
  if (!deps.runtimeStrategy) return [];

  // Fail-closed: if the runtime explicitly declares it cannot derive changed files,
  // skip listChangedFiles (which would silently return [] = fail-open) and synthesize
  // an UNKNOWN decision-needed finding instead.
  // predicate absent or true → fall through to existing listChangedFiles path (#689 behavior).
  if (deps.runtimeStrategy.canDeriveChangedFiles?.() === false) {
    return synthesizeScopeUnverifiableFinding({ slug: deps.slug });
  }

  const baseBranch = deps.request.baseBranch ?? "main";
  const cwd = deps.cwd ?? process.cwd();
  const changedFiles = await deps.runtimeStrategy.listChangedFiles(
    baseBranch, cwd, state.branch ?? null,
  );

  const breach = deriveScopeBreach({ scope: permissionScope, changedFiles, state });
  if (!breach.breached) return [];

  return synthesizeScopeFindings(breach, { slug: deps.slug });
}
