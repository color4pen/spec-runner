/**
 * scanSlugOccupancy: enumerate all state records for a given slug and classify
 * them into non-terminal vs terminal occupants.
 *
 * Candidate locations scanned (real path):
 *   1. main checkout:  specrunner/changes/<slug>/state.json
 *   2. worktrees:      .git/specrunner-worktrees/<wt>/specrunner/changes/<slug>/state.json
 *   3. managed local:  .specrunner/local/<slug>/state.json
 *
 * Deduplicates by jobId (newest updatedAt wins).
 * Fail-closed: a present-but-unparseable state → sets unreadable (not silently skipped).
 * ENOENT (absent) is not unreadable.
 *
 * Design D4: overrideEntries dep allows deterministic unit testing without real fs.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
import type { JobStatus } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OccupantRef {
  jobId: string;
  /** JobStatus string */
  status: string;
  updatedAt: string;
  pid: number | null;
  worktreePath: string | null;
}

export interface OccupancyScanResult {
  slug: string;
  nonTerminal: OccupantRef[];
  terminal: OccupantRef[];
  /** Non-null when a present state could not be parsed. */
  unreadable: string | null;
}

/**
 * Injectable deps for deterministic testing.
 *
 * When `overrideEntries` is set, the real fs scan is skipped entirely and
 * these entries are used directly (after dedup by jobId).
 */
export interface ScanSlugOccupancyDeps {
  overrideEntries?: {
    entries: OccupantRef[];
    unreadable: string | null;
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Scan the slug's candidate state locations and return the occupancy result.
 */
export async function scanSlugOccupancy(
  repoRoot: string,
  slug: string,
  deps?: ScanSlugOccupancyDeps,
): Promise<OccupancyScanResult> {
  // Injected override path (unit tests)
  if (deps?.overrideEntries !== undefined) {
    const { entries, unreadable } = deps.overrideEntries;
    const deduped = deduplicateByJobId(entries);
    return classify(slug, deduped, unreadable);
  }

  // Real fs scan
  const allEntries: OccupantRef[] = [];
  let unreadable: string | null = null;

  // 1. Main checkout: specrunner/changes/<slug>/state.json
  const mainStateJsonPath = path.join(repoRoot, "specrunner", "changes", slug, "state.json");
  const mainResult = await tryReadStateJson(mainStateJsonPath);
  if (mainResult.entry) {
    allEntries.push(mainResult.entry);
  } else if (mainResult.unreadable) {
    unreadable = mainResult.unreadable;
  }

  // 2. Local worktrees: .git/specrunner-worktrees/<wt>/specrunner/changes/<slug>/state.json
  const worktreesDir = path.join(repoRoot, ".git", "specrunner-worktrees");
  try {
    const wtEntries = await fs.readdir(worktreesDir, { withFileTypes: true });
    for (const wtEntry of wtEntries) {
      if (!wtEntry.isDirectory()) continue;
      const wtStateJsonPath = path.join(
        worktreesDir,
        wtEntry.name,
        "specrunner",
        "changes",
        slug,
        "state.json",
      );
      const result = await tryReadStateJson(wtStateJsonPath);
      if (result.entry) {
        allEntries.push(result.entry);
      } else if (result.unreadable && !unreadable) {
        unreadable = result.unreadable;
      }
    }
  } catch (err) {
    // D4: only ENOENT (directory absent) is safe to swallow.
    // Non-ENOENT (EACCES, EIO, etc.) means the directory exists but is unreadable —
    // treat as unreadable to refuse start (fail-closed).
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && !unreadable) {
      unreadable = `worktrees enumeration failure at ${worktreesDir}: ${(err as Error).message}`;
    }
  }

  // 3. Machine-local managed state: .specrunner/local/<slug>/state.json
  const localStateJsonPath = path.join(repoRoot, ".specrunner", "local", slug, "state.json");
  const localResult = await tryReadStateJson(localStateJsonPath);
  if (localResult.entry) {
    allEntries.push(localResult.entry);
  } else if (localResult.unreadable && !unreadable) {
    unreadable = localResult.unreadable;
  }

  const deduped = deduplicateByJobId(allEntries);
  return classify(slug, deduped, unreadable);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ReadResult {
  entry: OccupantRef | null;
  unreadable: string | null;
}

async function tryReadStateJson(absPath: string): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await fs.readFile(absPath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { entry: null, unreadable: null };
    }
    return { entry: null, unreadable: `read failure at ${absPath}: ${(err as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    return {
      entry: null,
      unreadable: `JSON parse failure at ${absPath}: ${(parseErr as Error).message}`,
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { entry: null, unreadable: `invalid state shape at ${absPath}` };
  }

  const obj = parsed as Record<string, unknown>;
  const jobId = typeof obj["jobId"] === "string" ? obj["jobId"] : null;
  const status = typeof obj["status"] === "string" ? obj["status"] : null;
  const updatedAt = typeof obj["updatedAt"] === "string" ? obj["updatedAt"] : new Date(0).toISOString();

  if (!jobId || !status) {
    return { entry: null, unreadable: `missing jobId or status at ${absPath}` };
  }

  const entry: OccupantRef = {
    jobId,
    status,
    updatedAt,
    pid: typeof obj["pid"] === "number" ? obj["pid"] : null,
    worktreePath: typeof obj["worktreePath"] === "string" ? obj["worktreePath"] : null,
  };

  return { entry, unreadable: null };
}

function deduplicateByJobId(entries: OccupantRef[]): OccupantRef[] {
  const byJobId = new Map<string, OccupantRef>();
  for (const entry of entries) {
    const existing = byJobId.get(entry.jobId);
    if (!existing || new Date(entry.updatedAt) > new Date(existing.updatedAt)) {
      byJobId.set(entry.jobId, entry);
    }
  }
  return [...byJobId.values()];
}

function classify(
  slug: string,
  entries: OccupantRef[],
  unreadable: string | null,
): OccupancyScanResult {
  const nonTerminal = entries.filter((e) => !TERMINAL_STATUSES.has(e.status as JobStatus));
  const terminal = entries.filter((e) => TERMINAL_STATUSES.has(e.status as JobStatus));
  return { slug, nonTerminal, terminal, unreadable };
}
