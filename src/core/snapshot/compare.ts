/**
 * Snapshot comparison — pure functions, no I/O.
 * T-04: compare.ts — no fs or child_process imports.
 *
 * Derives added / modified / deleted change sets from two DirectorySnapshots.
 * Rename estimation is intentionally NOT performed: moves are represented as delete + add.
 */
import type { DirectorySnapshot, SnapshotEntry } from "./types.js";

// ─── Change types ─────────────────────────────────────────────────────────────

export type ChangeKind = "added" | "modified" | "deleted";

export interface ChangeEntry {
  path: string;
  change: ChangeKind;
  /** Entry kind in the candidate (for added/modified). */
  kind?: string;
  /** Entry kind in the baseline (for deleted, or when kind changed). */
  previousKind?: string;
  /** Mode in the candidate (for added/modified). */
  mode?: string;
  /** Mode in the baseline (for deleted/modified-mode). */
  previousMode?: string;
  /** Content digest in the baseline (modified/deleted). */
  baselineDigest?: string;
  /** Content digest in the candidate (added/modified). */
  candidateDigest?: string;
  /** Symlink target in the candidate. */
  symlinkTarget?: string;
  /** Symlink target in the baseline. */
  previousSymlinkTarget?: string;
}

export type ChangeSetResult =
  | { kind: "ok"; changes: readonly ChangeEntry[] }
  | { kind: "unavailable"; reason: string };

// ─── Comparison ───────────────────────────────────────────────────────────────

/**
 * Derive the change set between two snapshots.
 *
 * Rules:
 * - If snapshot exclusions differ: returns "unavailable" (comparison not meaningful).
 * - Added: path present in candidate but not baseline.
 * - Deleted: path present in baseline but not candidate.
 * - Modified: same path, same kind, but different contentDigest or mode.
 *   - Mode-only change: modified with both mode and previousMode set.
 * - Kind change (e.g. file → symlink): deleted (baseline kind) + added (candidate kind).
 *   The added entry carries previousKind for informational purposes.
 * - Output is sorted by path (UTF-8 byte order) and deterministic.
 * - No rename estimation: moves appear as delete + add.
 */
export function deriveChangeSet(
  baseline: DirectorySnapshot,
  candidate: DirectorySnapshot,
): ChangeSetResult {
  // Fail-closed: cannot compare snapshots with different exclusion sets
  if (!exclusionsEqual(baseline.exclusions, candidate.exclusions)) {
    return {
      kind: "unavailable",
      reason:
        "Cannot compare snapshots with different exclusions: " +
        `baseline=[${[...baseline.exclusions].sort().join(",")}] ` +
        `candidate=[${[...candidate.exclusions].sort().join(",")}]`,
    };
  }

  const baseMap = buildMap(baseline.entries);
  const candMap = buildMap(candidate.entries);

  const changes: ChangeEntry[] = [];

  // Check all baseline entries: deleted or modified
  for (const [path, baseEntry] of baseMap) {
    const candEntry = candMap.get(path);

    if (candEntry === undefined) {
      // Deleted
      changes.push({
        path,
        change: "deleted",
        previousKind: baseEntry.kind,
        previousMode: baseEntry.mode,
        baselineDigest: baseEntry.contentDigest,
        previousSymlinkTarget: baseEntry.symlinkTarget,
      });
    } else if (candEntry.kind !== baseEntry.kind) {
      // Kind change: represent as deleted + added
      changes.push({
        path,
        change: "deleted",
        previousKind: baseEntry.kind,
        previousMode: baseEntry.mode,
        baselineDigest: baseEntry.contentDigest,
        previousSymlinkTarget: baseEntry.symlinkTarget,
      });
      changes.push({
        path,
        change: "added",
        kind: candEntry.kind,
        previousKind: baseEntry.kind, // informational
        mode: candEntry.mode,
        candidateDigest: candEntry.contentDigest,
        symlinkTarget: candEntry.symlinkTarget,
      });
    } else {
      // Same kind: check for modification
      const digestChanged = candEntry.contentDigest !== baseEntry.contentDigest;
      const modeChanged = candEntry.mode !== baseEntry.mode;
      const targetChanged = candEntry.symlinkTarget !== baseEntry.symlinkTarget;

      if (digestChanged || modeChanged || targetChanged) {
        changes.push({
          path,
          change: "modified",
          kind: candEntry.kind,
          mode: candEntry.mode,
          previousMode: modeChanged ? baseEntry.mode : undefined,
          baselineDigest: baseEntry.contentDigest,
          candidateDigest: candEntry.contentDigest,
          symlinkTarget: candEntry.symlinkTarget,
          previousSymlinkTarget: targetChanged ? baseEntry.symlinkTarget : undefined,
        });
      }
    }
  }

  // Check candidate entries not in baseline: added
  for (const [path, candEntry] of candMap) {
    if (!baseMap.has(path)) {
      changes.push({
        path,
        change: "added",
        kind: candEntry.kind,
        mode: candEntry.mode,
        candidateDigest: candEntry.contentDigest,
        symlinkTarget: candEntry.symlinkTarget,
      });
    }
  }

  // Sort by path (UTF-8 byte order)
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { kind: "ok", changes };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMap(entries: readonly SnapshotEntry[]): Map<string, SnapshotEntry> {
  const map = new Map<string, SnapshotEntry>();
  for (const entry of entries) {
    map.set(entry.path, entry);
  }
  return map;
}

function exclusionsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}
