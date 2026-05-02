/**
 * Move requests dir from awaiting-merge to merged and commit.
 *
 * TC-027: git mv awaiting-merge/<slug> → merged/<slug>
 * TC-028: merged/ exists + awaiting-merge/ absent → skip (idempotent)
 * TC-044: no changes to commit → skip commit
 * TC-063: commit message = "chore: archive <slug>"
 */
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";
import { formatEscalation } from "./escalation.js";

export type MoveRequestsDirResult =
  | { ok: true; skipped: boolean; committed: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Move awaiting-merge/<slug> to merged/<slug> and commit.
 */
export async function moveRequestsDir(params: {
  slug: string;
  jobId: string;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<MoveRequestsDirResult> {
  const { slug, jobId, cwd, spawn, fs } = params;

  const awaitingMergePath = path.join(
    "openspec-workflow", "requests", "awaiting-merge", slug,
  );
  const mergedPath = path.join(
    "openspec-workflow", "requests", "merged", slug,
  );

  const awaitingExists = await fs.exists(path.join(cwd, awaitingMergePath));
  const mergedExists = await fs.exists(path.join(cwd, mergedPath));

  // Idempotent skip: already moved
  if (mergedExists && !awaitingExists) {
    return {
      ok: true,
      skipped: true,
      committed: false,
      message: `requests dir already moved to merged/${slug}, skipping.`,
    };
  }

  // Move if awaiting-merge exists
  if (awaitingExists) {
    // Ensure target parent dir exists
    await fs.mkdir(path.join(cwd, "openspec-workflow", "requests", "merged"), { recursive: true });

    const mvResult = await spawn(
      "git",
      ["mv", awaitingMergePath, mergedPath],
      { cwd },
    );

    if (mvResult.exitCode !== 0) {
      const escalation = formatEscalation({
        failedStep: "move-requests-dir",
        detectedState: `git mv failed (exit ${mvResult.exitCode})`,
        recommendedAction: `Check git error: ${mvResult.stderr.trim()}. Then re-run: specrunner finish ${jobId}`,
        resumeCommand: `specrunner finish ${jobId}`,
      });
      return { ok: false, escalation, exitCode: 1 };
    }
  }

  // Check for staged changes before committing — locale-independent
  // (exit 0 = no staged changes, exit 1 = staged changes present).
  const diffResult = await spawn("git", ["diff", "--cached", "--quiet"], { cwd });

  if (diffResult.exitCode === 0) {
    // Nothing staged — skip commit entirely
    return {
      ok: true,
      skipped: false,
      committed: false,
      message: `No changes to commit for archive ${slug}.`,
    };
  }

  const commitResult = await spawn(
    "git",
    ["commit", "-m", `chore: archive ${slug}`],
    { cwd },
  );

  if (commitResult.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "move-requests-dir",
      detectedState: `git commit failed (exit ${commitResult.exitCode})`,
      recommendedAction: `Check git error: ${commitResult.stderr.trim()}. Then re-run: specrunner finish ${jobId}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  return {
    ok: true,
    skipped: false,
    committed: true,
    message: `Moved awaiting-merge/${slug} to merged/${slug} and committed.`,
  };
}
