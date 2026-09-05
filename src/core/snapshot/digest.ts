/**
 * Snapshot digest computation — pure functions, no I/O.
 * T-02: digest.ts — no fs or child_process imports.
 *
 * Canonical streaming format per entry:
 *   kind\0path\0mode\0contentDigest\n
 * Directory entries: contentDigest is empty string:
 *   dir\0path\040000\0\n
 */
import { createHash } from "node:crypto";
import type { SnapshotEntry } from "./types.js";

// ─── File / symlink content digests ──────────────────────────────────────────

/**
 * Compute SHA-256 digest of raw file bytes.
 * Returns "sha256:<64-hex>".
 */
export function computeFileContentDigest(bytes: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

/**
 * Compute SHA-256 digest of a symlink target string.
 * Returns "sha256:<64-hex>".
 */
export function computeSymlinkDigest(target: string): string {
  return "sha256:" + createHash("sha256").update(target, "utf8").digest("hex");
}

// ─── Snapshot digest ──────────────────────────────────────────────────────────

/**
 * Compute a deterministic snapshot digest from schema version, exclusions, and entries.
 *
 * Input order of entries is irrelevant — entries are sorted by path (UTF-8 byte order).
 * Exclusions are included in the digest so that changing the exclusion set changes the digest.
 *
 * Time, absolute paths, inodes, owners, umask and traversal order do not affect the output.
 *
 * Format fed into SHA-256 (streaming, no large intermediate string):
 *   1. schemaVersion\n
 *   2. exclusions:<sorted-excl-0>\0<sorted-excl-1>\0...\n
 *   3. For each entry (sorted by path byte order):
 *      kind\0path\0mode\0contentDigest\n
 *      (for dir: contentDigest is "")
 *
 * Returns "sha256:<64-hex>".
 */
export function computeSnapshotDigest(
  schemaVersion: string,
  exclusions: readonly string[],
  entries: readonly SnapshotEntry[],
): string {
  const hash = createHash("sha256");

  // 1. Schema version
  hash.update(schemaVersion + "\n", "utf8");

  // 2. Exclusions (sorted for determinism)
  const sortedExclusions = [...exclusions].sort();
  hash.update("exclusions:" + sortedExclusions.join("\0") + "\n", "utf8");

  // 3. Entries sorted by path (UTF-8 byte order = lexicographic on JS strings)
  const sortedEntries = [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  for (const entry of sortedEntries) {
    const contentDigest = entry.kind === "dir" ? "" : (entry.contentDigest ?? "");
    // Format: kind\0path\0mode\0contentDigest\n
    hash.update(`${entry.kind}\0${entry.path}\0${entry.mode}\0${contentDigest}\n`, "utf8");
  }

  return "sha256:" + hash.digest("hex");
}
