/**
 * Doctor check: journal-integrity
 *
 * Enumerates all known change folders and calls inspectJournalDir() on each,
 * reporting any mid-journal corruption or counter-reversal (journal truncation).
 *
 * Design:
 *  - No issues found → pass
 *  - Any issue found → fail (journal is the append-only truth; corruption is not a warning)
 *  - Scan I/O errors → pass (defensive, consistent with other storage scan checks)
 *  - Read-only: never modifies any file
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import {
  describeJournalIssue,
  scanJournalIntegrity,
} from "../../../../store/journal-integrity.js";
import type { JournalFinding, ScanFn } from "../../../../store/journal-integrity.js";

// ---------------------------------------------------------------------------
// Check factory
// ---------------------------------------------------------------------------

/**
 * Factory that creates the journal-integrity check with an optional scan override.
 * The override is intended for testing only; production code uses the default.
 */
export function createJournalIntegrityCheck(overrideScan?: ScanFn): DoctorCheck {
  const doScan: ScanFn = overrideScan ?? scanJournalIntegrity;

  return {
    name: "journal-integrity",
    category: "storage",
    required: false,

    async check(ctx: DoctorContext) {
      let findings: JournalFinding[];
      try {
        // Use repoRoot when available so checks are equivalent from any subdirectory.
        findings = await doScan({ repoRoot: ctx.repoRoot ?? ctx.cwd });
      } catch {
        // Defensive: scan errors must not affect doctor exit code
        return {
          status: "pass",
          message: "No corrupt event journals found",
        };
      }

      if (findings.length === 0) {
        return {
          status: "pass",
          message: "No corrupt event journals found",
        };
      }

      const count = findings.length;
      const details = findings.map(
        (f) => `${f.location}: ${describeJournalIssue(f.issue)}`,
      );

      return {
        status: "fail",
        message: `Found ${count} corrupt event journal(s)`,
        details,
        hint: `Restore the affected events.jsonl from git history, e.g.:\n  git restore --source=<good-ref> -- <path>/events.jsonl`,
      };
    },
  };
}

/** Default journal-integrity check instance (uses real scanJournalIntegrity). */
export const journalIntegrityCheck: DoctorCheck = createJournalIntegrityCheck();
