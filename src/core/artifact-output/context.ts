/**
 * Snapshot-derived context builder for agent and reviewer prompts.
 * T-08: context.ts — pure function, no I/O.
 *
 * Replaces git-history context with snapshot-derived revision identity.
 */
import type { ChangeEntry } from "../snapshot/compare.js";
import type { PatchEntryResult } from "./patch.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapshotContextInput {
  baselineDigest: string;
  candidateDigest: string;
  changes: readonly ChangeEntry[];
  patchEntries?: readonly PatchEntryResult[];
  patchExcerptLimit?: number;
}

export interface SnapshotContextOutput {
  /** Full context string for injection into agent/reviewer prompts. */
  contextBlock: string;
  /** Structured context data. */
  data: {
    baselineDigest: string;
    candidateDigest: string;
    changedPaths: string[];
    nonTextEntries: string[];
    historySection: string;
  };
}

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Build a context block derived from snapshot revision identity.
 *
 * The history section is always an explicit statement (never an empty string),
 * clarifying that no revision history exists in this profile.
 */
export function buildSnapshotContext(input: SnapshotContextInput): SnapshotContextOutput {
  const { baselineDigest, candidateDigest, changes, patchEntries = [] } = input;

  const changedPaths = changes.map((c) => `${c.change}: ${c.path}`);

  const nonTextPaths = patchEntries
    .filter(
      (e) =>
        e.classification === "omitted:binary" ||
        e.classification === "omitted:binary-deletion" ||
        e.classification === "not-applicable",
    )
    .map((e) => `${e.classification}: ${e.path}`);

  const historySection =
    "No revision history available. This run uses snapshot-digest revision identity " +
    "(artifact-output profile). There is no git commit history, branch history, or " +
    "commit OID associated with these changes.";

  const contextBlock = [
    "## Snapshot Revision Context",
    "",
    `**Profile**: artifact-output (git-free)`,
    `**Baseline digest**: ${baselineDigest}`,
    `**Candidate digest**: ${candidateDigest}`,
    "",
    "### Changed files",
    changedPaths.length > 0
      ? changedPaths.map((p) => `- ${p}`).join("\n")
      : "(no changes)",
    "",
    "### Non-text / patch-omitted entries",
    nonTextPaths.length > 0
      ? nonTextPaths.map((p) => `- ${p}`).join("\n")
      : "(none)",
    "",
    "### Revision history",
    historySection,
    "",
  ].join("\n");

  return {
    contextBlock,
    data: {
      baselineDigest,
      candidateDigest,
      changedPaths,
      nonTextEntries: nonTextPaths,
      historySection,
    },
  };
}
