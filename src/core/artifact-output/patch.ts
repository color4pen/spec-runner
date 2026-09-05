/**
 * Patch builder for the artifact-output profile.
 * T-07: patch.ts — generates changes.patch and classifies each change entry.
 *
 * Patch entry classifications (D8 table):
 *   "included"          - text file modification/addition with diff
 *   "included:deletion" - text file deletion with deletion hunk
 *   "omitted:binary"    - binary file modification/addition (no diff; payload carries bytes)
 *   "omitted:binary-deletion" - binary file deletion (no diff; no payload)
 *   "omitted:size"      - text file too large for diff
 *   "not-applicable"    - symlink/dir/mode-only change (no text diff possible)
 */
import * as nodePath from "node:path";
import { classifyContent, buildUnifiedDiff } from "../../util/unified-diff.js";
import type { ChangeEntry } from "../snapshot/compare.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum file size (bytes) included in the unified diff. Files above this are "omitted:size". */
export const PATCH_MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KiB

// ─── Types ────────────────────────────────────────────────────────────────────

export type PatchClassification =
  | "included"
  | "included:deletion"
  | "omitted:binary"
  | "omitted:binary-deletion"
  | "omitted:size"
  | "not-applicable";

export interface PatchEntryResult {
  path: string;
  classification: PatchClassification;
  /** The diff contribution from this entry (may be empty string). */
  diffContribution: string;
}

export interface BuildPatchResult {
  /** The combined unified diff for all text changes. */
  patchText: string;
  /** Per-entry classification results. */
  entries: PatchEntryResult[];
}

// ─── Content reader seam ──────────────────────────────────────────────────────

/**
 * Seam for reading file content. Returns null if the file cannot be read.
 * Used for both baseline (source) and candidate reads.
 */
export type ReadFileFn = (absPath: string) => Promise<Uint8Array | null>;

// ─── Patch builder ────────────────────────────────────────────────────────────

/**
 * Build the changes.patch string and per-entry classifications from a change set.
 *
 * @param changes       - Change entries from deriveChangeSet.
 * @param candidateRoot - Root of the candidate workspace.
 * @param baselineRoot  - Root of the baseline (source) directory.
 * @param readFile      - File reading seam.
 */
export async function buildPatch(
  changes: readonly ChangeEntry[],
  candidateRoot: string,
  baselineRoot: string,
  readFile: ReadFileFn,
): Promise<BuildPatchResult> {
  const entryResults: PatchEntryResult[] = [];
  const diffParts: string[] = [];

  for (const change of changes) {
    const result = await classifyAndDiff(change, candidateRoot, baselineRoot, readFile);
    entryResults.push(result);
    if (result.diffContribution) {
      diffParts.push(result.diffContribution);
    }
  }

  return {
    patchText: diffParts.join(""),
    entries: entryResults,
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function classifyAndDiff(
  change: ChangeEntry,
  candidateRoot: string,
  baselineRoot: string,
  readFile: ReadFileFn,
): Promise<PatchEntryResult> {
  const { path, change: changeKind, kind, previousKind } = change;

  // Symlink or directory: not applicable for text diff
  const effectiveKind = kind ?? previousKind;
  if (effectiveKind === "symlink" || effectiveKind === "dir") {
    return { path, classification: "not-applicable", diffContribution: "" };
  }

  // Mode-only change: same digest (and both digests must be defined), mode changed
  if (
    changeKind === "modified" &&
    change.baselineDigest !== undefined &&
    change.candidateDigest !== undefined &&
    change.baselineDigest === change.candidateDigest &&
    change.mode !== change.previousMode
  ) {
    return { path, classification: "not-applicable", diffContribution: "" };
  }

  if (changeKind === "deleted") {
    // Read the baseline file
    const basePath = nodePath.join(baselineRoot, path);
    const bytes = await readFile(basePath);
    if (!bytes || bytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
      // Can't read or too large
      if (bytes && classifyContent(bytes) === "binary") {
        return { path, classification: "omitted:binary-deletion", diffContribution: "" };
      }
      // Unreadable or too large: omit
      return { path, classification: "omitted:size", diffContribution: "" };
    }

    if (classifyContent(bytes) === "binary") {
      return { path, classification: "omitted:binary-deletion", diffContribution: "" };
    }

    // Text deletion: include as deletion hunk
    const oldText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const diff = buildUnifiedDiff(oldText, "", { oldPath: path, newPath: "/dev/null" });
    return { path, classification: "included:deletion", diffContribution: diff };
  }

  if (changeKind === "added") {
    const candPath = nodePath.join(candidateRoot, path);
    const bytes = await readFile(candPath);
    if (!bytes) {
      return { path, classification: "not-applicable", diffContribution: "" };
    }
    if (bytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
      return { path, classification: "omitted:size", diffContribution: "" };
    }
    if (classifyContent(bytes) === "binary") {
      return { path, classification: "omitted:binary", diffContribution: "" };
    }
    const newText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const diff = buildUnifiedDiff("", newText, { oldPath: "/dev/null", newPath: path });
    return { path, classification: "included", diffContribution: diff };
  }

  // Modified
  const basePath = nodePath.join(baselineRoot, path);
  const candPath = nodePath.join(candidateRoot, path);
  const [baseBytes, candBytes] = await Promise.all([readFile(basePath), readFile(candPath)]);

  if (!baseBytes || !candBytes) {
    return { path, classification: "not-applicable", diffContribution: "" };
  }

  const baseIsBinary = classifyContent(baseBytes) === "binary";
  const candIsBinary = classifyContent(candBytes) === "binary";

  if (baseIsBinary || candIsBinary) {
    return { path, classification: "omitted:binary", diffContribution: "" };
  }

  if (baseBytes.length > PATCH_MAX_FILE_SIZE_BYTES || candBytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
    return { path, classification: "omitted:size", diffContribution: "" };
  }

  const oldText = new TextDecoder("utf-8", { fatal: false }).decode(baseBytes);
  const newText = new TextDecoder("utf-8", { fatal: false }).decode(candBytes);
  const diff = buildUnifiedDiff(oldText, newText, { oldPath: path, newPath: path });

  return { path, classification: "included", diffContribution: diff };
}
