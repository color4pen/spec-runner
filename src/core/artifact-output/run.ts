/**
 * ArtifactOutputRun — minimal vertical orchestrator for the artifact-output profile.
 * T-09: run.ts — orchestrates the 9-phase pipeline.
 *
 * All dependencies are injected via the input object; no globals or environment access.
 * GitHub client is NOT imported (type or value).
 *
 * Phase sequence (matches request scope §最小実測スコープ):
 * 1. Preflight
 * 2. Request load
 * 3. Baseline snapshot → evidence
 * 4. Run root + candidate creation + materialize
 * 5. Agent execution
 * 6. Verification (revision-bound)
 * 7. Change set + patch derivation (uses frozen candidate from step 6)
 * 8. Review (revision-bound)
 * 8.5. Cross-phase digest check
 * 9. Artifact finalize + source-unchanged assertion
 */
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { planEffectivePipeline } from "./preflight.js";
import { createRunRoot, baselineSnapshotPath, candidateDir, artifactStagingDir, artifactDir, runJsonPath } from "./run-layout.js";
import { materializeCandidate } from "./materialize.js";
import { assertSourceUnchanged } from "./source-guard.js";
import { createGitDenyingSpawn } from "./guarded-spawn.js";
import { runBoundToCandidateRevision } from "./revision-binding.js";
import { deriveChangeSet } from "../snapshot/compare.js";
import { collectSnapshot } from "../snapshot/collect.js";
import { buildPatch } from "./patch.js";
import { buildManifest } from "./manifest.js";
import { buildSnapshotContext } from "./context.js";
import { finalizeArtifact } from "./artifact-writer.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { PipelineDescriptor } from "../pipeline/types.js";
import type { DirectorySnapshot } from "../snapshot/types.js";
import type { EffectivePipelineReport } from "./preflight.js";
import type { VerificationRecord, ReviewRecord } from "./revision-binding.js";
import type { ChangeEntry } from "../snapshot/compare.js";
import { EXECUTION_PROFILE_IDS } from "./execution-profile.js";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface AgentSeam {
  run(candidateRoot: string, requestContent: string): Promise<void>;
}

export interface VerifySeam {
  run(candidateRoot: string, contextBlock: string): Promise<VerificationRecord>;
}

export interface ReviewSeam {
  run(candidateRoot: string, contextBlock: string): Promise<ReviewRecord>;
}

export interface ArtifactOutputRunInput {
  sourceRoot: string;
  runParentDir: string;
  runId: string;
  requestContent: string;
  exclusions?: readonly string[];
  pipelineDescriptor: PipelineDescriptor;
  profileId: string;

  // Seams
  agent: AgentSeam;
  verify: VerifySeam;
  review: ReviewSeam;
  spawn: SpawnFn;
  now?: () => number;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ArtifactOutputMetrics {
  durationMs: number;
  entryCount: number;
  scannedBytes: number;
  artifactBytes: number;
  payloadBytes: number;
  patchLines: number;
}

export type ArtifactOutputRunResult =
  | {
      kind: "completed";
      runId: string;
      runRoot: string;
      baselineDigest: string;
      candidateDigest: string;
      artifactPath: string;
      metrics: ArtifactOutputMetrics;
      preflightReport: EffectivePipelineReport;
    }
  | {
      kind: "halted";
      runId: string;
      runRoot?: string;
      reason: string;
      preflightReport?: EffectivePipelineReport;
    }
  | {
      kind: "failed";
      runId: string;
      runRoot?: string;
      reason: string;
      error?: unknown;
      preflightReport?: EffectivePipelineReport;
    };

// ─── Run JSON status ──────────────────────────────────────────────────────────

interface RunJson {
  runId: string;
  status: "running" | "completed" | "halted" | "failed";
  phase: string;
  baselineDigest?: string;
  candidateDigest?: string;
  metrics?: ArtifactOutputMetrics;
  preflightReport?: EffectivePipelineReport;
  resume: { supported: false; reason: string };
  error?: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run the artifact-output pipeline.
 * Never throws — all errors are captured into the result discriminated union.
 */
export async function runArtifactOutput(
  input: ArtifactOutputRunInput,
): Promise<ArtifactOutputRunResult> {
  const startMs = (input.now ?? Date.now)();
  const { runId, sourceRoot, runParentDir, requestContent } = input;
  const exclusions = input.exclusions ?? [".git/"];
  const collectOpts = { exclusions };
  const _guardedSpawn = createGitDenyingSpawn(input.spawn);

  // Phase 1: Preflight
  let preflightReport: EffectivePipelineReport;
  try {
    preflightReport = planEffectivePipeline(
      input.pipelineDescriptor,
      input.profileId as typeof EXECUTION_PROFILE_IDS[keyof typeof EXECUTION_PROFILE_IDS],
    );
  } catch (err) {
    return { kind: "failed", runId, reason: "Preflight error", error: err };
  }

  if (!preflightReport.executable) {
    return {
      kind: "halted",
      runId,
      reason: `Pipeline is not executable in profile '${input.profileId}': ` +
        preflightReport.unsupported.map((u) => `${u.step} missing ${u.missing.join(",")}`).join("; "),
      preflightReport,
    };
  }

  // Phase 3: Baseline snapshot
  const baselineResult = await collectSnapshot(sourceRoot, collectOpts);
  if (baselineResult.kind === "unavailable") {
    return {
      kind: "failed",
      runId,
      reason: `Baseline snapshot unavailable: ${baselineResult.reason}`,
      preflightReport,
    };
  }
  const baselineSnapshot: DirectorySnapshot = baselineResult.snapshot;
  const baselineDigest = baselineSnapshot.digest;

  // Phase 4: Create run root + materialize candidate
  let runRoot: string;
  try {
    runRoot = await createRunRoot(runParentDir, runId);
  } catch (err) {
    return { kind: "failed", runId, reason: "Failed to create run root", error: err, preflightReport };
  }

  // Write initial run.json — phases 1 (preflight) and 3 (baseline-snapshot) are complete;
  // entering phase 4 (materialize). Phases 2-3 cannot be tracked before the run root exists.
  const runJson: RunJson = {
    runId,
    status: "running",
    phase: "baseline-snapshot",
    baselineDigest,
    resume: { supported: false, reason: "artifact-output profile does not support resume" },
    preflightReport,
  };
  await writeRunJson(runRoot, runJson);

  // Write baseline snapshot evidence
  await writeJson(baselineSnapshotPath(runRoot), baselineSnapshot);

  // Phase 4: Materialize candidate
  runJson.phase = "materialize";
  await writeRunJson(runRoot, runJson);

  const candidateRoot = candidateDir(runRoot);
  try {
    await materializeCandidate(sourceRoot, candidateRoot, baselineSnapshot);
  } catch (err) {
    runJson.status = "failed";
    runJson.phase = "materialize";
    runJson.error = String(err);
    await writeRunJson(runRoot, runJson);
    return { kind: "failed", runId, runRoot, reason: "Materialization failed", error: err, preflightReport };
  }

  // Phase 5: Agent execution
  runJson.phase = "agent";
  await writeRunJson(runRoot, runJson);

  try {
    await input.agent.run(candidateRoot, requestContent);
  } catch (err) {
    runJson.status = "failed";
    runJson.phase = "agent";
    runJson.error = String(err);
    await writeRunJson(runRoot, runJson);
    return { kind: "failed", runId, runRoot, reason: "Agent execution failed", error: err, preflightReport };
  }

  // Phase 6: Verification (revision-bound)
  runJson.phase = "verification";
  await writeRunJson(runRoot, runJson);

  // D14: take the pre-verification snapshot ourselves so we can build the context block
  // with the actual candidate digest (not a placeholder).
  const preVerifySnapshotResult = await collectSnapshot(candidateRoot, collectOpts);
  if (preVerifySnapshotResult.kind === "unavailable") {
    runJson.status = "halted";
    runJson.error = `Pre-verification snapshot unavailable: ${preVerifySnapshotResult.reason}`;
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "halted", runId, runRoot, reason: `Pre-verification snapshot unavailable: ${preVerifySnapshotResult.reason}`, preflightReport };
  }

  // D14: changesNotYetDerived=true renders an explicit marker instead of the
  // misleading '(no changes)' — the change set has not been derived yet at this phase.
  const preVerifyContext = buildSnapshotContext({
    baselineDigest,
    candidateDigest: preVerifySnapshotResult.snapshot.digest,
    changes: [],
    changesNotYetDerived: true,
  });

  const verifyBound = await runBoundToCandidateRevision<VerificationRecord>(
    candidateRoot,
    () => input.verify.run(candidateRoot, preVerifyContext.contextBlock),
    collectOpts,
    preVerifySnapshotResult.snapshot, // pass pre-snapshot to avoid redundant collection
  );

  if (verifyBound.kind === "unavailable") {
    runJson.status = "halted";
    runJson.phase = "verification";
    runJson.error = verifyBound.reason;
    await writeRunJson(runRoot, runJson);

    // Source unchanged check even on failure
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "halted", runId, runRoot, reason: `Verification snapshot unavailable: ${verifyBound.reason}`, preflightReport };
  }

  if (verifyBound.kind === "revision-drift") {
    runJson.status = "halted";
    runJson.phase = "verification";
    runJson.error = `Revision drift during verification: before=${verifyBound.before} after=${verifyBound.after}`;
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "halted", runId, runRoot, reason: "Revision drift during verification", preflightReport };
  }

  if (verifyBound.result.outcome === "failed") {
    runJson.status = "halted";
    runJson.phase = "verification";
    runJson.error = `Verification failed: ${verifyBound.result.details ?? ""}`;
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "halted", runId, runRoot, reason: "Verification failed", preflightReport };
  }

  // Step 7: Change set derivation — uses frozen candidate from step 6 (no re-scan)
  const frozenCandidateSnapshot = verifyBound.frozenSnapshot;
  const candidateDigest = verifyBound.digest;
  const verificationRecord: VerificationRecord = {
    ...verifyBound.result,
    candidateDigest,
  };

  const changeSetResult = deriveChangeSet(baselineSnapshot, frozenCandidateSnapshot);
  if (changeSetResult.kind === "unavailable") {
    runJson.status = "halted";
    runJson.phase = "change-set";
    runJson.error = changeSetResult.reason;
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "halted", runId, runRoot, reason: `Change set unavailable: ${changeSetResult.reason}`, preflightReport };
  }
  const changes: readonly ChangeEntry[] = changeSetResult.changes;

  // Build patch
  const readFile = async (absPath: string): Promise<Uint8Array | null> => {
    try {
      return new Uint8Array(await fs.readFile(absPath));
    } catch {
      return null;
    }
  };
  const patchResult = await buildPatch(changes, candidateRoot, sourceRoot, readFile);

  // Phase 8: Review (revision-bound)
  runJson.phase = "review";
  await writeRunJson(runRoot, runJson);

  const reviewContext = buildSnapshotContext({
    baselineDigest,
    candidateDigest,
    changes,
    patchEntries: patchResult.entries,
  });

  const reviewBound = await runBoundToCandidateRevision<ReviewRecord>(
    candidateRoot,
    () => input.review.run(candidateRoot, reviewContext.contextBlock),
    collectOpts,
  );

  if (reviewBound.kind === "unavailable") {
    runJson.status = "halted";
    runJson.phase = "review";
    runJson.error = reviewBound.reason;
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "halted", runId, runRoot, reason: `Review snapshot unavailable: ${reviewBound.reason}`, preflightReport };
  }

  if (reviewBound.kind === "revision-drift") {
    runJson.status = "halted";
    runJson.phase = "review";
    runJson.error = `Revision drift during review`;
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "halted", runId, runRoot, reason: "Revision drift during review", preflightReport };
  }

  // Phase 8.5: Cross-phase digest check
  const reviewDigest = reviewBound.digest;
  if (verifyBound.digest !== reviewDigest) {
    runJson.status = "halted";
    runJson.phase = "cross-phase-check";
    runJson.error = `Cross-phase digest mismatch: verification=${verifyBound.digest} review=${reviewDigest}`;
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return {
      kind: "halted",
      runId,
      runRoot,
      reason: "revision-drift: verification and review bound digests do not match",
      preflightReport,
    };
  }

  const reviewRecord: ReviewRecord = {
    ...reviewBound.result,
    candidateDigest,
  };

  // Phase 9: Artifact finalize
  runJson.phase = "finalize";
  runJson.candidateDigest = candidateDigest;
  await writeRunJson(runRoot, runJson);

  const manifest = buildManifest({
    runId,
    profile: input.profileId,
    sourceRoot,
    exclusions,
    baselineDigest,
    candidateDigest,
    changes,
    patchEntries: patchResult.entries,
    verification: {
      boundDigest: candidateDigest,
      outcome: verificationRecord.outcome,
      details: verificationRecord.details,
    },
    review: {
      boundDigest: candidateDigest,
      outcome: reviewRecord.outcome,
      findings: reviewRecord.findings,
    },
  });

  const stagingDir = artifactStagingDir(runRoot);
  const finalArtifactDir = artifactDir(runRoot);

  try {
    await finalizeArtifact({
      stagingDir,
      artifactDir: finalArtifactDir,
      candidateRoot,
      baselineRoot: sourceRoot,
      manifest,
      patchText: patchResult.patchText,
      patchEntries: patchResult.entries,
      changes,
      verificationRecord,
      reviewRecord,
    });
  } catch (err) {
    runJson.status = "failed";
    runJson.phase = "finalize";
    runJson.error = String(err);
    await writeRunJson(runRoot, runJson);
    await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
    return { kind: "failed", runId, runRoot, reason: "Artifact finalization failed", error: err, preflightReport };
  }

  // Source unchanged final check — D6: fail-closed; if mutated/unverifiable, return failed
  const sourceMutatedOnSuccess = await checkSourceUnchanged(sourceRoot, baselineDigest, collectOpts, runJson, runRoot);
  if (sourceMutatedOnSuccess) {
    // runJson.status is already 'failed' and written by checkSourceUnchanged
    return { kind: "failed", runId, runRoot, reason: "Source was mutated during run", preflightReport };
  }

  // Compute metrics
  const durationMs = (input.now ?? Date.now)() - startMs;
  const entryCount = frozenCandidateSnapshot.entries.length;
  const scannedBytes = frozenCandidateSnapshot.entries.reduce(
    (sum, e) => sum + (e.size ?? 0),
    0,
  );

  let artifactBytes = 0;
  let payloadBytes = 0;
  try {
    artifactBytes = await dirSize(finalArtifactDir);
    payloadBytes = await dirSize(nodePath.join(finalArtifactDir, "payload")).catch(() => 0);
  } catch { /* best-effort */ }

  const patchLines = patchResult.patchText.split("\n").length;

  const metrics: ArtifactOutputMetrics = {
    durationMs,
    entryCount,
    scannedBytes,
    artifactBytes,
    payloadBytes,
    patchLines,
  };

  runJson.status = "completed";
  runJson.phase = "done";
  runJson.metrics = metrics;
  await writeRunJson(runRoot, runJson);

  return {
    kind: "completed",
    runId,
    runRoot,
    baselineDigest,
    candidateDigest,
    artifactPath: finalArtifactDir,
    metrics,
    preflightReport,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeRunJson(runRoot: string, data: RunJson): Promise<void> {
  await writeJson(runJsonPath(runRoot), data);
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(nodePath.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Check that the source directory is unchanged since the baseline snapshot.
 * Returns true if mutation or unverifiable was detected (status set to 'failed'),
 * false if source is unchanged.
 *
 * D6 fail-closed: always sets runJson.status = 'failed' on mutation/unverifiable,
 * regardless of current status. The guard previously checked `=== 'completed'`
 * but that fired too late on the success path (status was still 'running').
 *
 * Fail-closed on writeRunJson errors: if mutation is detected but the subsequent
 * writeRunJson call throws, we still return true so the caller treats the run as
 * failed rather than completed (prevents 'not mutated' from being reported when
 * the source was actually corrupted).
 */
async function checkSourceUnchanged(
  sourceRoot: string,
  baselineDigest: string,
  collectOpts: { exclusions: readonly string[] },
  runJson: RunJson,
  runRoot: string,
): Promise<boolean> {
  // Track whether mutation/unverifiable was detected before attempting writeRunJson.
  // If writeRunJson throws after mutation is detected, we must still return true.
  let mutationDetected = false;
  try {
    const guardResult = await assertSourceUnchanged(sourceRoot, baselineDigest, collectOpts);
    if (guardResult.kind === "mutated") {
      mutationDetected = true;
      runJson.error = (runJson.error ?? "") + " | source-mutated: " + guardResult.currentDigest;
      runJson.status = "failed";
      await writeRunJson(runRoot, runJson);
      return true;
    } else if (guardResult.kind === "unverifiable") {
      // Fail-closed: cannot confirm source is unchanged → record as failure.
      // D6: "不一致なら fail-closed で記録する" — unverifiable is not the same as unchanged.
      mutationDetected = true;
      runJson.error = (runJson.error ?? "") + " | source-unverifiable: " + guardResult.reason;
      runJson.status = "failed";
      await writeRunJson(runRoot, runJson);
      return true;
    }
    // guardResult.kind === "unchanged" → no action needed
    return false;
  } catch {
    // If mutation was detected but writeRunJson threw, still return true (fail-closed).
    // If assertSourceUnchanged itself threw, we cannot verify source state → treat as unchanged
    // (best-effort; the guard cannot confirm mutation either way).
    return mutationDetected;
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(fullPath);
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      total += stat.size;
    }
  }
  return total;
}
