/**
 * Tamper detection for the bite-evidence gate (R4, bite-evidence-forward T-09).
 *
 * Verifies that the test-cases.md file has not been modified since test-case-gen
 * produced it by comparing the frozen hash recorded in events.jsonl lineage against
 * the current file hash.
 *
 * Contract:
 * - match:       both hashes present and equal → test-cases.md is intact.
 * - mismatch:    both hashes present and different → test-cases.md was tampered.
 * - inconclusive: frozen hash absent (no test-case-gen lineage record) → proceed.
 *
 * The gate (T-06) treats:
 *   - mismatch     → failed (fail-closed)
 *   - inconclusive → proceed with base/candidate evaluation
 *   - match        → proceed
 */

import type { LineageRecord } from "../../../store/event-journal.js";

export type TamperStatus = "match" | "mismatch" | "inconclusive";

export interface TamperCheckResult {
  status: TamperStatus;
}

/**
 * Check the tamper status of `test-cases.md` by comparing the frozen hash from
 * the `test-case-gen` lineage record against the provided current hash.
 *
 * @param lineage     All lineage records from events.jsonl fold (chronological order).
 * @param currentHash The current hash of test-cases.md (e.g. "sha256:<hex>").
 *                    Computed by the caller via `digestArtifacts`.
 *
 * @returns TamperCheckResult with one of: "match" | "mismatch" | "inconclusive".
 */
export function checkTamperStatus(
  lineage: LineageRecord[],
  currentHash: string | null | undefined,
): TamperCheckResult {
  // Find the last test-case-gen lineage record (latest run wins).
  const testCaseGenRecord = [...lineage]
    .reverse()
    .find((r) => r.step === "test-case-gen");

  if (!testCaseGenRecord) {
    // No test-case-gen lineage record → inconclusive (cannot verify)
    return { status: "inconclusive" };
  }

  // Find the test-cases.md output in the lineage record.
  // Match by path suffix to be slug-agnostic.
  const testCasesOutput = testCaseGenRecord.outputs.find((o) =>
    o.path.endsWith("test-cases.md"),
  );

  if (!testCasesOutput || testCasesOutput.hash === null || testCasesOutput.hash === undefined) {
    // Lineage exists but hash is absent → inconclusive
    return { status: "inconclusive" };
  }

  const frozenHash = testCasesOutput.hash;

  if (!currentHash) {
    // Cannot compute current hash (e.g. file missing) → inconclusive
    return { status: "inconclusive" };
  }

  if (frozenHash === currentHash) {
    return { status: "match" };
  }

  return { status: "mismatch" };
}
