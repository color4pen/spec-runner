/**
 * Derive pipeline usage entries from job state and write to usage.json.
 * Called during Phase 1 of finish, before archiveChangeFolder moves the files.
 */
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { deriveFromJobState, appendInvocation, readUsageFile } from "../usage/store.js";
import { usageJsonPath, changeFolderPath } from "../../util/paths.js";
import type { JobState } from "../../state/schema.js";

export interface DeriveUsageResult {
  ok: boolean;
  skipped: boolean;
  message: string;
}

/**
 * State file から pipeline usage entries を derive し、
 * changes/<slug>/usage.json に append する。
 * archive 前に呼ばれることを前提とする。
 */
export async function deriveAndWriteUsage(params: {
  jobId: string;
  slug: string;
  cwd: string;
  repoRoot: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<DeriveUsageResult> {
  const { jobId, slug, cwd, repoRoot, spawn, fs: finishFs } = params;

  // Check if change folder exists (skip if already archived)
  const changeFolderAbs = path.join(cwd, changeFolderPath(slug));
  const changeFolderExists = await finishFs.exists(changeFolderAbs);
  if (!changeFolderExists) {
    return { ok: true, skipped: true, message: `Change folder for ${slug} not found, skipping usage derivation.` };
  }

  // Load job state
  let state: JobState;
  try {
    const store = new JobStateStore(jobId, repoRoot);
    const loaded = await store.load();
    state = loaded as JobState;
  } catch {
    return { ok: true, skipped: true, message: `Could not load job state for ${jobId}, skipping usage derivation.` };
  }

  // Derive entries from job state
  let entries;
  try {
    entries = await deriveFromJobState(state);
  } catch {
    return { ok: true, skipped: true, message: `Could not derive usage entries for ${slug}, skipping.` };
  }

  if (entries.length === 0) {
    return { ok: true, skipped: true, message: `No step entries found for ${slug}, skipping usage derivation.` };
  }

  // Append entries to changes/<slug>/usage.json
  const usageJsonAbsPath = path.join(cwd, usageJsonPath(slug));
  try {
    for (const entry of entries) {
      await appendInvocation(usageJsonAbsPath, entry);
    }
  } catch {
    // Best-effort: failure must not block finish
    return { ok: true, skipped: false, message: `Warning: failed to write usage.json for ${slug}.` };
  }

  // Stage usage.json
  try {
    await spawn("git", ["add", usageJsonPath(slug)], { cwd });
  } catch {
    // Best-effort staging — archive will include usage.json regardless
  }

  return { ok: true, skipped: false, message: `Derived ${entries.length} usage entries for ${slug}.` };
}
