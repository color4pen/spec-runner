/**
 * Fail-closed snapshot collection for the artifact-output profile.
 * T-03: collect.ts — fs-based directory traversal.
 *
 * Any I/O failure, unsupported entry kind, or symlink escape causes the
 * snapshot to be reported as "unavailable" — never silently treated as "no change".
 */
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import {
  computeFileContentDigest,
  computeSymlinkDigest,
  computeSnapshotDigest,
} from "./digest.js";
import type {
  SnapshotEntry,
  SnapshotFailure,
  SnapshotResult,
} from "./types.js";
import { DEFAULT_EXCLUSIONS, SNAPSHOT_SCHEMA_VERSION } from "./types.js";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CollectSnapshotOptions {
  /** Path prefixes to skip (e.g. [".git/"]). Defaults to DEFAULT_EXCLUSIONS. */
  exclusions?: readonly string[];
}

/**
 * Collect a deterministic snapshot of a directory.
 *
 * - Traversal is lstat-based; symlinks are NOT followed (recorded as symlink entries).
 * - Symlink targets that escape the root are recorded as "symlink-escape" failures.
 * - Entry kinds other than file/symlink/dir are recorded as "unsupported-kind" failures.
 * - Any I/O or unreadable entry is recorded as a failure.
 * - If ANY failure occurs, returns { kind: "unavailable" } — no partial snapshot.
 * - Empty directories are recorded as entries.
 * - Never throws: all errors are converted to failure entries.
 *
 * Returns SnapshotResult.
 */
export async function collectSnapshot(
  root: string,
  opts: CollectSnapshotOptions = {},
): Promise<SnapshotResult> {
  const exclusions = opts.exclusions ?? DEFAULT_EXCLUSIONS;
  const entries: SnapshotEntry[] = [];
  const failures: SnapshotFailure[] = [];

  try {
    await traverseDir(root, root, exclusions, entries, failures);
  } catch (err) {
    failures.push({
      path: "",
      reason: "io-error",
    });
  }

  if (failures.length > 0) {
    return {
      kind: "unavailable",
      reason: `Snapshot collection failed with ${failures.length} failure(s)`,
      failures,
    };
  }

  // Sort entries by path (UTF-8 byte order)
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const digest = computeSnapshotDigest(SNAPSHOT_SCHEMA_VERSION, exclusions, entries);

  return {
    kind: "ok",
    snapshot: {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exclusions,
      entries,
      digest,
    },
  };
}

// ─── Internal traversal ───────────────────────────────────────────────────────

async function traverseDir(
  root: string,
  dir: string,
  exclusions: readonly string[],
  entries: SnapshotEntry[],
  failures: SnapshotFailure[],
): Promise<void> {
  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(dir) as string[];
  } catch {
    const relPath = toRelPosix(root, dir);
    failures.push({ path: relPath, reason: "io-error" });
    return;
  }

  for (const name of dirEntries) {
    const absPath = nodePath.join(dir, name);
    const relPath = toRelPosix(root, absPath);

    // Check exclusion
    if (isExcluded(relPath, exclusions)) continue;

    let stat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stat = await fs.lstat(absPath);
    } catch {
      failures.push({ path: relPath, reason: "unreadable" });
      continue;
    }

    if (stat.isFile()) {
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(absPath);
      } catch {
        failures.push({ path: relPath, reason: "unreadable" });
        continue;
      }
      const contentDigest = computeFileContentDigest(new Uint8Array(bytes));
      const mode = stat.mode & 0o111 ? "100755" : "100644";
      entries.push({
        kind: "file",
        path: relPath,
        mode,
        contentDigest,
        size: bytes.length,
      });
    } else if (stat.isSymbolicLink()) {
      let target: string;
      try {
        target = await fs.readlink(absPath);
      } catch {
        failures.push({ path: relPath, reason: "unreadable" });
        continue;
      }

      // Check for symlink escape
      if (isSymlinkEscape(root, absPath, target)) {
        failures.push({ path: relPath, reason: "symlink-escape" });
        continue;
      }

      const contentDigest = computeSymlinkDigest(target);
      entries.push({
        kind: "symlink",
        path: relPath,
        mode: "120000",
        contentDigest,
        symlinkTarget: target,
      });
    } else if (stat.isDirectory()) {
      // Record the directory entry
      entries.push({
        kind: "dir",
        path: relPath,
        mode: "40000",
      });
      // Recurse
      await traverseDir(root, absPath, exclusions, entries, failures);
    } else {
      // FIFO, socket, device, etc.
      failures.push({ path: relPath, reason: "unsupported-kind" });
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert an absolute path to a root-relative POSIX path (no leading "./" or "/").
 * Uses UTF-8 string operations; non-UTF-8 paths are returned as-is (caller handles failures).
 */
function toRelPosix(root: string, absPath: string): string {
  // nodePath.relative gives OS-separator relative path
  const rel = nodePath.relative(root, absPath);
  // Convert to POSIX separators (on Windows the separator may be "\\")
  return rel.split(nodePath.sep).join("/");
}

/**
 * Check whether a relative path matches any exclusion prefix.
 * Exclusions are like ".git/" — a path matches if it starts with the exclusion
 * OR if path + "/" equals the exclusion (matching the directory itself).
 */
function isExcluded(relPath: string, exclusions: readonly string[]): boolean {
  for (const excl of exclusions) {
    if (relPath.startsWith(excl) || relPath + "/" === excl) {
      return true;
    }
  }
  return false;
}

/**
 * Detect whether a symlink target escapes the root directory.
 * - Absolute targets always escape.
 * - Relative targets are resolved relative to the symlink's containing directory.
 *   If the resolved path is outside root, it's an escape.
 */
function isSymlinkEscape(root: string, symlinkAbsPath: string, target: string): boolean {
  if (nodePath.isAbsolute(target)) return true;

  const symlinkDir = nodePath.dirname(symlinkAbsPath);
  const resolved = nodePath.resolve(symlinkDir, target);
  const normalRoot = nodePath.resolve(root);

  // Check if resolved is within normalRoot
  const rel = nodePath.relative(normalRoot, resolved);
  // If rel starts with "..", it's outside the root
  return rel.startsWith("..") || nodePath.isAbsolute(rel);
}
