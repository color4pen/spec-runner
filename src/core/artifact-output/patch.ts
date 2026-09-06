/**
 * Patch builder for the artifact-output profile.
 * T-07: patch.ts — generates changes.patch and classifies each change entry.
 *
 * Patch entry classifications (D8 table):
 *   "included"            - text file modification/addition with diff
 *   "included:deletion"   - text file deletion with deletion hunk
 *   "omitted:binary"      - binary file modification/addition (no diff; payload carries bytes)
 *   "omitted:binary-deletion" - binary file deletion (no diff; no payload)
 *   "omitted:size"          - text file too large for diff, or diff computation budget exceeded
 *                             (added/modified; payload carries bytes)
 *   "omitted:size-deletion" - deleted text file too large for diff hunk (D8 operator decision)
 *   "omitted:unreadable"    - file could not be read (I/O error; not a symlink/dir/mode change)
 *   "not-applicable"      - symlink/dir/mode-only change (no text diff possible)
 */
import * as nodePath from "node:path";
import { classifyContent, buildUnifiedDiffBounded } from "../../util/unified-diff.js";
import type { ChangeEntry, ChangeKind } from "../snapshot/compare.js";

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
  | "omitted:size-deletion"
  | "omitted:unreadable"
  | "not-applicable";

export interface PatchEntryResult {
  path: string;
  /**
   * Operation kind of the change entry this result belongs to. A kind change
   * (e.g. symlink → file) is represented as a `deleted` entry plus an `added`
   * entry with the SAME path, so consumers must key on (change, path), not path.
   */
  change: ChangeKind;
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

// ─── Text decoding ────────────────────────────────────────────────────────────

/**
 * Decode UTF-8 for diff purposes. `ignoreBOM: true` keeps a leading U+FEFF in the
 * decoded string so the diff reflects the actual bytes (the default decoder
 * silently strips it, which would drop a BOM addition/removal from the patch).
 */
const utf8Decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

function decodeText(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
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
    return { path, change: changeKind, classification: "not-applicable", diffContribution: "" };
  }

  // Mode-only change: same digest (and both digests must be defined), mode changed
  if (
    changeKind === "modified" &&
    change.baselineDigest !== undefined &&
    change.candidateDigest !== undefined &&
    change.baselineDigest === change.candidateDigest &&
    change.mode !== change.previousMode
  ) {
    return { path, change: changeKind, classification: "not-applicable", diffContribution: "" };
  }

  if (changeKind === "deleted") {
    // Read the baseline file
    const basePath = nodePath.join(baselineRoot, path);
    const bytes = await readFile(basePath);
    if (!bytes) {
      // I/O failure reading the deleted baseline file: fail-closed, not omitted:size (D8 defines
      // omitted:size only for added/modified size overruns, not for unreadable deletions).
      return { path, change: changeKind, classification: "omitted:unreadable", diffContribution: "" };
    }

    if (classifyContent(bytes) === "binary") {
      return { path, change: changeKind, classification: "omitted:binary-deletion", diffContribution: "" };
    }

    if (bytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
      // Deleted text file is too large for a diff hunk (D8 operator decision: omitted:size-deletion
      // for deleted text files exceeding the size limit).
      return { path, change: changeKind, classification: "omitted:size-deletion", diffContribution: "" };
    }

    // Text deletion: include as deletion hunk
    const oldText = decodeText(bytes);
    const diff = buildUnifiedDiffBounded(oldText, "", { oldPath: path, newPath: "/dev/null" });
    if (diff.kind === "budget-exceeded") {
      return { path, change: changeKind, classification: "omitted:size-deletion", diffContribution: "" };
    }
    return { path, change: changeKind, classification: "included:deletion", diffContribution: diff.diff };
  }

  if (changeKind === "added") {
    const candPath = nodePath.join(candidateRoot, path);
    const bytes = await readFile(candPath);
    if (!bytes) {
      // I/O failure reading the added file: cannot classify as not-applicable (that is reserved
      // for symlink/dir/mode-only changes).  Use omitted:unreadable so the entry appears in the
      // manifest and payload write is attempted (even if it may fail silently).
      return { path, change: changeKind, classification: "omitted:unreadable", diffContribution: "" };
    }
    if (bytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
      return { path, change: changeKind, classification: "omitted:size", diffContribution: "" };
    }
    if (classifyContent(bytes) === "binary") {
      return { path, change: changeKind, classification: "omitted:binary", diffContribution: "" };
    }
    // An empty added file yields an empty diff contribution: the entry is still `included`
    // (manifest records it) and the payload carries the (empty) candidate file.
    const newText = decodeText(bytes);
    const diff = buildUnifiedDiffBounded("", newText, { oldPath: "/dev/null", newPath: path });
    if (diff.kind === "budget-exceeded") {
      return { path, change: changeKind, classification: "omitted:size", diffContribution: "" };
    }
    return { path, change: changeKind, classification: "included", diffContribution: diff.diff };
  }

  // Modified
  const basePath = nodePath.join(baselineRoot, path);
  const candPath = nodePath.join(candidateRoot, path);
  const [baseBytes, candBytes] = await Promise.all([readFile(basePath), readFile(candPath)]);

  if (!baseBytes || !candBytes) {
    // I/O failure reading baseline or candidate: cannot classify as not-applicable (reserved for
    // symlink/dir/mode-only changes).  Use omitted:unreadable so the entry is not silently dropped
    // from the manifest and the payload write is attempted.
    return { path, change: changeKind, classification: "omitted:unreadable", diffContribution: "" };
  }

  const baseIsBinary = classifyContent(baseBytes) === "binary";
  const candIsBinary = classifyContent(candBytes) === "binary";

  if (baseIsBinary || candIsBinary) {
    return { path, change: changeKind, classification: "omitted:binary", diffContribution: "" };
  }

  if (baseBytes.length > PATCH_MAX_FILE_SIZE_BYTES || candBytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
    return { path, change: changeKind, classification: "omitted:size", diffContribution: "" };
  }

  const oldText = decodeText(baseBytes);
  const newText = decodeText(candBytes);
  const diff = buildUnifiedDiffBounded(oldText, newText, { oldPath: path, newPath: path });
  if (diff.kind === "budget-exceeded") {
    // The byte-size limit does not bound the O(m*n) LCS table (many short lines).
    // D8: a computation-budget overrun is treated like a size overrun — the entry is
    // omitted from the patch and the candidate bytes are carried in the payload.
    return { path, change: changeKind, classification: "omitted:size", diffContribution: "" };
  }

  return { path, change: changeKind, classification: "included", diffContribution: diff.diff };
}
