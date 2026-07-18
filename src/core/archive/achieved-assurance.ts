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
import { resolveBaseCandidateOids } from "../step/bite-evidence/oids.js";
import { isExcludedPath, FORWARD_TYPES } from "../step/bite-evidence/gate.js";
import { STEP_NAMES } from "../../kernel/step-names.js";
import { fold } from "../../store/event-journal.js";

/**
 * Narrow runtime interface required by the archive floor gate.
 * A subset of RuntimeStrategy — only the methods needed for provenance derivation.
 *
 * readFileAtCommit is required for scenario two-layer freeze verification (P0-2).
 */
export type AssuranceProvenanceRuntime = Pick<
  RuntimeStrategy,
  | "listCommitChangedFiles"
  | "runTestsAtCommit"
  | "diffPathsBetweenCommits"
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
 * **specReview**: the LATEST spec-review step run must have outcome.verdict === "approved".
 *   → "required" (achieved) only when approved, absent otherwise. Pure state lookup; no I/O.
 *   (ADR P1: run existence alone is insufficient — approved verdict is required.)
 *
 * **biteEvidence** / **testDerivation**: only evaluated when the floor constrains either.
 *   Requires: baseOid resolvable + finalHeadOid defined + runtime available with all required
 *   methods (including readFileAtCommit) + config defined.
 *   (a) Enumerate materializedTestFiles via listCommitChangedFiles(baseOid) + isExcludedPath filter.
 *   (b) Blob freeze check: diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles).
 *       → tamper (non-empty diff) → both absent.
 *   (c) Scenario two-layer freeze (P0-2):
 *       - readFileAtCommit(finalHeadOid, "<slug>/events.jsonl") → fold → test-case-gen lineage → frozen hash.
 *       - readFileAtCommit(finalHeadOid, "<slug>/test-cases.md") → compute hash.
 *       - frozen hash non-null AND matches actual hash → scenario intact.
 *       → fail on any step → both absent (fail-closed).
 *   testDerivation = "frozen" when (a) + (b) blob freeze intact + (c) scenario freeze intact.
 *
 *   biteEvidence is additionally constrained to forward types only (P0-3, ADR-20260716 D2):
 *   (d) Type gate: state.request.type must be in FORWARD_TYPES (bug-fix / new-feature).
 *       → non-forward type → biteEvidence absent (fail-closed until forward strategy is implemented).
 *   (e) Base-red check: runTestsAtCommit(baseOid) → all must be failed (base-red).
 *       → unavailable or any passed → biteEvidence absent.
 *   (f) HEAD-green check (P0-1): runTestsAtCommit(finalHeadOid) → ALL must be passed (HEAD-green).
 *       → unavailable, any red, or coverage gap → biteEvidence absent.
 *   biteEvidence = "required" when (a) + (b) + (c) + (d) + (e) + (f) all satisfied.
 *   biteEvidence I/O (d/e/f) is skipped entirely when floor does not constrain biteEvidence.
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
  // specReview: check latest run verdict === "approved" (P1)
  // ---------------------------------------------------------------------------
  try {
    const specReviewRuns = state.steps?.[STEP_NAMES.SPEC_REVIEW];
    const latestRun = Array.isArray(specReviewRuns) ? specReviewRuns.at(-1) : undefined;
    if (latestRun?.outcome?.verdict === "approved") {
      achieved["specReview"] = "required";
    }
    // else: absent (no spec-review run, or latest run verdict is not "approved")
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

  // (P3) Runtime must be available with all required methods (including readFileAtCommit).
  if (
    !runtime ||
    typeof runtime.listCommitChangedFiles !== "function" ||
    typeof runtime.diffPathsBetweenCommits !== "function" ||
    typeof runtime.runTestsAtCommit !== "function" ||
    typeof runtime.readFileAtCommit !== "function"
  ) {
    diagnostics.push(
      "biteEvidence/testDerivation: runtime is unavailable or missing required methods " +
      "(listCommitChangedFiles / diffPathsBetweenCommits / runTestsAtCommit / readFileAtCommit)",
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
  // (b) Blob freeze check: verify materializedTestFiles are byte-identical baseOid→finalHeadOid
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

  // ---------------------------------------------------------------------------
  // (c) Scenario two-layer freeze check (P0-2, ADR D2)
  //
  // Verifies that test-cases.md at finalHeadOid matches the frozen hash recorded
  // in events.jsonl lineage by the test-case-gen step. This prevents archive authority
  // from accepting a "frozen" testDerivation when the scenario was tampered post-generation.
  //
  // Steps:
  //   1. Read events.jsonl at finalHeadOid (archived path suffix-resolved via readFileAtCommit).
  //   2. fold() → extract test-case-gen lineage → frozen hash of test-cases.md.
  //   3. Read test-cases.md at finalHeadOid → compute actual hash.
  //   4. Compare: frozen hash === actual hash.
  //
  // Fail-closed: any step failure (unavailable, missing, null hash, mismatch) → both absent.
  // ---------------------------------------------------------------------------
  let scenarioFreezeIntact = false;
  try {
    const slug = state.request?.slug;
    if (!slug) {
      diagnostics.push(
        "biteEvidence/testDerivation: request.slug is null/undefined — cannot suffix-resolve archived path for scenario freeze",
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Step 1: Read events.jsonl at finalHeadOid (suffix: "<slug>/events.jsonl")
    const eventsResult = await runtime.readFileAtCommit!(finalHeadOid, `${slug}/events.jsonl`, cwd);
    if (eventsResult.kind === "unavailable") {
      diagnostics.push(
        `biteEvidence/testDerivation: events.jsonl readFileAtCommit unavailable: ${eventsResult.reason}`,
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Step 2: fold() → extract test-case-gen lineage → frozen hash
    const foldResult = fold(eventsResult.content);
    const lineage = foldResult.lineage;

    const testCaseGenRecord = [...lineage].reverse().find((r) => r.step === "test-case-gen");
    if (!testCaseGenRecord) {
      diagnostics.push(
        "biteEvidence/testDerivation: no test-case-gen lineage record found in events.jsonl — scenario freeze inconclusive (fail-closed)",
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    const testCasesOutput = testCaseGenRecord.outputs.find((o) => o.path.endsWith("test-cases.md"));
    const frozenHash = testCasesOutput?.hash;
    if (frozenHash === null || frozenHash === undefined) {
      diagnostics.push(
        "biteEvidence/testDerivation: frozen hash is null/absent in test-case-gen lineage for test-cases.md — fail-closed",
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Step 3: Read test-cases.md at finalHeadOid (suffix: "<slug>/test-cases.md")
    const testCasesMdResult = await runtime.readFileAtCommit!(finalHeadOid, `${slug}/test-cases.md`, cwd);
    if (testCasesMdResult.kind === "unavailable") {
      diagnostics.push(
        `biteEvidence/testDerivation: test-cases.md readFileAtCommit unavailable: ${testCasesMdResult.reason}`,
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    // Step 4: Compare hashes
    const actualHash = computeContentHash(testCasesMdResult.content);
    if (actualHash !== frozenHash) {
      diagnostics.push(
        `biteEvidence/testDerivation: test-cases.md hash mismatch — scenario was tampered after test-case-gen. ` +
        `frozen=${frozenHash} actual=${actualHash}`,
      );
      return { achieved: achieved as ProfileAssurance, diagnostics };
    }

    scenarioFreezeIntact = true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence/testDerivation: scenario freeze check threw: ${reason}`);
    return { achieved: achieved as ProfileAssurance, diagnostics };
  }

  // testDerivation: both blob freeze AND scenario freeze intact → "frozen"
  // (type gate is NOT applied to testDerivation — it is strategy-independent)
  if (freezeIntact && scenarioFreezeIntact) {
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
  // (d) Type gate (P0-3, ADR-20260716 D2):
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
  // (e) Base-red check + (f) HEAD-green check (P0-1, ADR-20260717 D4)
  //
  // base-red: run tests at baseOid — all materialized test files must fail (red).
  // HEAD-green: run tests at finalHeadOid — all materialized test files must pass (green).
  // Both checks use the same materializedTestFiles to ensure complete coverage.
  //
  // Fail-closed:
  //   - unavailable (no scopedTestCommand) → absent
  //   - incomplete coverage (missing result) → absent
  //   - any red at HEAD / any non-red at base → absent
  // ---------------------------------------------------------------------------
  try {
    // (e) Base-red check
    const baseTestResult = await runtime.runTestsAtCommit!(baseOid, materializedTestFiles, cwd, config);
    if (baseTestResult.kind === "unavailable") {
      diagnostics.push(`biteEvidence: runTestsAtCommit(baseOid) unavailable: ${baseTestResult.reason}`);
      // biteEvidence absent (testDerivation already set above if conditions met)
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

    // (f) HEAD-green check — all materialized test files must pass at finalHeadOid
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

    // All checks passed: base:red + HEAD:green + scenario frozen + blob frozen + forward type.
    achieved["biteEvidence"] = "required";
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    diagnostics.push(`biteEvidence: runTestsAtCommit threw: ${reason}`);
    // biteEvidence absent
  }

  return { achieved: achieved as ProfileAssurance, diagnostics };
}
