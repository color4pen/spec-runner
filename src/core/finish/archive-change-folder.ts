/**
 * Archive change folder step for finish command.
 *
 * Moves specrunner/changes/<slug>/ → specrunner/changes/archive/<YYYY-MM-DD>-<slug>/ via git mv.
 * Replaces the old openspec archive step (TC-024-026, TC-043).
 *
 * TC-CF-001: change folder exists → git mv succeeds → ok: true, skipped: false
 * TC-CF-002: change folder absent → skip (ok: true, skipped: true)
 * TC-CF-003: git mv fails → escalation
 */
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";
import { formatEscalation } from "./escalation.js";
import { changeFolderPath, changesDirRel, archivedChangeFolderPath } from "../../util/paths.js";

export type ArchiveChangeFolderResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Archive specrunner/changes/<slug>/ to specrunner/changes/archive/<YYYY-MM-DD>-<slug>/ via git mv.
 * The YYYY-MM-DD prefix is derived from the local-time calendar date at finish execution.
 */
export async function archiveChangeFolder(params: {
  slug: string;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  now?: () => Date;
}): Promise<ArchiveChangeFolderResult> {
  const { slug, cwd, spawn, fs } = params;

  const changeFolderAbsPath = path.join(cwd, changeFolderPath(slug));
  const changeExists = await fs.exists(changeFolderAbsPath);

  if (!changeExists) {
    return {
      ok: true,
      skipped: true,
      message: `${changeFolderPath(slug)}/ not found — skipping change folder archive.`,
    };
  }

  const sourcePath = changeFolderPath(slug);
  const d = (params.now ?? (() => new Date()))();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const archivePath = archivedChangeFolderPath(`${dateStr}-${slug}`);

  const mvResult = await spawn("git", ["mv", sourcePath, archivePath], { cwd });

  if (mvResult.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-change-folder",
      detectedState: `git mv ${sourcePath} → ${archivePath} failed (exit ${mvResult.exitCode})`,
      recommendedAction: `Check git error: ${mvResult.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
      resumeCommand: `specrunner finish ${slug}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // Stage the changes/ tree so the move is included in the archive commit
  const gitAddResult = await spawn("git", ["add", `${changesDirRel()}/`], { cwd });

  if (gitAddResult.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-change-folder",
      detectedState: `git add ${changesDirRel()}/ failed (exit ${gitAddResult.exitCode})`,
      recommendedAction: `Check git error: ${gitAddResult.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
      resumeCommand: `specrunner finish ${slug}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  return {
    ok: true,
    skipped: false,
    message: `Archived ${sourcePath} to ${archivePath}.`,
  };
}
