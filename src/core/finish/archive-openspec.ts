/**
 * openspec archive step for finish command.
 *
 * TC-024: specs/ has .md files → openspec archive <slug>
 * TC-025: specs/ is empty → openspec archive <slug> --skip-specs
 * TC-026: change folder missing → skip entire step
 * TC-043: non-zero exit → escalation
 */
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";
import { formatEscalation } from "./escalation.js";

export type ArchiveOpenspecResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Archive openspec change folder via openspec CLI.
 */
export async function archiveOpenspec(params: {
  slug: string;
  jobId: string;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<ArchiveOpenspecResult> {
  const { slug, jobId, cwd, spawn, fs } = params;

  const changeFolderPath = path.join(cwd, "openspec", "changes", slug);
  const changeExists = await fs.exists(changeFolderPath);

  if (!changeExists) {
    return {
      ok: true,
      skipped: true,
      message: `openspec/changes/${slug}/ not found — skipping openspec archive.`,
    };
  }

  // Check for .md files in specs/ subfolder
  const specsPath = path.join(changeFolderPath, "specs");
  let hasSpecFiles = false;
  try {
    const specsEntries = await fs.readdir(specsPath);
    hasSpecFiles = specsEntries.some((e) => e.endsWith(".md"));
  } catch {
    // specs/ doesn't exist or can't be read — treat as no spec files
    hasSpecFiles = false;
  }

  const archiveArgs = hasSpecFiles
    ? ["archive", slug]
    : ["archive", slug, "--skip-specs"];

  const result = await spawn("openspec", archiveArgs, { cwd });

  if (result.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-openspec",
      detectedState: `openspec archive failed (exit ${result.exitCode})`,
      recommendedAction: `Check openspec error: ${result.stderr.trim()}. Then re-run: specrunner finish ${jobId}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // Stage the openspec/changes/ tree so that the deletion of
  // openspec/changes/<slug>/ and the new openspec/changes/archive/<date>-<slug>/
  // directory (created by openspec archive) are both included in the commit
  // that move-requests-dir will produce.
  const gitAddResult = await spawn("git", ["add", "openspec/changes/"], { cwd });

  if (gitAddResult.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-openspec",
      detectedState: `git add openspec/changes/ failed (exit ${gitAddResult.exitCode})`,
      recommendedAction: `Check git error: ${gitAddResult.stderr.trim()}. Then re-run: specrunner finish ${jobId}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  const withOrWithout = hasSpecFiles ? "with specs" : "without specs (--skip-specs)";
  return {
    ok: true,
    skipped: false,
    message: `openspec archive ${slug} completed (${withOrWithout}).`,
  };
}
