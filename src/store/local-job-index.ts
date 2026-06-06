/**
 * Sidecar index helper for job state resolution.
 *
 * Provides listLocalSidecars and resolveJobIdToSlug functions that index
 * local job state via .specrunner/local/<slug>/liveness.json (local runtime)
 * and .specrunner/local/<slug>/marker.json (managed runtime).
 *
 * Design constraints:
 *   - MUST NOT import from src/core/. Only fs and src/util/paths.ts are allowed.
 *   - All functions are read-only (no persist).
 *   - ENOENT on the base dir returns an empty array (never throws).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  localSidecarBaseDirRel,
  livenessJsonPath,
  managedMarkerPath,
} from "../util/paths.js";

/**
 * A single sidecar entry for a local or managed job.
 * Encodes jobId ↔ slug ↔ worktreePath identity.
 */
export interface LocalSidecarEntry {
  slug: string;
  jobId: string;
  worktreePath: string | null;
  kind: "local" | "managed";
}

/**
 * List all sidecar entries from .specrunner/local/*.
 *
 * For each slug directory found under the base dir:
 *   1. Try reading liveness.json  → kind="local"
 *   2. If absent/broken, try marker.json → kind="managed"
 *
 * Entries without a valid string `jobId` field, or with broken JSON, are silently
 * skipped. Returns an empty array if the base directory is absent (ENOENT).
 */
export async function listLocalSidecars(repoRoot: string): Promise<LocalSidecarEntry[]> {
  const baseDir = path.join(repoRoot, localSidecarBaseDirRel());

  let slugDirs: import("node:fs").Dirent[];
  try {
    slugDirs = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }

  const entries: LocalSidecarEntry[] = [];

  for (const entry of slugDirs) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;

    // 1. Try liveness.json first (local runtime)
    try {
      const livenessAbsPath = path.join(repoRoot, livenessJsonPath(slug));
      const raw = await fs.readFile(livenessAbsPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const jobId = typeof data["jobId"] === "string" ? data["jobId"] : null;
      if (!jobId) continue;
      const worktreePath =
        typeof data["worktreePath"] === "string" ? data["worktreePath"] : null;
      entries.push({ slug, jobId, worktreePath, kind: "local" });
      continue;
    } catch {
      // No liveness.json or broken — fall through to marker.json
    }

    // 2. Try marker.json (managed runtime)
    try {
      const markerAbsPath = path.join(repoRoot, managedMarkerPath(slug));
      const raw = await fs.readFile(markerAbsPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const jobId = typeof data["jobId"] === "string" ? data["jobId"] : null;
      if (!jobId) continue;
      entries.push({ slug, jobId, worktreePath: null, kind: "managed" });
    } catch {
      // No marker.json or broken — skip this slug dir entirely
    }
  }

  return entries;
}

/**
 * Resolve a jobId to a sidecar entry by scanning .specrunner/local/*.
 *
 * Returns the first entry whose jobId matches, or null if not found.
 * Never throws.
 */
export async function resolveJobIdToSlug(
  repoRoot: string,
  jobId: string,
): Promise<LocalSidecarEntry | null> {
  const entries = await listLocalSidecars(repoRoot);
  return entries.find((e) => e.jobId === jobId) ?? null;
}
