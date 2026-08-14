/**
 * Bite-evidence gate decision logic (R4, bite-evidence-forward T-06).
 *
 * Given a job state and runtime context, determines whether the materialized tests
 * demonstrate that the implementation is necessary (base-red → candidate-green).
 *
 * Forward strategy: `request.type ∈ {bug-fix, new-feature}`.
 * Other types → strategy-deferred (no records, gate passes through).
 *
 * Evidence Base red side:
 *   base = immutable job base tree (synthesizedCommits[0]^) + overlay of candidate
 *   test files at HEAD. Evaluated via runTestsOnSynthesizedTree.
 *
 * Green candidate:
 *   branch HEAD (captureHeadSha) — includes pipeline-synthesized + operator-adopted commits.
 *
 * Gate verdicts:
 *   - "passed":           all materialized test files are base-red AND candidate-green.
 *   - "failed":           a test is hollow (base-green) or candidate-red; or tamper detected.
 *   - "strategy-deferred": non-forward type, missing OIDs, unavailable runtime, no test files.
 */

import type { JobState, BiteEvidenceRecord } from "../../../state/schema.js";
import type { RuntimeStrategy } from "../../port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { TamperStatus } from "./tamper.js";
import { resolveBaseCandidateOids, resolveEvidenceBaseRev } from "./oids.js";
import { selectMaterializedTestFiles } from "./test-file-selection.js";

/**
 * Re-export isExcludedPath from the shared module for backward compatibility.
 * (Callers that previously imported isExcludedPath from gate.ts continue to work.)
 */
export { isExcludedPath } from "./test-file-selection.js";

/**
 * Request types that use the forward strategy (base-red → candidate-green).
 *
 * Exported as a single source of truth so the archive floor gate
 * (achieved-assurance.ts) can use the same set without duplicating the rule.
 * ADR-20260716 D2: type determines bite strategy.
 */
export const FORWARD_TYPES: ReadonlySet<string> = new Set(["bug-fix", "new-feature"]);

export type GateVerdict = "passed" | "failed" | "strategy-deferred";

export interface GateResult {
  verdict: GateVerdict;
  records: BiteEvidenceRecord[];
  reason?: string;
}

/**
 * Parameters for `runBiteEvidenceGate`.
 * runtimeStrategy is typed as a partial subset to allow test fakes that omit methods.
 *
 * digestArtifacts is optional: when provided (on runtimes that support it), per-file
 * content digests are embedded in BiteEvidenceRecord.testHash (gate execution time worktree
 * content, i.e., candidate tree) for archive freeze reference.
 * When absent, testHash is omitted from the record (backward compat).
 */
export interface GateDeps {
  state: JobState;
  cwd: string;
  slug: string;
  config: SpecRunnerConfig;
  runtimeStrategy: Pick<
    RuntimeStrategy,
    "listCommitChangedFiles" | "runTestsAtCommit" | "runTestsOnSynthesizedTree" | "captureHeadSha"
  > & {
    digestArtifacts?: RuntimeStrategy["digestArtifacts"];
  } | null | undefined;
  tamperStatus: TamperStatus;
}

/**
 * Run the bite-evidence gate.
 *
 * Deferral order (design D6 — all short-circuit before HEAD capture and test execution):
 *   1. Non-forward type → strategy-deferred.
 *   2. Tamper mismatch → failed.
 *   3. Missing materialize OID (for file-set identification) → strategy-deferred.
 *   4. Absent Evidence Base ref (resolveEvidenceBaseRev null) → strategy-deferred.
 *   5. Runtime capability missing → strategy-deferred.
 *   6. Get changed files; empty selection → strategy-deferred.
 *   7. Capture HEAD (captureHeadSha null → strategy-deferred).
 *   8. Red: runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, headOid).
 *   9. Green: runTestsAtCommit(headOid, testFiles).
 *  10. Build BiteEvidenceRecords; candidateOid = headOid.
 *
 * Never throws — unexpected errors produce strategy-deferred with a reason.
 */
export async function runBiteEvidenceGate(deps: GateDeps): Promise<GateResult> {
  const { state, cwd, config, runtimeStrategy, tamperStatus } = deps;

  // 1. Non-forward type → strategy-deferred (no evidence generated).
  if (!FORWARD_TYPES.has(state.request.type)) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: `request.type "${state.request.type}" is not a forward-strategy type`,
    };
  }

  // 2. Tamper mismatch → fail-closed.
  if (tamperStatus === "mismatch") {
    return {
      verdict: "failed",
      records: [],
      reason: "tamper detected: test-cases.md hash does not match the frozen hash recorded at test-case-gen",
    };
  }

  // 3. Resolve base OID (latest test-materialize commit) for file-set identification.
  const { baseOid } = resolveBaseCandidateOids(state);
  if (baseOid === null) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "base OID absent: test-materialize step has no commitOid recorded",
    };
  }

  // 4. Resolve Evidence Base reference (immutable job base = synthesizedCommits[0]^).
  const evidenceBaseRev = resolveEvidenceBaseRev(state);
  if (evidenceBaseRev === null) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "Evidence Base reference absent: synthesizedCommits ledger is empty or absent — cannot establish job base tree",
    };
  }

  // 5. Runtime capability check — all four methods must be available.
  if (
    !runtimeStrategy ||
    typeof runtimeStrategy.listCommitChangedFiles !== "function" ||
    typeof runtimeStrategy.runTestsAtCommit !== "function" ||
    typeof runtimeStrategy.runTestsOnSynthesizedTree !== "function" ||
    typeof runtimeStrategy.captureHeadSha !== "function"
  ) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "runtime does not support all required methods (listCommitChangedFiles / runTestsAtCommit / runTestsOnSynthesizedTree / captureHeadSha — e.g. managed runtime or test fake)",
    };
  }

  // 6. Get the files changed by the base commit (materialized tests for set identification).
  let changedFilesResult: Awaited<ReturnType<NonNullable<RuntimeStrategy["listCommitChangedFiles"]>>>;
  try {
    changedFilesResult = await runtimeStrategy.listCommitChangedFiles!(baseOid, cwd);
  } catch {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "listCommitChangedFiles threw unexpectedly",
    };
  }

  if (changedFilesResult.kind === "unavailable") {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: `listCommitChangedFiles unavailable: ${changedFilesResult.reason}`,
    };
  }

  // Select materialized test files: exclude pipeline artifacts AND apply test-file patterns.
  const materializedTestFiles = selectMaterializedTestFiles(changedFilesResult.files, config);

  // No matching test files → strategy-deferred (unmeasurable, not a failed bite).
  if (materializedTestFiles.length === 0) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "no matching test files: the base commit contains no files matching the test-file selection patterns (fixture, config, or non-test-named files are excluded from per-file bite execution)",
    };
  }

  // 7. Capture HEAD OID (green candidate = effective branch state reaching adopted commits).
  let headOid: string | null;
  try {
    headOid = await runtimeStrategy.captureHeadSha!(cwd);
  } catch {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "captureHeadSha threw unexpectedly",
    };
  }

  if (headOid === null) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "HEAD OID absent: captureHeadSha returned null (no commits reachable as HEAD)",
    };
  }

  // 8. Red: run tests on Evidence Base (job base tree + test overlay from HEAD).
  let baseTestResult: Awaited<ReturnType<NonNullable<RuntimeStrategy["runTestsOnSynthesizedTree"]>>>;
  try {
    baseTestResult = await runtimeStrategy.runTestsOnSynthesizedTree!(
      evidenceBaseRev,
      materializedTestFiles,
      headOid,
      cwd,
      config,
    );
  } catch {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "runTestsOnSynthesizedTree (base) threw unexpectedly",
    };
  }

  if (baseTestResult.kind === "unavailable") {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: `runTestsOnSynthesizedTree (base) unavailable: ${baseTestResult.reason}`,
    };
  }

  // 9. Green: run tests at HEAD OID (candidate).
  let candidateTestResult: Awaited<ReturnType<NonNullable<RuntimeStrategy["runTestsAtCommit"]>>>;
  try {
    candidateTestResult = await runtimeStrategy.runTestsAtCommit!(headOid, materializedTestFiles, cwd, config);
  } catch {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "runTestsAtCommit (candidate) threw unexpectedly",
    };
  }

  if (candidateTestResult.kind === "unavailable") {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: `runTestsAtCommit (candidate) unavailable: ${candidateTestResult.reason}`,
    };
  }

  // 10. Build per-file BiteEvidenceRecords and determine overall verdict.
  const baseResults = new Map(baseTestResult.results.map((r) => [r.file, r.passed]));
  const candidateResults = new Map(candidateTestResult.results.map((r) => [r.file, r.passed]));

  // Compute per-file content digests when digestArtifacts is available.
  let testHashByFile: Map<string, string> | null = null;
  if (runtimeStrategy && typeof runtimeStrategy.digestArtifacts === "function") {
    try {
      const artifactRefs = materializedTestFiles.map((f) => ({ path: f }));
      const digestResults = await runtimeStrategy.digestArtifacts(artifactRefs, cwd, null);
      testHashByFile = new Map(
        digestResults
          .filter((r) => r.hash !== null)
          .map((r) => [r.path, r.hash as string]),
      );
    } catch {
      // best-effort: testHash absent is valid (backward compat)
      testHashByFile = null;
    }
  }

  const records: BiteEvidenceRecord[] = [];
  let allVerified = true;

  for (const file of materializedTestFiles) {
    const basePassed = baseResults.get(file) ?? false;
    const candidatePassed = candidateResults.get(file) ?? false;

    const baseResult: "red" | "green" = basePassed ? "green" : "red";
    const candidateResult: "red" | "green" = candidatePassed ? "green" : "red";
    const verified = !basePassed && candidatePassed; // base-red AND candidate-green

    if (!verified) {
      allVerified = false;
    }

    const record: BiteEvidenceRecord = {
      testId: file,
      strategy: "forward",
      baseResult,
      candidateResult,
      verified,
      baseOid: evidenceBaseRev, // Evidence Base rev (not the materialize commit)
      candidateOid: headOid,    // HEAD OID (includes adopted operator commits)
    };

    const hash = testHashByFile?.get(file);
    if (hash !== undefined) {
      record.testHash = hash;
    }

    records.push(record);
  }

  if (allVerified) {
    return { verdict: "passed", records };
  }

  return {
    verdict: "failed",
    records,
    reason: "one or more test files did not satisfy base-red → candidate-green (hollow test or implementation did not fix the test)",
  };
}
