/**
 * Design-layer exit hook: runs `aozu mark implemented --request <slug> [--pr <n>]`
 * inside the feature-branch worktree during the archive phase.
 *
 * Caller (orchestrator) decides what to do based on the returned status:
 *   "marked"       → continue (state changes staged for archive commit)
 *   "skipped"      → continue (design-layer disabled)
 *   "unknown-slug" → warn and continue (request not managed by aozu)
 *   "error"        → fail archive (config misuse or spawn failure)
 */
import type { SpawnFn } from "../../util/spawn.js";
import { formatEscalation } from "../finish/escalation.js";
import type { ResolvedDesignLayer } from "../../config/schema.js";

export type MarkHookResult =
  | { status: "skipped" }
  | { status: "marked" }
  | { status: "unknown-slug" }
  | { status: "error"; escalation: string };

export interface MarkHookParams {
  slug: string;
  prNumber?: number;
  designLayer: ResolvedDesignLayer;
  /** recordDir: the worktree (or main repo cwd in no-worktree mode) where aozu should run. */
  cwd: string;
  spawn: SpawnFn;
}

/**
 * Run the design-layer mark-implemented hook.
 *
 * When disabled → {status:"skipped"} without spawning anything.
 * On exit 0 → stages all aozu-written files with `git add -A`, returns {status:"marked"}.
 * On exit 1 → logs a warning, returns {status:"unknown-slug"} (archive continues).
 * On exit 2 / null → returns {status:"error", escalation} (archive fails).
 */
export async function runDesignLayerMarkHook(
  params: MarkHookParams,
): Promise<MarkHookResult> {
  const {
    slug,
    prNumber,
    designLayer,
    cwd,
    spawn,
  } = params;

  if (designLayer.enabled !== true) {
    return { status: "skipped" };
  }

  const args: string[] = ["mark", "implemented", "--request", slug];
  if (prNumber !== undefined) {
    args.push("--pr", String(prNumber));
  }

  const result = await spawn(designLayer.command, args, { cwd });

  if (result.exitCode === 0) {
    // Stage any files written by aozu (design/ state changes, etc.)
    const addResult = await spawn("git", ["add", "-A"], { cwd });
    if (addResult.exitCode !== 0) {
      return {
        status: "error",
        escalation: formatEscalation({
          failedStep: "design-layer mark-hook (git add -A)",
          detectedState: `git add -A failed (exit ${addResult.exitCode}): ${addResult.stderr.trim()}`,
          recommendedAction: `Re-run: specrunner job archive ${slug}`,
          resumeCommand: `specrunner job archive ${slug}`,
        }),
      };
    }
    return { status: "marked" };
  }

  if (result.exitCode === 1) {
    // Unknown slug — request not managed by aozu. Caller (orchestrator) handles the warning.
    return { status: "unknown-slug" };
  }

  // exit 2 or null (ENOENT / input error / config misuse) → fail archive
  const detail =
    result.exitCode === null
      ? `spawn failed (command '${designLayer.command}' not found?): ${result.stderr.trim()}`
      : `exit ${result.exitCode}: ${result.stderr.trim()}`;

  return {
    status: "error",
    escalation: formatEscalation({
      failedStep: "design-layer mark-hook (aozu mark implemented)",
      detectedState: detail,
      recommendedAction: `Check designLayer.command in .specrunner/config.json, then re-run: specrunner job archive ${slug}`,
      resumeCommand: `specrunner job archive ${slug}`,
    }),
  };
}
