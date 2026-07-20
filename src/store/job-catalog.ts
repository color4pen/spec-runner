import * as fs from "node:fs/promises";
import * as path from "node:path";
import { composeSplitLayout } from "./job-state-projection.js";
import { listLocalSidecars } from "./local-job-index.js";
import type { ListedJobEntry } from "./job-state-store.js";
import type { JobState } from "../state/schema.js";
import {
  slugStateJsonPath,
  slugEventsPath,
  changeFolderPath,
  parseArchiveDirName,
  managedMarkerPath,
  localSlugStateJsonPath,
  localSlugEventsPath,
} from "../util/paths.js";
import { SpecRunnerError, ERROR_CODES, ambiguousJobIdError } from "../errors.js";

/**
 * Catalog of all known jobs. Provides static methods for listing and ID resolution.
 * Extracted from JobStateStore to isolate job-discovery logic.
 */
export class JobCatalog {
  /**
   * List all valid job states from slug-based stores, paired with their source change directory.
   * Scans (1) slug-based states in current checkout and local worktrees,
   * (2) archived states (only when opts.includeArchived === true),
   * (3) machine-local sidecar supplement, (4) managed markers.
   * Deduplicates by jobId: newest updatedAt wins.
   *
   * Each entry carries the absolute sourceChangeDir from which the state was loaded,
   * so callers can resolve per-job artifacts (e.g. usage.json) without slug re-lookup.
   *
   * By default archived states are skipped entirely (no directory scan).
   * Pass { includeArchived: true } to include archived states (e.g. --all, job show).
   */
  static async listWithSourceDirs(
    repoRoot: string,
    opts?: { includeArchived?: boolean },
  ): Promise<ListedJobEntry[]> {
    const entryMap = new Map<string, ListedJobEntry>(); // jobId → most-recent entry

    const tryMerge = (state: JobState, sourceChangeDir: string) => {
      const existing = entryMap.get(state.jobId);
      if (!existing || new Date(state.updatedAt) > new Date(existing.state.updatedAt)) {
        entryMap.set(state.jobId, { state, sourceChangeDir });
      }
    };

    // 1. Slug-based states in current checkout (specrunner/changes/*/state.json)
    const changesDir = path.join(repoRoot, "specrunner", "changes");
    try {
      const entries = await fs.readdir(changesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === "archive" || entry.name === "canceled") continue;
        const slug = entry.name;
        const stateJsonPath = path.join(repoRoot, slugStateJsonPath(slug));
        const eventsPath = path.join(repoRoot, slugEventsPath(slug));
        const sourceChangeDir = path.join(repoRoot, "specrunner", "changes", slug);
        try {
          const { state } = await composeSplitLayout(stateJsonPath, eventsPath, { slug, stateRoot: repoRoot });
          tryMerge(state, sourceChangeDir);
        } catch {
          // Skip malformed slug state in current checkout
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    // 1b. Archived states in current checkout (specrunner/changes/archive/*/state.json)
    // Only scanned when opts.includeArchived === true to avoid O(archive-size) cost on every list().
    if (opts?.includeArchived === true) {
      const archiveDir = path.join(repoRoot, "specrunner", "changes", "archive");
      try {
        const archiveEntries = await fs.readdir(archiveDir, { withFileTypes: true });
        for (const entry of archiveEntries) {
          if (!entry.isDirectory()) continue;
          const datedSlug = entry.name;
          // Extract slug from "<YYYY-MM-DD>-<slug>" (strip date prefix if present)
          const { slug: archiveSlug } = parseArchiveDirName(datedSlug);
          const stateJsonPath = path.join(archiveDir, datedSlug, "state.json");
          const eventsPath = path.join(archiveDir, datedSlug, "events.jsonl");
          const sourceChangeDir = path.join(archiveDir, datedSlug);
          try {
            const { state } = await composeSplitLayout(stateJsonPath, eventsPath, { slug: archiveSlug, stateRoot: repoRoot });
            tryMerge(state, sourceChangeDir);
          } catch {
            // Skip malformed archive state
          }
        }
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw err;
      }
    }

    // 2. Slug-based states in local worktrees (.git/specrunner-worktrees/*/specrunner/changes/*/state.json)
    const worktreesDir = path.join(repoRoot, ".git", "specrunner-worktrees");
    try {
      const worktreeDirs = await fs.readdir(worktreesDir, { withFileTypes: true });
      for (const worktreeEntry of worktreeDirs) {
        if (!worktreeEntry.isDirectory()) continue;
        const worktreePath = path.join(worktreesDir, worktreeEntry.name);
        const changesInWorktree = path.join(worktreePath, "specrunner", "changes");
        try {
          const slugEntries = await fs.readdir(changesInWorktree, { withFileTypes: true });
          for (const slugEntry of slugEntries) {
            if (!slugEntry.isDirectory() || slugEntry.name === "archive" || slugEntry.name === "canceled") continue;
            const slug = slugEntry.name;
            const stateJsonPath = path.join(worktreePath, slugStateJsonPath(slug));
            const eventsPath = path.join(worktreePath, slugEventsPath(slug));
            const sourceChangeDir = path.join(worktreePath, "specrunner", "changes", slug);
            try {
              const { state } = await composeSplitLayout(stateJsonPath, eventsPath, { slug, stateRoot: worktreePath });
              tryMerge(state, sourceChangeDir);
            } catch {
              // Skip malformed worktree slug state
            }
          }
        } catch {
          // Worktree has no changes dir — skip
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    // 2b. Archived states in local worktrees (.git/specrunner-worktrees/*/specrunner/changes/archive/*/state.json)
    // Symmetric with section 1b: only scanned when opts.includeArchived === true.
    // This is the key section that makes --with-merge recovery work: after archive-record, the
    // change folder lives in the worktree archive/ dir (status still awaiting-archive), and this
    // scan makes it findable so `archive --with-merge` can re-resolve it after a merge failure.
    if (opts?.includeArchived === true) {
      // Reuse the worktrees dir already computed above (path unchanged)
      const worktreesDirForArchive = path.join(repoRoot, ".git", "specrunner-worktrees");
      try {
        const worktreeDirsForArchive = await fs.readdir(worktreesDirForArchive, { withFileTypes: true });
        for (const worktreeEntry of worktreeDirsForArchive) {
          if (!worktreeEntry.isDirectory()) continue;
          const worktreePath = path.join(worktreesDirForArchive, worktreeEntry.name);
          const archiveInWorktree = path.join(worktreePath, "specrunner", "changes", "archive");
          try {
            const archiveEntries = await fs.readdir(archiveInWorktree, { withFileTypes: true });
            for (const archiveEntry of archiveEntries) {
              if (!archiveEntry.isDirectory()) continue;
              const datedSlug = archiveEntry.name;
              const { slug: archiveSlug } = parseArchiveDirName(datedSlug);
              const stateJsonPath = path.join(archiveInWorktree, datedSlug, "state.json");
              const eventsPath = path.join(archiveInWorktree, datedSlug, "events.jsonl");
              const sourceChangeDir = path.join(archiveInWorktree, datedSlug);
              try {
                const { state } = await composeSplitLayout(stateJsonPath, eventsPath, {
                  slug: archiveSlug,
                  stateRoot: worktreePath,
                });
                tryMerge(state, sourceChangeDir);
              } catch {
                // Skip malformed worktree archive state
              }
            }
          } catch {
            // Worktree has no archive dir — skip
          }
        }
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw err;
      }
    }

    // 3. Sidecar supplement (D2): for local entries not yet in entryMap, try worktreePath slug dir.
    // Sections 1/1b/2 cover main-checkout active, archived, and standard worktrees.
    // This supplement adds coverage for non-standard worktree paths and future edge cases.
    const localSidecars = await listLocalSidecars(repoRoot);
    for (const sidecarEntry of localSidecars) {
      if (sidecarEntry.kind !== "local") continue; // managed handled by section 4
      if (entryMap.has(sidecarEntry.jobId)) continue; // already found
      if (!sidecarEntry.worktreePath) continue; // no worktree to try

      const sidecarStateJsonPath = path.join(sidecarEntry.worktreePath, slugStateJsonPath(sidecarEntry.slug));
      const sidecarEventsPath = path.join(sidecarEntry.worktreePath, slugEventsPath(sidecarEntry.slug));
      const sourceChangeDir = path.join(sidecarEntry.worktreePath, "specrunner", "changes", sidecarEntry.slug);
      try {
        const { state } = await composeSplitLayout(sidecarStateJsonPath, sidecarEventsPath, {
          slug: sidecarEntry.slug,
          stateRoot: sidecarEntry.worktreePath,
        });
        tryMerge(state, sourceChangeDir);
      } catch {
        // Worktree slug dir not accessible — state not available, skip (jobId preserved in resolveId)
      }
    }

    // 4. Managed markers (.specrunner/local/<slug>/marker.json) — D7
    // Enumerate local managed job markers to find managed active jobs.
    // For each marker, try to load state from the co-located .specrunner/local/<slug>/state.json.
    const localSidecarBase = path.join(repoRoot, ".specrunner", "local");
    try {
      const localEntries = await fs.readdir(localSidecarBase, { withFileTypes: true });
      for (const localEntry of localEntries) {
        if (!localEntry.isDirectory()) continue;
        const slug = localEntry.name;
        const markerAbsPath = path.join(repoRoot, managedMarkerPath(slug));
        try {
          const markerRaw = await fs.readFile(markerAbsPath, "utf-8");
          const marker = JSON.parse(markerRaw) as Record<string, unknown>;
          const markerJobId = typeof marker["jobId"] === "string" ? marker["jobId"] : null;
          if (!markerJobId) continue;

          // Skip if already found by another scan (dedup by jobId)
          if (entryMap.has(markerJobId)) continue;

          // Try to load from co-located .specrunner/local/<slug>/state.json (D4)
          const markerStateJsonPath = path.join(repoRoot, localSlugStateJsonPath(slug));
          const markerEventsPath = path.join(repoRoot, localSlugEventsPath(slug));
          const sourceChangeDir = path.join(repoRoot, changeFolderPath(slug));
          try {
            const { state } = await composeSplitLayout(markerStateJsonPath, markerEventsPath);
            tryMerge(state, sourceChangeDir);
          } catch {
            // State file not found locally — skip; marker alone cannot reconstruct full state
          }
        } catch {
          // Skip malformed or missing marker
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    return Array.from(entryMap.values());
  }

  /**
   * List all valid job states from slug-based stores.
   * Scans (1) slug-based states in current checkout and local worktrees,
   * (2) archived states (only when opts.includeArchived === true),
   * (3) machine-local sidecar supplement, (4) managed markers.
   * Deduplicates by jobId: newest updatedAt wins.
   *
   * By default archived states are skipped entirely (no directory scan).
   * Pass { includeArchived: true } to include archived states (e.g. --all, job show).
   */
  static async list(repoRoot: string, opts?: { includeArchived?: boolean }): Promise<JobState[]> {
    const entries = await JobCatalog.listWithSourceDirs(repoRoot, opts);
    return entries.map((e) => e.state);
  }

  /**
   * Resolve a full job UUID from a prefix (short ID) or full UUID.
   *
   * - Full UUID (36 chars): returned as-is without calling list() or sidecar index.
   * - Short prefix: candidate set = list() jobIds ∪ sidecar index jobIds (dedup).
   *   - 0 matches: throws JOB_NOT_FOUND
   *   - 1 match: returns the full UUID
   *   - 2+ matches: throws AMBIGUOUS_JOB_ID with candidate list in hint
   *
   * The sidecar union ensures degraded local jobs (worktree deleted, not yet archived)
   * whose jobId is only in liveness.json are still prefix-resolvable (requirement 5).
   */
  static async resolveId(repoRoot: string, prefix: string): Promise<string> {
    // Full UUID v4 is exactly 36 characters (8-4-4-4-12 + 4 hyphens)
    if (prefix.length === 36) {
      return prefix;
    }

    // Candidate set: list() jobIds ∪ sidecar index jobIds (D3)
    // includeArchived: true so archived jobs remain resolvable by prefix.
    const [states, sidecarEntries] = await Promise.all([
      JobCatalog.list(repoRoot, { includeArchived: true }),
      listLocalSidecars(repoRoot),
    ]);

    const candidateIds = new Set<string>(states.map((s) => s.jobId));
    for (const entry of sidecarEntries) {
      candidateIds.add(entry.jobId);
    }

    const matches = Array.from(candidateIds).filter((id) => id.startsWith(prefix));

    if (matches.length === 0) {
      throw new SpecRunnerError(
        ERROR_CODES.JOB_NOT_FOUND,
        "Run specrunner job ls to list available job IDs.",
        `Job not found: no job ID starts with '${prefix}'`,
      );
    }

    if (matches.length === 1) {
      return matches[0]!;
    }

    throw ambiguousJobIdError(prefix, matches);
  }
}
