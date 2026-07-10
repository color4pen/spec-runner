/**
 * Journal integrity helpers.
 *
 * Provides:
 *   - CounterReversal — a fold count dropping below a stored counter
 *   - JournalIntegrityIssue — union of corrupt-record and counter-reversal
 *   - detectCounterReversal() — compare fold result against stored _journal counters
 *   - describeJournalIssue() — one-line human description for error messages / doctor output
 *   - inspectJournalDir() — probe a change folder for any journal integrity issue
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fold } from "./event-journal.js";
import type { FoldCorruption, FoldResult } from "./event-journal.js";

export type { FoldCorruption };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A fold count that dropped below its stored counter — signals journal truncation.
 */
export interface CounterReversal {
  field: "history" | "step";
  /** Step name (only when field === "step"). */
  step?: string;
  /** The value in stored _journal counters. */
  stored: number;
  /** The value the fold actually produced (less than stored). */
  actual: number;
}

/** Union of detectable journal integrity issues. */
export type JournalIntegrityIssue =
  | { kind: "corrupt-record"; corruption: FoldCorruption }
  | { kind: "counter-reversal"; reversal: CounterReversal };

// ---------------------------------------------------------------------------
// detectCounterReversal
// ---------------------------------------------------------------------------

/**
 * Compare fold result counts against stored _journal counters.
 *
 * Returns the first reversal found (history first, then steps in iteration order),
 * or null when every fold count is >= its stored count.
 *
 * A fold count ABOVE stored is crash-recovery (normal after resume) — not a reversal.
 */
export function detectCounterReversal(
  stored: { historyCount: number; stepCounts: Record<string, number> },
  foldResult: FoldResult,
): CounterReversal | null {
  // History reversal
  if (foldResult.historyCount < stored.historyCount) {
    return {
      field: "history",
      stored: stored.historyCount,
      actual: foldResult.historyCount,
    };
  }

  // Step reversals (check steps that appear in stored counts)
  for (const [step, storedCount] of Object.entries(stored.stepCounts)) {
    const actualCount = foldResult.stepCounts[step] ?? 0;
    if (actualCount < storedCount) {
      return {
        field: "step",
        step,
        stored: storedCount,
        actual: actualCount,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// describeJournalIssue
// ---------------------------------------------------------------------------

/**
 * Return a one-line human-readable description of a journal integrity issue.
 * Used in error messages and doctor output.
 */
export function describeJournalIssue(issue: JournalIntegrityIssue): string {
  if (issue.kind === "corrupt-record") {
    const { corruption } = issue;
    return `corrupt record at line ${corruption.lineIndex} (${corruption.reason}): ${corruption.snippet}`;
  } else {
    const { reversal } = issue;
    if (reversal.field === "history") {
      return `journal truncated: history count ${reversal.actual} < recorded ${reversal.stored}`;
    } else {
      return `journal truncated: step '${reversal.step}' count ${reversal.actual} < recorded ${reversal.stored}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Scan types (used by the doctor check; kept here so src/core/ need not import node:fs)
// ---------------------------------------------------------------------------

/** A journal integrity issue found during a directory scan. */
export interface JournalFinding {
  /** Absolute path to the change folder with the issue. */
  location: string;
  /** Slug (or dated-slug for archive entries). */
  slug: string;
  /** The detected issue. */
  issue: JournalIntegrityIssue;
}

/** Scan function signature for dependency injection in tests. */
export type ScanFn = (ctx: { repoRoot: string }) => Promise<JournalFinding[]>;

/**
 * Enumerate all known change folders and collect integrity issues.
 *
 * Scans:
 *   active:    repoRoot/specrunner/changes/[slug]  (skip archive, canceled)
 *   worktrees: repoRoot/.git/specrunner-worktrees/[wt]/specrunner/changes/[slug]  (same skips)
 *   archive:   repoRoot/specrunner/changes/archive/[dated-slug]
 */
export async function scanJournalIntegrity({ repoRoot }: { repoRoot: string }): Promise<JournalFinding[]> {
  const findings: JournalFinding[] = [];

  // ── Active changes ────────────────────────────────────────────────────────
  const changesDir = path.join(repoRoot, "specrunner", "changes");
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "archive" || entry.name === "canceled") continue;
      const slug = entry.name;
      const dir = path.join(changesDir, slug);
      const issue = await inspectJournalDir(dir);
      if (issue !== null) {
        findings.push({ location: dir, slug, issue });
      }
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  // ── Worktrees ─────────────────────────────────────────────────────────────
  const worktreesDir = path.join(repoRoot, ".git", "specrunner-worktrees");
  try {
    const worktreeDirs = await fs.readdir(worktreesDir, { withFileTypes: true });
    for (const wtEntry of worktreeDirs) {
      if (!wtEntry.isDirectory()) continue;
      const changesInWt = path.join(worktreesDir, wtEntry.name, "specrunner", "changes");
      try {
        const slugEntries = await fs.readdir(changesInWt, { withFileTypes: true });
        for (const slugEntry of slugEntries) {
          if (!slugEntry.isDirectory()) continue;
          if (slugEntry.name === "archive" || slugEntry.name === "canceled") continue;
          const slug = slugEntry.name;
          const dir = path.join(changesInWt, slug);
          const issue = await inspectJournalDir(dir);
          if (issue !== null) {
            findings.push({ location: dir, slug, issue });
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

  // ── Archive ───────────────────────────────────────────────────────────────
  const archiveDir = path.join(repoRoot, "specrunner", "changes", "archive");
  try {
    const archiveEntries = await fs.readdir(archiveDir, { withFileTypes: true });
    for (const entry of archiveEntries) {
      if (!entry.isDirectory()) continue;
      const datedSlug = entry.name;
      const dir = path.join(archiveDir, datedSlug);
      const issue = await inspectJournalDir(dir);
      if (issue !== null) {
        findings.push({ location: dir, slug: datedSlug, issue });
      }
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  return findings;
}

// ---------------------------------------------------------------------------
// inspectJournalDir
// ---------------------------------------------------------------------------

/**
 * Probe a change folder for any journal integrity issue.
 *
 * Resolution:
 *   1. Read `dir/events.jsonl` — if missing (ENOENT), return null (no journal = no issue).
 *   2. fold() the content — if corruption is set, return corrupt-record issue.
 *   3. Read `dir/state.json` — if missing or malformed, skip the counter-reversal check.
 *   4. Compare stored _journal counters against fold counts — return counter-reversal if any.
 *
 * Never throws: all I/O errors are caught and treated as "no issue detectable".
 */
export async function inspectJournalDir(dir: string): Promise<JournalIntegrityIssue | null> {
  const eventsPath = path.join(dir, "events.jsonl");

  // Step 1: Read events.jsonl
  let content: string;
  try {
    content = await fs.readFile(eventsPath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null; // No journal — no issue
    return null; // Other I/O error — treat as no issue (defensive)
  }

  // Step 2: Fold and check for corruption
  const foldResult = fold(content);
  if (foldResult.corruption) {
    return { kind: "corrupt-record", corruption: foldResult.corruption };
  }

  // Step 3: Read state.json for counter reversal check
  const stateJsonPath = path.join(dir, "state.json");
  try {
    const raw = await fs.readFile(stateJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const journalField = parsed["_journal"];
    if (!journalField || typeof journalField !== "object" || Array.isArray(journalField)) {
      return null; // No _journal counters — skip reversal check
    }
    const stored = journalField as { historyCount: number; stepCounts: Record<string, number> };
    // Tolerate missing fields
    if (typeof stored.historyCount !== "number" || typeof stored.stepCounts !== "object") {
      return null;
    }

    // Step 4: Counter reversal check
    const reversal = detectCounterReversal(stored, foldResult);
    if (reversal !== null) {
      return { kind: "counter-reversal", reversal };
    }
  } catch {
    // Missing or malformed state.json — skip reversal check
  }

  return null;
}
