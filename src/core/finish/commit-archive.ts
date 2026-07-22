/**
 * Commit archive step for finish command.
 *
 * Commits the staged changes produced by archiveChangeFolder
 * as a single archive commit. Idempotent: if no staged changes, commit is skipped.
 *
 * TC-CA-001: staging あり → commit 実行 → ok: true, skipped: false
 * TC-CA-002: staging なし → commit skip → ok: true, skipped: true
 * TC-CA-003: commit 失敗 → escalation
 * TC-CA-004: git diff 異常 exit code → escalation
 */
import type { SpawnFn } from "../../util/spawn.js";
import { formatEscalation } from "./escalation.js";

export type CommitArchiveResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Commit staged changes (archive) as a single archive commit.
 *
 * `pathspecs` lists exactly what the orchestrator staged (changes folder, drafts
 * deletion, design-layer dir). Both the staging detection and the commit are limited
 * to this pathspec — a whole-index commit would sweep in unauthorized entries
 * pre-staged earlier in the pipeline, and the archive commit is merged into the
 * base branch.
 *
 * Uses `git diff --cached --quiet -- <pathspecs...>` to detect staging:
 * - exit 0 → no staged changes → skip commit (idempotent)
 * - exit 1 → staged changes present → run `git commit -m "chore: archive <slug>" -- <pathspecs...>`
 * - other → unexpected error → escalation
 */
export async function commitArchive(params: {
  slug: string;
  cwd: string;
  spawn: SpawnFn;
  /** Pathspecs the orchestrator staged for this archive commit. Empty → skip (never bare-commit). */
  pathspecs: string[];
}): Promise<CommitArchiveResult> {
  const { slug, cwd, spawn, pathspecs } = params;

  if (pathspecs.length === 0) {
    return { ok: true, skipped: true, message: "No archive pathspecs staged — commit skipped." };
  }

  // Detect staged changes within the archive pathspec only
  const diffResult = await spawn("git", ["diff", "--cached", "--quiet", "--", ...pathspecs], { cwd });

  if (diffResult.exitCode === 0) {
    // No staged changes — skip commit (idempotent for resume paths)
    return { ok: true, skipped: true, message: "No staged changes — commit skipped." };
  }

  if (diffResult.exitCode !== 1) {
    // Unexpected exit code — escalate
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "commit-archive",
        detectedState: `git diff --cached --quiet exited with unexpected code ${diffResult.exitCode}: ${diffResult.stderr.trim()}`,
        recommendedAction: `Check git status and re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
      exitCode: 1,
    };
  }

  // Staged changes exist — commit them (pathspec-limited; never a whole-index commit)
  const commitResult = await spawn("git", ["commit", "-m", `chore: archive ${slug}`, "--", ...pathspecs], { cwd });

  if (commitResult.exitCode !== 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "commit-archive",
        detectedState: `git commit failed (exit ${commitResult.exitCode}): ${commitResult.stderr.trim()}`,
        recommendedAction: `Check git error and re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
      exitCode: 1,
    };
  }

  return { ok: true, skipped: false, message: `Committed archive for ${slug}.` };
}
