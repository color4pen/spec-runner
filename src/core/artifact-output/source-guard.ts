/**
 * Source directory immutability guard for the artifact-output profile.
 * T-06: source-guard.ts — verifies the source directory is unchanged.
 *
 * Never reports "unchanged" when the snapshot itself is unavailable (fail-closed).
 */
import { collectSnapshot } from "../snapshot/collect.js";
import type { CollectSnapshotOptions } from "../snapshot/collect.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceGuardResult =
  | { kind: "unchanged" }
  | { kind: "mutated"; currentDigest: string }
  | { kind: "unverifiable"; reason: string };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Assert that the source directory has not changed since the baseline snapshot.
 *
 * - If the current snapshot matches baselineDigest: returns "unchanged".
 * - If the digest differs: returns "mutated" with the current digest.
 * - If the snapshot cannot be collected (I/O error, unsupported entry, etc.):
 *   returns "unverifiable" — NEVER "unchanged" (fail-closed).
 *
 * @param sourceRoot      - The source directory to check.
 * @param baselineDigest  - The expected digest from the baseline snapshot.
 * @param collectOpts     - Options forwarded to collectSnapshot (exclusions etc.).
 */
export async function assertSourceUnchanged(
  sourceRoot: string,
  baselineDigest: string,
  collectOpts?: CollectSnapshotOptions,
): Promise<SourceGuardResult> {
  const result = await collectSnapshot(sourceRoot, collectOpts);

  if (result.kind === "unavailable") {
    return {
      kind: "unverifiable",
      reason: result.reason,
    };
  }

  if (result.snapshot.digest === baselineDigest) {
    return { kind: "unchanged" };
  }

  return {
    kind: "mutated",
    currentDigest: result.snapshot.digest,
  };
}
