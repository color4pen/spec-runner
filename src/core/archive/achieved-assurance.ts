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
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { AssuranceFloor } from "../../state/profile.js";
import { resolveEvidenceBaseRev } from "../step/bite-evidence/oids.js";
import { FORWARD_TYPES } from "../step/bite-evidence/gate.js";
import { selectMaterializedTestFiles } from "../step/bite-evidence/test-file-selection.js";
import { STEP_NAMES } from "../../kernel/step-names.js";

/**
 * Narrow runtime interface required by the archive floor gate.
 * A subset of RuntimeStrategy — only the methods needed for provenance derivation.
 *
 * readFileAtCommit is required for scenario revision-binding verification and
 * specReview blob binding.
 *
 * listChangedFilesBetweenCommits is used for EB-native file-set identification
 * (absorb-test-materialize: replaces listCommitChangedFiles(baseOid)).
 */
export type AssuranceProvenanceRuntime = Pick<
  RuntimeStrategy,
  | "listChangedFilesBetweenCommits"
  | "runTestsAtCommit"
  | "runTestsOnSynthesizedTree"
  | "readFileAtCommit"
>;

/**
 * Input for deriveAchievedAssurance.
 */
export interface DeriveAchievedAssuranceInput {
  /** Full job state (needed for step history / biteEvidence resolution). */
  state: JobState;
  /** Final archive HEAD commit OID (archiveSha from Step 3). May be undefined if Step 3 failed. */
  finalHeadOid: string | undefined;
  /** Working directory for git operations. */
  cwd: string;
  /** Project config (needed for runTestsAtCommit scoping). */
  config: SpecRunnerConfig | undefined;
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
 * **biteEvidence** / **testDerivation**: only evaluated when the floor constrains either.
 *   Requires: Evidence Base ref resolvable (synthesizedCommits[0]^) + finalHeadOid defined
 *   + runtime available with all required methods + config defined.
 *   (a) Enumerate materializedTestFiles via listChangedFilesBetweenCommits(evidenceBaseRev, finalHeadOid)
 *       + selectMaterializedTestFiles filter. Empty → testDerivation is still evaluated; biteEvidence absent.
 *   (b) Scenario revision binding (absorb-test-materialize D4 — sole testDerivation criterion):
 *       - testCaseGenOid = state.steps["test-case-gen"].at(-1)?.commitOid
 *       - readFileAtCommit(testCaseGenOid, "<slug>/test-cases.md") → content at anchor commit
 *       - readFileAtCommit(finalHeadOid, "<slug>/test-cases.md") → content at HEAD
 *       - Content hashes must match → scenario intact (proves test-cases.md unchanged since test-case-gen)
 *       → fail on any step → both absent (fail-closed). events.jsonl is NOT used.
 *   testDerivation = "frozen" when (b) scenario intact. Independent of materializedTestFiles (D4).
 *   Blob freeze check (diffPathsBetweenCommits) is removed; testDerivation no longer requires it.
 *
 *   biteEvidence is additionally constrained to forward types only (P0-3, ADR-20260716 D2):
 *   (c) Type gate: state.request.type must be in FORWARD_TYPES (bug-fix / new-feature).
 *       → non-forward type → biteEvidence absent (fail-closed until forward strategy is implemented).
 *   (d) Evidence Base base-red check: runTestsOnSynthesizedTree(evidenceBaseRev, materializedTestFiles, finalHeadOid)
 *       → all must be failed (base-red). evidenceBaseRev = synthesizedCommits[0]^ (immutable job base).
 *       → unavailable or any passed → biteEvidence absent.
 *   (e) HEAD-green check (P0-1): runTestsAtCommit(finalHeadOid) → ALL must be passed (HEAD-green).
 *       → unavailable, any red, or coverage gap → biteEvidence absent.
 *   biteEvidence = "required" when (a) + (b) + (c) + (d) + (e) all satisfied.
 *   biteEvidence I/O (c/d/e) is skipped entirely when floor does not constrain biteEvidence.
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
  const { state, finalHeadOid, cwd, config, floor, runtime } = input;
  const diagnostics: string[] = [];
  // Start with empty achieved assurance — all fields absent by default.
  const achieved: Record<string, unknown> = {};

  // ---------------------------------------------------------------------------
  // specReview: check latest run verdict === "approved" + blob binding (D2)
  //
  // Only runs when floor.specReview is constrained. Does NOT early-return —
  // sets or leaves absent achieved.specReview, then continues to bite/derivation.
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
        } else if (!runtime || typeof runtime.readFileAtCommit !== "function") {
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
  // biteEvidence + testDerivation: skip I/O entirely if floor doesn't constrain either
  // ---------------------------------------------------------------------------
  const floorConstrainsBite = floor.biteEvidence !== undefined;
  const floorConstrainsDerivation = floor.testDerivation !== undefined;

  if (!floorConstrainsBite && !floorConstrainsDerivation) {
    // Neither dimension is constrained — no I/O needed.
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // Precondition checks (fail-closed: absent → leave dimensions absent)
  // ---------------------------------------------------------------------------

  // (P1) finalHeadOid must be defined.
  if (finalHeadOid === undefined) {
    diagnostics.push("biteEvidence/testDerivation: finalHeadOid is undefined — cannot establish provenance");
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // (P3) Runtime must be available with all required methods.
  // listChangedFilesBetweenCommits replaces listCommitChangedFiles + diffPathsBetweenCommits.
  if (
    !runtime ||
    typeof runtime.listChangedFilesBetweenCommits !== "function" ||
    typeof runtime.runTestsAtCommit !== "function" ||
    typeof runtime.runTestsOnSynthesizedTree !== "function" ||
    typeof runtime.readFileAtCommit !== "function"
  ) {
    diagnostics.push(
      "biteEvidence/testDerivation: runtime is unavailable or missing required methods " +
      "(listChangedFilesBetweenCommits / runTestsAtCommit / runTestsOnSynthesizedTree / readFileAtCommit)",
    );
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // (P4) config must be defined (needed for runTestsAtCommit scoping).
  if (config === undefined) {
    diagnostics.push("biteEvidence/testDerivation: config is undefined — cannot run tests");
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (b) Scenario revision binding — sole testDerivation criterion (absorb-test-materialize D4).
  //
  // testDerivation is independent of materializedTestFiles (D4):
  //   scenarioFreezeIntact = true when test-cases.md content is identical at
  //   testCaseGenOid and finalHeadOid. Never early-returns — failures are recorded
  //   as diagnostics and scenarioFreezeIntact stays false.
  //
  // Blob freeze (diffPathsBetweenCommits) is removed; testDerivation no longer requires it.
  // events.jsonl is NOT read.
  // ---------------------------------------------------------------------------
  let scenarioFreezeIntact = false;
  try {
    const testCaseGenRuns = state.steps?.[STEP_NAMES.TEST_CASE_GEN];
    const latestTcgRun = Array.isArray(testCaseGenRuns) ? testCaseGenRuns.at(-1) : undefined;
    const testCaseGenOid = latestTcgRun?.commitOid;

    if (!testCaseGenOid) {
      diagnostics.push(
        "biteEvidence/testDerivation: test-case-gen commitOid absent — " +
        "cannot verify scenario freeze without anchor commit OID (fail-closed)",
      );
    } else {
      const slug = state.request?.slug;
      if (!slug) {
        diagnostics.push(
          "biteEvidence/testDerivation: request.slug absent — " +
          "cannot suffix-resolve test-cases.md path (fail-closed)",
        );
      } else {
        const tcAtAnchor = await runtime.readFileAtCommit!(testCaseGenOid, `${slug}/test-cases.md`, cwd);
        if (tcAtAnchor.kind === "unavailable") {
          diagnostics.push(
            `biteEvidence/testDerivation: test-cases.md@testCaseGenOid unavailable: ${tcAtAnchor.reason}`,
          );
        } else {
          const tcAtHead = await runtime.readFileAtCommit!(finalHeadOid, `${slug}/test-cases.md`, cwd);
          if (tcAtHead.kind === "unavailable") {
            diagnostics.push(
              `biteEvidence/testDerivation: test-cases.md@finalHeadOid unavailable: ${tcAtHead.reason}`,
            );
          } else {
            const anchorHash = computeContentHash(tcAtAnchor.content);
            const headHash = computeContentHash(tcAtHead.content);
            if (anchorHash !== headHash) {
              diagnostics.push(
                `biteEvidence/testDerivation: test-cases.md hash mismatch between testCaseGenOid and finalHeadOid — ` +
                `scenario was tampered after test-case-gen. anchor=${anchorHash} head=${headHash}`,
              );
            } else {
              scenarioFreezeIntact = true;
            }
          }
        }
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence/testDerivation: scenario freeze check threw: ${reason}`);
  }

  // testDerivation: solely scenario binding (D4 — independent of materializedTestFiles).
  // Type gate is NOT applied to testDerivation — it is strategy-independent.
  if (floorConstrainsDerivation && scenarioFreezeIntact) {
    achieved["testDerivation"] = "frozen";
  }

  // ---------------------------------------------------------------------------
  // biteEvidence I/O: skip entirely when floor does not constrain biteEvidence.
  // Type gate (P0-3) + base-red (P0-1 base) + HEAD-green (P0-1 HEAD) are
  // biteEvidence-specific — no need to run them for testDerivation-only constraints.
  // ---------------------------------------------------------------------------
  if (!floorConstrainsBite) {
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (P2) Resolve Evidence Base reference (only needed for biteEvidence file-set).
  // Placed after testDerivation so scenario binding runs independently of EB resolution.
  // ---------------------------------------------------------------------------
  const evidenceBaseRev = resolveEvidenceBaseRev(state);
  if (evidenceBaseRev === null) {
    diagnostics.push(
      "biteEvidence: Evidence Base reference absent — synthesizedCommits ledger is empty or absent (fail-closed)",
    );
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (a) Enumerate materialized test files via EB↔HEAD diff.
  // (absorb-test-materialize: replaces listCommitChangedFiles(baseOid))
  // ---------------------------------------------------------------------------
  let materializedTestFiles: string[];
  try {
    const changedFilesResult = await runtime.listChangedFilesBetweenCommits!(evidenceBaseRev, finalHeadOid, cwd);
    if (changedFilesResult.kind === "unavailable") {
      diagnostics.push(`biteEvidence: listChangedFilesBetweenCommits unavailable: ${changedFilesResult.reason}`);
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }
    materializedTestFiles = selectMaterializedTestFiles(changedFilesResult.files, config);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence: listChangedFilesBetweenCommits threw: ${reason}`);
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  if (materializedTestFiles.length === 0) {
    diagnostics.push("biteEvidence: 0 test files in EB↔HEAD diff (all paths excluded or diff empty)");
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // Scenario must be frozen for biteEvidence (already diagnosed in scenario binding section).
  if (!scenarioFreezeIntact) {
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (c) Type gate (P0-3, ADR-20260716 D2):
  // biteEvidence only applies to forward strategy types (bug-fix / new-feature).
  // Non-forward types (refactoring / spec-change / chore) → biteEvidence absent.
  // Fail-closed until dedicated bite strategies are implemented for other types.
  // ---------------------------------------------------------------------------
  const requestType = state.request?.type ?? "";
  if (!FORWARD_TYPES.has(requestType)) {
    diagnostics.push(
      `biteEvidence: request.type "${requestType}" is not a forward strategy type (FORWARD_TYPES = ${[...FORWARD_TYPES].join(", ")}) — ` +
      `biteEvidence absent (fail-closed until forward strategy is implemented for this type)`,
    );
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (d) Base-red check + (e) HEAD-green check (P0-1, ADR-20260717 D4)
  //
  // base-red: run tests on Evidence Base (evidenceBaseRev + candidate overlay) — all must fail (red).
  // HEAD-green: run tests at finalHeadOid — all materialized test files must pass (green).
  // Both checks use the same materializedTestFiles to ensure complete coverage.
  //
  // Fail-closed:
  //   - unavailable (no scopedTestCommand) → absent
  //   - incomplete coverage (missing result) → absent
  //   - any red at HEAD / any non-red at base → absent
  // ---------------------------------------------------------------------------
  try {
    // (d) Evidence Base base-red check: run tests on the synthesized tree
    // (job base tree = synthesizedCommits[0]^ + candidate test overlay from finalHeadOid).
    const baseTestResult = await runtime.runTestsOnSynthesizedTree!(
      evidenceBaseRev,
      materializedTestFiles,
      finalHeadOid,
      cwd,
      config,
    );
    if (baseTestResult.kind === "unavailable") {
      diagnostics.push(`biteEvidence: runTestsOnSynthesizedTree(evidenceBaseRev) unavailable: ${baseTestResult.reason}`);
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Require base-red for EVERY materialized test file: complete coverage, non-empty, all failed.
    // A missing/extra/empty result set must NOT vacuously satisfy base-red (fail-closed): any file
    // without a recorded `passed === false` result (missing result, or hollow passed=true) leaves
    // biteEvidence absent.
    const passedByFile = new Map(baseTestResult.results.map((r) => [r.file, r.passed]));
    const notRed = materializedTestFiles.filter((f) => passedByFile.get(f) !== false);
    if (materializedTestFiles.length === 0 || notRed.length > 0) {
      diagnostics.push(
        `biteEvidence: base-red not established for all materialized tests on Evidence Base ` +
        `(missing result or hollow passed=true): ${notRed.join(", ") || "(no materialized tests)"}`,
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // (e) HEAD-green check — all materialized test files must pass at finalHeadOid
    const headTestResult = await runtime.runTestsAtCommit!(finalHeadOid, materializedTestFiles, cwd, config);
    if (headTestResult.kind === "unavailable") {
      diagnostics.push(`biteEvidence: runTestsAtCommit(finalHeadOid) unavailable: ${headTestResult.reason}`);
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Symmetric to base-red: complete coverage required. Any file without passed===true is a gap.
    const headPassedByFile = new Map(headTestResult.results.map((r) => [r.file, r.passed]));
    const notGreen = materializedTestFiles.filter((f) => headPassedByFile.get(f) !== true);
    if (materializedTestFiles.length === 0 || notGreen.length > 0) {
      diagnostics.push(
        `biteEvidence: HEAD-green not established — all materialized tests must pass at finalHeadOid ` +
        `(missing result, red, or coverage gap): ${notGreen.join(", ") || "(no materialized tests)"}`,
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // All checks passed: base:red + HEAD:green + scenario frozen + forward type.
    achieved["biteEvidence"] = "required";
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence: bite evidence evaluation threw: ${reason}`);
    // biteEvidence absent
  }

  return { achieved: achieved as ProfileAssurance, diagnostics };
}
