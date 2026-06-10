/**
 * Shared artifact reference type for lineage recording.
 *
 * Placed in shared-kernel (src/state/) so both the ports layer (core/port/)
 * and the persistence layer (store/) can import it without a DSM violation.
 *
 * D1 (artifact-observability): content addressing via sha256 for local runtime.
 */

/**
 * A reference to an artifact (file) with optional content hash.
 * Used in LineageRecord to identify step inputs and outputs.
 *
 * ManagedRuntime / file-not-found → hash is null.
 */
export interface ArtifactRef {
  /** Worktree-relative path (from IoRef.path). */
  path: string;
  /** Content hash in "sha256:<hex>" format, or null if unavailable. */
  hash: string | null;
  /** For inputs only: whether the input was required (from IoRef.required). */
  required?: boolean;
}
