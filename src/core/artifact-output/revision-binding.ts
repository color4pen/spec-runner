/**
 * Revision binding for the artifact-output profile.
 * T-08: revision-binding.ts — wraps execution with pre/post snapshot for drift detection.
 *
 * Ensures that the snapshot taken before and after an operation matches,
 * binding the operation result to a specific candidate revision.
 */
import { collectSnapshot } from "../snapshot/collect.js";
import type { CollectSnapshotOptions } from "../snapshot/collect.js";
import type { DirectorySnapshot } from "../snapshot/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RevisionBindingResult<T> =
  | { kind: "bound"; digest: string; frozenSnapshot: DirectorySnapshot; result: T }
  | { kind: "revision-drift"; before: string; after: string }
  | { kind: "unavailable"; reason: string };

/** Required fields for a verification record bound to a digest. */
export interface VerificationRecord {
  candidateDigest: string; // Required: cannot construct without digest
  outcome: "passed" | "failed" | "skipped";
  details?: string;
  commands?: string[];
}

/** Required fields for a review record bound to a digest. */
export interface ReviewRecord {
  candidateDigest: string; // Required: cannot construct without digest
  outcome: "approved" | "needs-fix" | "skipped";
  findings?: string[];
  contextDigest?: string;
}

// ─── Revision binding ─────────────────────────────────────────────────────────

/**
 * Execute an operation against the candidate directory with pre/post snapshot verification.
 *
 * Protocol:
 * 1. Take a "freeze" snapshot before execution.
 * 2. If snapshot is unavailable: return { kind: "unavailable" } without executing.
 * 3. Execute the operation.
 * 4. Take a "verify" snapshot after execution.
 * 5. If post-snapshot is unavailable: return { kind: "unavailable" }.
 * 6. If pre- and post-digest differ: return { kind: "revision-drift" }.
 * 7. Otherwise: return { kind: "bound", digest, frozenSnapshot, result }.
 *
 * The frozenSnapshot is the pre-execution snapshot (used for change set derivation).
 * The bound digest is the digest of the pre-execution snapshot (same as post if no drift).
 */
export async function runBoundToCandidateRevision<T>(
  candidateRoot: string,
  execute: () => Promise<T>,
  collectOpts?: CollectSnapshotOptions,
  preSnapshot?: DirectorySnapshot,
): Promise<RevisionBindingResult<T>> {
  // Step 1: Pre-execution snapshot (skip if already taken by caller)
  let preFrozen: DirectorySnapshot;
  if (preSnapshot) {
    preFrozen = preSnapshot;
  } else {
    const preResult = await collectSnapshot(candidateRoot, collectOpts);
    if (preResult.kind === "unavailable") {
      return { kind: "unavailable", reason: `Pre-execution snapshot failed: ${preResult.reason}` };
    }
    preFrozen = preResult.snapshot;
  }

  const preDigest = preFrozen.digest;

  // Step 2: Execute
  const result = await execute();

  // Step 3: Post-execution snapshot
  const postResult = await collectSnapshot(candidateRoot, collectOpts);
  if (postResult.kind === "unavailable") {
    return { kind: "unavailable", reason: `Post-execution snapshot failed: ${postResult.reason}` };
  }

  const postDigest = postResult.snapshot.digest;

  // Step 4: Check for drift
  if (preDigest !== postDigest) {
    return { kind: "revision-drift", before: preDigest, after: postDigest };
  }

  return {
    kind: "bound",
    digest: preDigest,
    frozenSnapshot: preFrozen,
    result,
  };
}
