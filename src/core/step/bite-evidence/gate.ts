/**
 * Bite-evidence gate decision logic (R4, bite-evidence-forward T-06).
 *
 * Given a job state and runtime context, determines whether the materialized tests
 * demonstrate that the implementation is necessary (base-red → candidate-green).
 *
 * Forward strategy: `request.type ∈ {bug-fix, new-feature}`.
 * Other types → strategy-deferred (no records, gate passes through).
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
import { resolveBaseCandidateOids } from "./oids.js";

/** Request types that use the forward strategy (base-red → candidate-green). */
const FORWARD_TYPES: ReadonlySet<string> = new Set(["bug-fix", "new-feature"]);

/**
 * Paths to exclude from materialized test files (pipeline artifacts).
 * Exported so that the archive floor gate (achieved-assurance.ts) can use the
 * same exclusion logic without duplicating the rule.
 */
export function isExcludedPath(filePath: string): boolean {
  return filePath.startsWith("specrunner/changes/") || filePath.startsWith(".specrunner/");
}

export type GateVerdict = "passed" | "failed" | "strategy-deferred";

export interface GateResult {
  verdict: GateVerdict;
  records: BiteEvidenceRecord[];
  reason?: string;
}

/**
 * Parameters for `runBiteEvidenceGate`.
 * runtimeStrategy is typed as a partial subset to allow test fakes that omit the new ports.
 *
 * digestArtifacts is optional: when provided (on runtimes that support it), per-file
 * content digests are embedded in BiteEvidenceRecord.testHash for archive freeze verification.
 * When absent, testHash is omitted from the record (backward compat).
 */
export interface GateDeps {
  state: JobState;
  cwd: string;
  slug: string;
  config: SpecRunnerConfig;
  runtimeStrategy: Pick<RuntimeStrategy, "listCommitChangedFiles" | "runTestsAtCommit"> & {
    digestArtifacts?: RuntimeStrategy["digestArtifacts"];
  } | null | undefined;
  tamperStatus: TamperStatus;
}

/**
 * Run the bite-evidence gate.
 *
 * Pure decision logic:
 *   1. Non-forward type → strategy-deferred.
 *   2. Tamper mismatch → failed.
 *   3. Missing base/candidate OIDs → strategy-deferred.
 *   4. Runtime unavailable (missing ports) → strategy-deferred.
 *   5. No materialized test files → failed.
 *   6. Run tests at base and candidate; build records; verify all base-red & candidate-green.
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

  // 3. Resolve base/candidate OIDs.
  const { baseOid, candidateOid } = resolveBaseCandidateOids(state);

  if (baseOid === null) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "base OID absent: test-materialize step has no commitOid recorded",
    };
  }

  if (candidateOid === null) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "candidate OID absent: implementer step has no commitOid recorded",
    };
  }

  // 4. Runtime capability check — both methods must be available.
  if (
    !runtimeStrategy ||
    typeof runtimeStrategy.listCommitChangedFiles !== "function" ||
    typeof runtimeStrategy.runTestsAtCommit !== "function"
  ) {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "runtime does not support listCommitChangedFiles / runTestsAtCommit (e.g. managed runtime or test fake)",
    };
  }

  // 5. Get the files changed by the base commit (materialized tests).
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

  // Filter to materialized test files only (exclude pipeline artifacts).
  const materializedTestFiles = changedFilesResult.files.filter(
    (f) => !isExcludedPath(f),
  );

  if (materializedTestFiles.length === 0) {
    return {
      verdict: "failed",
      records: [],
      reason: "no materialized tests: the base commit contains no test files outside specrunner/changes/ and .specrunner/",
    };
  }

  // 6. Run tests at base OID.
  let baseTestResult: Awaited<ReturnType<NonNullable<RuntimeStrategy["runTestsAtCommit"]>>>;
  try {
    baseTestResult = await runtimeStrategy.runTestsAtCommit!(baseOid, materializedTestFiles, cwd, config);
  } catch {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: "runTestsAtCommit (base) threw unexpectedly",
    };
  }

  if (baseTestResult.kind === "unavailable") {
    return {
      verdict: "strategy-deferred",
      records: [],
      reason: `runTestsAtCommit (base) unavailable: ${baseTestResult.reason}`,
    };
  }

  // 7. Run tests at candidate OID.
  let candidateTestResult: Awaited<ReturnType<NonNullable<RuntimeStrategy["runTestsAtCommit"]>>>;
  try {
    candidateTestResult = await runtimeStrategy.runTestsAtCommit!(candidateOid, materializedTestFiles, cwd, config);
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

  // 8. Build per-file BiteEvidenceRecords and determine overall verdict.
  const baseResults = new Map(baseTestResult.results.map((r) => [r.file, r.passed]));
  const candidateResults = new Map(candidateTestResult.results.map((r) => [r.file, r.passed]));

  // Compute per-file content digests when digestArtifacts is available.
  // Used for archive freeze verification (testHash in BiteEvidenceRecord).
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
    // Default: treat absent result as failed (conservative)
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
      baseOid,
      candidateOid,
    };

    // Attach testHash when digestArtifacts was available and produced a hash for this file.
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
