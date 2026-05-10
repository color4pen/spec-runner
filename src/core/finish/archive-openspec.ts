/**
 * openspec archive step for finish command.
 *
 * TC-024: specs/ has nested/flat .md files → openspec archive <slug>
 * TC-025: specs/ is empty → openspec archive <slug> --skip-specs
 * TC-024b: specs/<name>/spec.md (nested) → openspec archive <slug>
 * TC-024c: specs/*.md (flat fallback) → openspec archive <slug>
 * TC-026: change folder missing → skip entire step
 * TC-043: non-zero exit → escalation
 */
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";
import { formatEscalation } from "./escalation.js";
import { changeFolderPath, changesDirRel } from "../../util/paths.js";

export type ArchiveOpenspecResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Check if a path points to a directory.
 * Returns false if path doesn't exist or stat fails.
 */
async function isDirectory(filePath: string, fs: FinishFs): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Detect spec files in specs/ directory.
 * Detection order: nested convention (specs/<name>/spec.md) first, then flat fallback (specs/*.md).
 * Returns true if at least one spec file is detected.
 */
async function hasSpecFiles(specsPath: string, fs: FinishFs): Promise<boolean> {
  try {
    const entries = await fs.readdir(specsPath);

    // Check nested convention: specs/<name>/spec.md
    for (const entry of entries) {
      const entryPath = path.join(specsPath, entry);
      const isDirResult = await isDirectory(entryPath, fs);
      if (isDirResult === true) {
        const specFile = path.join(entryPath, "spec.md");
        const exists = await fs.exists(specFile);
        if (exists === true) {
          return true;
        }
      }
    }

    // Flat fallback: specs/*.md
    return entries.some((e) => e.endsWith(".md"));
  } catch {
    return false;
  }
}

/**
 * Archive openspec change folder via openspec CLI.
 */
export async function archiveOpenspec(params: {
  slug: string;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<ArchiveOpenspecResult> {
  const { slug, cwd, spawn, fs } = params;

  const changeFolderAbsPath = path.join(cwd, changeFolderPath(slug));
  const changeExists = await fs.exists(changeFolderAbsPath);

  if (!changeExists) {
    return {
      ok: true,
      skipped: true,
      message: `${changeFolderPath(slug)}/ not found — skipping openspec archive.`,
    };
  }

  // Check for spec files in specs/ subfolder
  const specsPath = path.join(changeFolderAbsPath, "specs");
  const hasSpecFilesResult = await hasSpecFiles(specsPath, fs);

  const archiveArgs = hasSpecFilesResult
    ? ["archive", slug, "--yes"]
    : ["archive", slug, "--yes", "--skip-specs"];

  const result = await spawn("openspec", archiveArgs, { cwd });

  if (result.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-openspec",
      detectedState: `openspec archive failed (exit ${result.exitCode})`,
      recommendedAction: `Check openspec error: ${result.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
      resumeCommand: `specrunner finish ${slug}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // Stage the openspec/changes/ tree so that the deletion of
  // openspec/changes/<slug>/ and the new openspec/changes/archive/<date>-<slug>/
  // directory (created by openspec archive) are both included in the commit
  // that move-requests-dir will produce.
  const gitAddResult = await spawn("git", ["add", `${changesDirRel()}/`], { cwd });

  if (gitAddResult.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-openspec",
      detectedState: `git add ${changesDirRel()}/ failed (exit ${gitAddResult.exitCode})`,
      recommendedAction: `Check git error: ${gitAddResult.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
      resumeCommand: `specrunner finish ${slug}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  const withOrWithout = hasSpecFilesResult ? "with specs" : "without specs (--skip-specs)";
  return {
    ok: true,
    skipped: false,
    message: `openspec archive ${slug} completed (${withOrWithout}).`,
  };
}
