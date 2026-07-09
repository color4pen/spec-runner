/**
 * Main-checkout guard: pure helper module for monitored-path resolution and
 * before/after snapshot diff.
 *
 * Design D2: I/O is confined to the RuntimeStrategy seam (LocalRuntime.snapshotMainCheckoutGuard).
 * This module is pure — no fs / child_process imports.
 *
 * Layer dependencies (all existing, permitted edges):
 *   step → port   : MainCheckoutGuardSnapshot
 *   step → config : resolvePipelineForbiddenSurfaces
 *   step → reviewers: matchGlob
 */

import type { MainCheckoutGuardSnapshot } from "../port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import { resolvePipelineForbiddenSurfaces } from "../../config/schema.js";
import { matchGlob } from "../reviewers/glob-match.js";

// ---------------------------------------------------------------------------
// GuardDrift
// ---------------------------------------------------------------------------

export interface GuardDrift {
  drifted: boolean;
  changes: { path: string; kind: "created" | "modified" | "deleted" }[];
}

// ---------------------------------------------------------------------------
// resolveMonitoredGuardGlobs
// ---------------------------------------------------------------------------

/**
 * Resolve the set of glob patterns to monitor on main checkout.
 *
 * Monitoring set = union of:
 *   1. All `paths` from config.pipeline.fast.forbiddenSurfaces (via literal "fast")
 *   2. `.specrunner/**` (self-configuration guard)
 *
 * Pipeline-profile independent: the literal "fast" accesses the only location
 * where forbiddenSurfaces are declared; other pipeline profiles do not change
 * which paths are guarded. Deduplicated to avoid redundant glob evaluations.
 *
 * D3: monitors the same surface regardless of the active pipeline id.
 */
export function resolveMonitoredGuardGlobs(config: SpecRunnerConfig): string[] {
  const surfaces = resolvePipelineForbiddenSurfaces(config, "fast");
  const paths: string[] = [];
  for (const surface of surfaces) {
    for (const p of surface.paths) {
      paths.push(p);
    }
  }
  paths.push(".specrunner/**");

  // Dedupe preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      result.push(p);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// matchesMonitored
// ---------------------------------------------------------------------------

/**
 * Test whether a file path matches any of the monitored glob patterns.
 */
export function matchesMonitored(filePath: string, globs: string[]): boolean {
  for (const g of globs) {
    if (matchGlob(g, filePath)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// diffGuardSnapshots
// ---------------------------------------------------------------------------

/**
 * Compute the drift between two main-checkout guard snapshots.
 *
 * Change-kind derivation (D4):
 *   - Path in after only (not in before)         → "created"
 *   - Path in before only (not in after)         → "modified" (went back to clean / committed)
 *   - Path in both, hashes differ                → "modified"
 *   - Path in both, after.hash === null (DELETED) and before.hash !== null → "deleted"
 *   - Path in both, same non-null hash           → no change (omitted)
 *   - Path in both, both null                    → no change (both deleted) (omitted)
 *
 * Returns changes sorted by path (ascending) for deterministic output.
 */
export function diffGuardSnapshots(
  before: MainCheckoutGuardSnapshot,
  after: MainCheckoutGuardSnapshot,
): GuardDrift {
  const beforeMap = new Map<string, string | null>();
  for (const e of before.entries) {
    beforeMap.set(e.path, e.hash);
  }
  const afterMap = new Map<string, string | null>();
  for (const e of after.entries) {
    afterMap.set(e.path, e.hash);
  }

  const changes: { path: string; kind: "created" | "modified" | "deleted" }[] = [];

  // Paths in after
  for (const [p, afterHash] of afterMap) {
    if (!beforeMap.has(p)) {
      // Only in after → created
      changes.push({ path: p, kind: "created" });
    } else {
      const beforeHash = beforeMap.get(p)!;
      if (afterHash === null && beforeHash !== null) {
        // Deleted: after is DELETED, before was present
        changes.push({ path: p, kind: "deleted" });
      } else if (afterHash !== beforeHash) {
        // Hashes differ (includes null→non-null, non-null→non-null with different values)
        changes.push({ path: p, kind: "modified" });
      }
      // else: same state → no drift
    }
  }

  // Paths only in before (not in after)
  for (const [p] of beforeMap) {
    if (!afterMap.has(p)) {
      changes.push({ path: p, kind: "modified" });
    }
  }

  // Sort by path for deterministic output
  changes.sort((a, b) => a.path.localeCompare(b.path));

  return { drifted: changes.length > 0, changes };
}
