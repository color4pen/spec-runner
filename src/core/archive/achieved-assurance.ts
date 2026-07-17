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

import type { JobState, ProfileAssurance } from "../../state/schema.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { AssuranceFloor } from "../../state/profile.js";
import { resolveBaseCandidateOids } from "../step/bite-evidence/oids.js";
import { isExcludedPath } from "../step/bite-evidence/gate.js";
import { STEP_NAMES } from "../../kernel/step-names.js";

/**
 * Narrow runtime interface required by the archive floor gate.
 * A subset of RuntimeStrategy — only the methods needed for provenance derivation.
 */
export type AssuranceProvenanceRuntime = Pick<
  RuntimeStrategy,
  "listCommitChangedFiles" | "runTestsAtCommit" | "diffPathsBetweenCommits"
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
 * Derive the "achieved" assurance for a job from mechanical provenance.
 *
 * Rules (each dimension independent):
 *
 * **specReview**: presence of at least one spec-review step run in state.steps.
 *   → "required" (achieved) when present, absent otherwise. Pure state lookup; no I/O.
 *
 * **biteEvidence** / **testDerivation**: only evaluated when the floor constrains either.
 *   Requires: baseOid resolvable + finalHeadOid defined + runtime available + runtime methods.
 *   (a) Enumerate materializedTestFiles via listCommitChangedFiles(baseOid) + isExcludedPath filter.
 *   (b) Freeze check: diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles).
 *       → tamper (non-empty diff) → both absent.
 *   (c) Base-red check: runTestsAtCommit(baseOid, materializedTestFiles) → all must be failed.
 *       → unavailable or any passed → biteEvidence absent.
 *   testDerivation = "frozen" when (a) baseOid resolvable + (b) freeze intact.
 *   biteEvidence = "required" when (a) + (b) + (c) all satisfied.
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
  // specReview: pure state lookup (no I/O)
  // ---------------------------------------------------------------------------
  try {
    const specReviewRuns = state.steps?.[STEP_NAMES.SPEC_REVIEW];
    if (Array.isArray(specReviewRuns) && specReviewRuns.length > 0) {
      achieved["specReview"] = "required";
    }
    // else: absent (no spec-review run recorded)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`specReview derivation error: ${reason}`);
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

  // (P2) baseOid must be resolvable from test-materialize step.
  let baseOid: string | null;
  try {
    const oids = resolveBaseCandidateOids(state);
    baseOid = oids.baseOid;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence/testDerivation: resolveBaseCandidateOids error: ${reason}`);
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  if (baseOid === null) {
    diagnostics.push("biteEvidence/testDerivation: baseOid is null — test-materialize step has no commitOid recorded");
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // (P3) Runtime must be available with all required methods.
  if (
    !runtime ||
    typeof runtime.listCommitChangedFiles !== "function" ||
    typeof runtime.diffPathsBetweenCommits !== "function" ||
    typeof runtime.runTestsAtCommit !== "function"
  ) {
    diagnostics.push(
      "biteEvidence/testDerivation: runtime is unavailable or missing required methods " +
      "(listCommitChangedFiles / diffPathsBetweenCommits / runTestsAtCommit)",
    );
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // (P4) config must be defined (needed for runTestsAtCommit scoping).
  if (config === undefined) {
    diagnostics.push("biteEvidence/testDerivation: config is undefined — cannot run tests");
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (a) Enumerate materialized test files from base commit
  // ---------------------------------------------------------------------------
  let materializedTestFiles: string[];
  try {
    const changedFilesResult = await runtime.listCommitChangedFiles!(baseOid, cwd);
    if (changedFilesResult.kind === "unavailable") {
      diagnostics.push(`biteEvidence/testDerivation: listCommitChangedFiles unavailable: ${changedFilesResult.reason}`);
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }
    materializedTestFiles = changedFilesResult.files.filter((f) => !isExcludedPath(f));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence/testDerivation: listCommitChangedFiles threw: ${reason}`);
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  if (materializedTestFiles.length === 0) {
    diagnostics.push("biteEvidence/testDerivation: 0 materialized test files found in base commit (all paths excluded or commit empty)");
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // ---------------------------------------------------------------------------
  // (b) Freeze check: verify materializedTestFiles are byte-identical baseOid→finalHeadOid
  // ---------------------------------------------------------------------------
  let freezeIntact = false;
  try {
    const diffResult = await runtime.diffPathsBetweenCommits!(baseOid, finalHeadOid, materializedTestFiles, cwd);
    if (diffResult.kind === "unavailable") {
      diagnostics.push(`biteEvidence/testDerivation: diffPathsBetweenCommits unavailable: ${diffResult.reason}`);
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }
    if (diffResult.files.length > 0) {
      diagnostics.push(
        `biteEvidence/testDerivation: tamper detected — test files changed between baseOid and HEAD: ${diffResult.files.join(", ")}`,
      );
      // Freeze broken: both dimensions remain absent.
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }
    freezeIntact = true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence/testDerivation: diffPathsBetweenCommits threw: ${reason}`);
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // testDerivation: baseOid resolvable + freeze intact → "frozen"
  if (freezeIntact) {
    achieved["testDerivation"] = "frozen";
  }

  // ---------------------------------------------------------------------------
  // (c) Base-red check: run tests at baseOid — all must be failed (base-red)
  // ---------------------------------------------------------------------------
  try {
    const baseTestResult = await runtime.runTestsAtCommit!(baseOid, materializedTestFiles, cwd, config);
    if (baseTestResult.kind === "unavailable") {
      diagnostics.push(`biteEvidence: runTestsAtCommit unavailable: ${baseTestResult.reason}`);
      // biteEvidence absent (testDerivation already set above if freeze intact)
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Require base-red for EVERY materialized test file: complete coverage, non-empty, all failed.
    // A missing/extra/empty result set must NOT vacuously satisfy base-red (fail-closed): any file
    // without a recorded `passed === false` result (missing result, or hollow passed=true) leaves
    // biteEvidence absent. `some(passed)` alone would fail-open on empty/partial results.
    const passedByFile = new Map(baseTestResult.results.map((r) => [r.file, r.passed]));
    const notRed = materializedTestFiles.filter((f) => passedByFile.get(f) !== false);
    if (materializedTestFiles.length === 0 || notRed.length > 0) {
      diagnostics.push(
        `biteEvidence: base-red not established for all materialized tests at baseOid ` +
        `(missing result or hollow passed=true): ${notRed.join(", ") || "(no materialized tests)"}`,
      );
      // biteEvidence absent (testDerivation already set if freeze intact)
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Every materialized test genuinely red at base — biteEvidence achieved.
    achieved["biteEvidence"] = "required";
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence: runTestsAtCommit threw: ${reason}`);
    // biteEvidence absent
  }

  return { achieved: achieved as ProfileAssurance, diagnostics };
}
