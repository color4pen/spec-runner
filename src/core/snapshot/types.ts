/**
 * Snapshot type contracts for the artifact-output profile.
 * T-02: snapshot types — pure type definitions, no I/O.
 */

// ─── Entry kinds and metadata ────────────────────────────────────────────────

export type SnapshotEntryKind = "file" | "symlink" | "dir";

/**
 * A single entry in a directory snapshot.
 * - kind: "file" | "symlink" | "dir"
 * - path: POSIX relative path from root, no leading "./"
 * - mode: "100644" | "100755" (file), "120000" (symlink), "40000" (dir)
 * - contentDigest: sha256:<hex> for file/symlink; absent for dir
 * - symlinkTarget: target string (symlink only)
 * - size: byte count (file only)
 */
export interface SnapshotEntry {
  kind: SnapshotEntryKind;
  path: string;
  mode: string;
  contentDigest?: string;
  symlinkTarget?: string;
  size?: number;
}

/**
 * A complete directory snapshot.
 * digest is the canonical snapshot digest (sha256:<hex>).
 * exclusions records which path prefixes were excluded during collection.
 */
export interface DirectorySnapshot {
  schemaVersion: string;
  exclusions: readonly string[];
  entries: readonly SnapshotEntry[];
  digest: string;
}

// ─── Failure types ────────────────────────────────────────────────────────────

export type SnapshotFailureReason =
  | "unreadable"
  | "unsupported-kind"
  | "path-not-utf8"
  | "symlink-escape"
  | "io-error";

export interface SnapshotFailure {
  path: string;
  reason: SnapshotFailureReason;
}

// ─── Result union ─────────────────────────────────────────────────────────────

export type SnapshotResult =
  | { kind: "ok"; snapshot: DirectorySnapshot }
  | { kind: "unavailable"; reason: string; failures: readonly SnapshotFailure[] };

// ─── Constants ────────────────────────────────────────────────────────────────

export const SNAPSHOT_SCHEMA_VERSION = "1";

/**
 * Default exclusions applied when the caller does not specify otherwise.
 * Always excludes .git/ so that git internals never become part of the baseline.
 */
export const DEFAULT_EXCLUSIONS: readonly string[] = [".git/"];
