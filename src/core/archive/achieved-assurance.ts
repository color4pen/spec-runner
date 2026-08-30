/**
 * Derives "achieved" assurance from mechanical provenance facts for the archive floor gate.
 *
 * The archive minimumAssurance floor must evaluate achieved provenance — what the pipeline
 * actually demonstrated — rather than the declared profile assurance (which is just a
 * declaration and can be absent or uncorroborated).
 *
 * ADR-20260717 D1: floor authority = achieved provenance at the final archive HEAD.
 *
 * Exported:
 *   - `deriveAchievedAssurance()`: derive achieved assurance from job state + runtime.
 *   - `AssuranceProvenanceRuntime`: narrow Pick type for the floor gate runtime dependency.
 */

import { createHash } from "node:crypto";
import type { JobState, ProfileAssurance } from "../../state/schema.js";
import type { CommitFileResult } from "../port/runtime-strategy.js";
import type { AssuranceFloor } from "../../state/profile.js";
import { STEP_NAMES } from "../../kernel/step-names.js";

/**
 * Narrow runtime interface required by the archive floor gate.
 * Consumer-owned capability — only the methods needed for provenance derivation.
 *
 * readFileAtCommit is required for scenario revision-binding verification and
 * specReview blob binding.
 */
export interface AssuranceProvenanceRuntime {
  readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
}

/**
 * Input for deriveAchievedAssurance.
 */
export interface DeriveAchievedAssuranceInput {
  /** Full job state (needed for step history resolution). */
  state: JobState;
  /** Final archive HEAD commit OID (archiveSha from Step 3). May be undefined if Step 3 failed. */
  finalHeadOid: string | undefined;
  /** Working directory for git operations. */
  cwd: string;
  /** Assurance floor being evaluated. Used to skip I/O when a dimension is unconstrained. */
  floor: AssuranceFloor;
  /** Runtime strategy providing git primitives. null/undefined → all dimensions absent. */
  runtime: AssuranceProvenanceRuntime | null | undefined;
}

/**
 * Output of deriveAchievedAssurance.
 */
export interface DeriveAchievedAssuranceOutput {
  /** Derived achieved assurance object (fields absent when not established). */
  achieved: ProfileAssurance;
  /** Human-readable diagnostic messages explaining why dimensions are absent. */
  diagnostics: string[];
}

/**
 * Compute a sha256 content hash from a utf-8 string.
 * Returns "sha256:<hex>". Same algorithm as digestArtifacts in local.ts.
 */
function computeContentHash(content: string): string {
  const hex = createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
  return `sha256:${hex}`;
}

/**
 * Derive the "achieved" assurance for a job from mechanical provenance.
 *
 * Rules (each dimension independent):
 *
 * **specReview**: only evaluated when floor.specReview is constrained.
 *   Requires: latest spec-review run with verdict === "approved" AND commitOid present,
 *   finalHeadOid defined, runtime with readFileAtCommit, slug resolved.
 *   Then: readFileAtCommit(specReviewOid, "<slug>/spec.md") and readFileAtCommit(finalHeadOid, "<slug>/spec.md")
 *   must both be "found" with identical content hashes.
 *   → "required" (achieved) only when all conditions met, absent otherwise (fail-closed).
 *   (Binds approval to the reviewed revision blob — prevents re-approval after spec.md changes.)
 *
 * **testDerivation**: only evaluated when floor.testDerivation is constrained.
 *   Requires: test-case-gen commitOid present, finalHeadOid defined, runtime with readFileAtCommit.
 *   Scenario revision binding (absorb-test-materialize D4 — sole testDerivation criterion):
 *     - testCaseGenOid = state.steps["test-case-gen"].at(-1)?.commitOid
 *     - readFileAtCommit(testCaseGenOid, "<slug>/test-cases.md") → content at anchor commit
 *     - readFileAtCommit(finalHeadOid, "<slug>/test-cases.md") → content at HEAD
 *     - Content hashes must match → scenario intact (proves test-cases.md unchanged since test-case-gen)
 *   → testDerivation = "frozen" when scenario intact, absent otherwise (fail-closed).
 *
 * **Fail-closed**: any I/O unavailability or missing precondition leaves the dimension absent.
 * An absent dimension in `achieved` fails any constrained floor field (satisfiesFloor is fail-closed).
 *
 * **Never throws**: unexpected errors are caught, the affected dimension is left absent,
 * and a diagnostic message is recorded.
 */
export async function deriveAchievedAssurance(
  input: DeriveAchievedAssuranceInput,
): Promise<DeriveAchievedAssuranceOutput> {
  const { state, finalHeadOid, cwd, floor, runtime } = input;
  const diagnostics: string[] = [];
  // Start with empty achieved assurance — all fields absent by default.
  const achieved: Record<string, unknown> = {};

  // ---------------------------------------------------------------------------
  // specReview: check latest run verdict === "approved" + blob binding (D2)
  //
  // Only runs when floor.specReview is constrained. Does NOT early-return —
  // sets or leaves absent achieved.specReview, then continues to derivation.
  //
  // Binds the approval to the reviewed revision blob:
  //   1. specReviewOid = latest spec-review run's commitOid (must be present)
  //   2. readFileAtCommit(specReviewOid, "<slug>/spec.md") → anchor blob
  //   3. readFileAtCommit(finalHeadOid, "<slug>/spec.md") → HEAD blob
  //   4. Content hashes must match → approval is still valid
  //
  // Fail-closed: any step failure → specReview absent.
  // ---------------------------------------------------------------------------
  if (floor.specReview !== undefined) {
    try {
      const specReviewRuns = state.steps?.[STEP_NAMES.SPEC_REVIEW];
      const latestRun = Array.isArray(specReviewRuns) ? specReviewRuns.at(-1) : undefined;

      if (latestRun?.outcome?.verdict === "approved") {
        const specReviewOid = latestRun?.commitOid;

        if (!specReviewOid) {
          diagnostics.push(
            "specReview: specReviewOid absent (no commitOid on spec-review run) — fail-closed",
          );
        } else if (!finalHeadOid) {
          diagnostics.push("specReview: finalHeadOid undefined — fail-closed");
        } else if (!runtime) {
          diagnostics.push(
            "specReview: runtime.readFileAtCommit unavailable — fail-closed",
          );
        } else {
          const slug = state.request?.slug;
          if (!slug) {
            diagnostics.push("specReview: request.slug absent — fail-closed");
          } else {
            const specAtAnchor = await runtime.readFileAtCommit(specReviewOid, `${slug}/spec.md`, cwd);
            const specAtHead = await runtime.readFileAtCommit(finalHeadOid, `${slug}/spec.md`, cwd);

            if (specAtAnchor.kind === "unavailable") {
              diagnostics.push(
                `specReview: spec.md@specReviewOid unavailable: ${specAtAnchor.reason}`,
              );
            } else if (specAtHead.kind === "unavailable") {
              diagnostics.push(
                `specReview: spec.md@finalHeadOid unavailable: ${specAtHead.reason}`,
              );
            } else {
              const anchorHash = computeContentHash(specAtAnchor.content);
              const headHash = computeContentHash(specAtHead.content);
              if (anchorHash === headHash) {
                achieved["specReview"] = "required";
              } else {
                diagnostics.push(
                  `specReview: spec.md hash mismatch — spec changed after review. ` +
                  `anchor=${anchorHash} head=${headHash}`,
                );
              }
            }
          }
        }
      }
      // else: not approved → specReview absent (no-op)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      diagnostics.push(`specReview derivation error: ${reason}`);
    }
  }

  // ---------------------------------------------------------------------------
  // testDerivation: skip I/O entirely if floor doesn't constrain it
  // ---------------------------------------------------------------------------
  if (floor.testDerivation === undefined) {
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (b) Scenario revision binding — sole testDerivation criterion (absorb-test-materialize D4).
  //
  // testDerivation = "frozen" when test-cases.md content is identical at
  // testCaseGenOid and finalHeadOid.
  //
  // Preconditions: finalHeadOid defined, runtime with readFileAtCommit, slug present.
  // Fail-closed: any failure → testDerivation absent.
  // ---------------------------------------------------------------------------
  if (!finalHeadOid) {
    diagnostics.push("testDerivation: finalHeadOid is undefined — cannot establish provenance");
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  if (!runtime) {
    diagnostics.push(
      "testDerivation: runtime.readFileAtCommit unavailable — fail-closed",
    );
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  try {
    const testCaseGenRuns = state.steps?.[STEP_NAMES.TEST_CASE_GEN];
    const latestTcgRun = Array.isArray(testCaseGenRuns) ? testCaseGenRuns.at(-1) : undefined;
    const testCaseGenOid = latestTcgRun?.commitOid;

    if (!testCaseGenOid) {
      diagnostics.push(
        "testDerivation: test-case-gen commitOid absent — " +
        "cannot verify scenario freeze without anchor commit OID (fail-closed)",
      );
    } else {
      const slug = state.request?.slug;
      if (!slug) {
        diagnostics.push(
          "testDerivation: request.slug absent — " +
          "cannot suffix-resolve test-cases.md path (fail-closed)",
        );
      } else {
        const tcAtAnchor = await runtime.readFileAtCommit(testCaseGenOid, `${slug}/test-cases.md`, cwd);
        if (tcAtAnchor.kind === "unavailable") {
          diagnostics.push(
            `testDerivation: test-cases.md@testCaseGenOid unavailable: ${tcAtAnchor.reason}`,
          );
        } else {
          const tcAtHead = await runtime.readFileAtCommit(finalHeadOid, `${slug}/test-cases.md`, cwd);
          if (tcAtHead.kind === "unavailable") {
            diagnostics.push(
              `testDerivation: test-cases.md@finalHeadOid unavailable: ${tcAtHead.reason}`,
            );
          } else {
            const anchorHash = computeContentHash(tcAtAnchor.content);
            const headHash = computeContentHash(tcAtHead.content);
            if (anchorHash !== headHash) {
              diagnostics.push(
                `testDerivation: test-cases.md hash mismatch between testCaseGenOid and finalHeadOid — ` +
                `scenario was tampered after test-case-gen. anchor=${anchorHash} head=${headHash}`,
              );
            } else {
              achieved["testDerivation"] = "frozen";
            }
          }
        }
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`testDerivation: scenario freeze check threw: ${reason}`);
  }

  return { achieved: achieved as ProfileAssurance, diagnostics };
}
