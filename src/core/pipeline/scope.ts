/**
 * Scope breach derivation and scope finding synthesis.
 *
 * Pure module — no fs, no child_process. All external I/O is seam-injected
 * by callers (RuntimeStrategy.listChangedFiles, same as verifyFindingRefs).
 *
 * Design: "判断は導出する、自己申告させない" applied to permission boundaries.
 * - Scope is declared as data (PermissionScope on PipelineDescriptor).
 * - Breach is derived mechanically from changed files vs. forbidden surfaces.
 * - Machine-source breach is synthesized into a decision-needed Finding so both
 *   sources (machine + agent) travel the same decision-ledger / escalation path.
 */
import type { PermissionScope } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { Finding, DecisionOption } from "../../kernel/report-result.js";
import { matchGlob } from "../reviewers/glob-match.js";

// ---------------------------------------------------------------------------
// ScopeBreach — result of deriveScopeBreach
// ---------------------------------------------------------------------------

/**
 * Result of a scope breach evaluation.
 * surfaces: sorted, deduplicated ForbiddenSurface ids that were violated.
 */
export interface ScopeBreach {
  breached: boolean;
  surfaces: string[];
}

// ---------------------------------------------------------------------------
// deriveScopeBreach
// ---------------------------------------------------------------------------

/**
 * Input for deriveScopeBreach.
 * state is reserved for future state-axis checking; currently unused.
 */
export interface DeriveScopeBreachInput {
  /** Declared permission scope (from PipelineDescriptor). absent = no scope = no breach. */
  scope?: PermissionScope;
  /** Repo-relative paths of files changed since the base branch (base...HEAD). */
  changedFiles: readonly string[];
  /** Current job state (reserved for future state-axis checks; not read in this version). */
  state: JobState;
}

/**
 * Derive whether any declared ForbiddenSurface has been breached.
 *
 * Algorithm:
 * - scope absent or forbidden empty → { breached: false, surfaces: [] }
 * - For each ForbiddenSurface, test whether any changedFile matches any path glob.
 * - Collect the ids of breached surfaces, sort, deduplicate, and return.
 *
 * Pure function — no I/O, no side effects.
 */
export function deriveScopeBreach(input: DeriveScopeBreachInput): ScopeBreach {
  const { scope, changedFiles } = input;
  if (!scope || scope.forbidden.length === 0) {
    return { breached: false, surfaces: [] };
  }

  const breachedIds = new Set<string>();
  for (const surface of scope.forbidden) {
    for (const file of changedFiles) {
      if (surface.paths.some((pattern) => matchGlob(pattern, file))) {
        breachedIds.add(surface.id);
        break;
      }
    }
  }

  const surfaces = [...breachedIds].sort();
  return { breached: surfaces.length > 0, surfaces };
}

// ---------------------------------------------------------------------------
// SynthesisContext — minimum context for deterministic file anchor
// ---------------------------------------------------------------------------

/**
 * Minimum context needed by synthesizeScopeFindings to produce a deterministic
 * file anchor. Callers pass only what they have (slug is always available in deps).
 */
export interface SynthesisContext {
  /** Canonical slug for the current change (e.g. "my-feature"). */
  slug: string;
}

// ---------------------------------------------------------------------------
// synthesizeScopeFindings
// ---------------------------------------------------------------------------

/**
 * Synthesize a deterministic set of scope-breach decision-needed findings from
 * a ScopeBreach result.
 *
 * Properties of the synthesized findings:
 * - origin: "scope"        — identifies machine-source scope breach
 * - resolution: "decision-needed" — routes through existing escalation path
 * - severity: "high"
 * - file: deterministic anchor (change request.md, always present in worktree)
 * - title / rationale: fixed, deterministic text (stable computeFindingKey)
 * - options: exactly 3 deterministic choices (satisfies ≥2 options contract)
 *
 * Pure function — no I/O, no side effects.
 * When breach.breached is false, returns [].
 */
export function synthesizeScopeFindings(
  breach: ScopeBreach,
  ctx: SynthesisContext,
): Finding[] {
  if (!breach.breached || breach.surfaces.length === 0) {
    return [];
  }

  const surfaceList = breach.surfaces.join(", ");
  const rationale = `Scope breach detected. The following forbidden surfaces were touched: ${surfaceList}. This change exceeds the declared permission scope of the pipeline profile.`;

  const options: DecisionOption[] = [
    {
      label: "Option A: redo with a heavier pipeline",
      consequence: "Restart this job using a pipeline profile that covers the affected surfaces. The current work is discarded.",
    },
    {
      label: "Option B: revise the scope declaration",
      consequence: "Update the pipeline profile's permissionScope to allow these surfaces, then resume.",
    },
    {
      label: "Option C: reject this change",
      consequence: "Close the request without merging. The changes exceeded the declared scope and will not be applied.",
    },
  ];

  const finding: Finding = {
    severity: "high",
    resolution: "decision-needed",
    origin: "scope",
    file: `specrunner/changes/${ctx.slug}/request.md`,
    title: "Scope exceeded: changes touch forbidden surfaces",
    rationale,
    options,
  };

  return [finding];
}

// ---------------------------------------------------------------------------
// synthesizeScopeUnverifiableFinding
// ---------------------------------------------------------------------------

/**
 * Synthesize a deterministic UNKNOWN finding for when scope cannot be evaluated.
 *
 * Used by scope-check when canDeriveChangedFiles() === false: the runtime cannot
 * derive changed files, so the declared permissionScope cannot be verified.
 *
 * Properties of the synthesized finding:
 * - origin: "scope"             — machine-source scope evaluation (same routing path)
 * - resolution: "decision-needed" — routes through existing escalation path
 * - severity: "high"
 * - file: deterministic anchor (change request.md, always present in worktree)
 * - title: distinct from breach finding (different computeFindingKey)
 * - options: exactly 3 deterministic choices (satisfies ≥2 options contract)
 *
 * Deterministic: same ctx → same file, title, rationale, options → same computeFindingKey.
 * Human-resolved UNKNOWN is suppressed by decision-ledger (no re-escalation).
 *
 * Pure function — no I/O, no side effects.
 */
export function synthesizeScopeUnverifiableFinding(ctx: SynthesisContext): Finding[] {
  const rationale =
    "この runtime では changed-files を導出できないため、宣言された permissionScope を検証できなかった。" +
    " スコープ内とも超過とも確定していない（UNKNOWN）。" +
    " listChangedFiles が [] を返すのは構造的な制約であり、変更なしを意味しない。";

  const options: DecisionOption[] = [
    {
      label: "Option A: changed-files を導出できる runtime（例: local）で実行し直す",
      consequence:
        "local runtime など git worktree を持つ環境でこのジョブを再実行し、scope 検証を完走させる。",
    },
    {
      label: "Option B: この profile の permissionScope 宣言を外す",
      consequence:
        "pipeline profile から permissionScope を削除する。以降この profile では scope 検証は走らない。",
    },
    {
      label: "Option C: scope 検証なしで進めることを受け入れる（リスク受容）",
      consequence:
        "scope を検証できないまま前進する。禁止サーフェスに触れていても検出されない可能性があることを承認者が受容する。",
    },
  ];

  const finding: Finding = {
    severity: "high",
    resolution: "decision-needed",
    origin: "scope",
    file: `specrunner/changes/${ctx.slug}/request.md`,
    title: "scope を検証できなかった（UNKNOWN）: runtime が changed-files を導出できない",
    rationale,
    options,
  };

  return [finding];
}
