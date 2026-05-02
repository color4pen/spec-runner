/**
 * Orchestrator for finish command.
 * Sequences all finish steps and handles escalation exit.
 *
 * TC-045: OPEN_MERGEABLE → full flow completes
 * TC-046: MERGED + archive incomplete → resume from archive
 * TC-047: status=archived → "Already finished, nothing to do."
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs, FinishFlags } from "./types.js";
import { loadJobState } from "../../state/store.js";
import { resolveTarget } from "./resolve-target.js";
import { fetchPrState } from "./pr-state.js";
import { mergeFeaturePr } from "./merge-feature-pr.js";
import { archiveOpenspec } from "./archive-openspec.js";
import { moveRequestsDir } from "./move-requests-dir.js";
import { checkArchivePrAlreadyMerged, prepareArchiveBranch, pushAndCreateArchivePr } from "./archive-pr.js";
import { assertJobFinishable, markJobArchived } from "./job-state-update.js";
import { isFullyFinished } from "./idempotency.js";
import { formatEscalation } from "./escalation.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

export interface FinishInput {
  jobId?: string;
  slug?: string;
  flags: FinishFlags;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
}

export type FinishResult =
  | { exitCode: 0 }
  | { exitCode: 1; escalation: string }
  | { exitCode: 2; message: string };

/**
 * Run the full finish orchestration.
 * Returns exit code to caller (CLI entry does process.exit()).
 */
export async function runFinishOrchestrator(
  input: FinishInput,
  stdoutWrite: (msg: string) => void = (m) => process.stdout.write(m + "\n"),
): Promise<FinishResult> {
  const { jobId, slug, flags, cwd, spawn, fs } = input;

  // Step 1: Resolve target job
  const resolveResult = await resolveTarget({ jobId, slug, cwd }, stdoutWrite);
  if (!resolveResult.ok) {
    return { exitCode: 2, message: resolveResult.message };
  }

  const target = resolveResult.target;

  // Step 2: Load job state and check eligibility
  let state;
  try {
    state = await loadJobState(target.jobId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message };
  }

  // TC-047: Already finished → no-op
  if (isFullyFinished(state)) {
    stdoutWrite("Already finished, nothing to do.");
    return { exitCode: 0 };
  }

  // TC-031: Running job → reject
  try {
    assertJobFinishable(state);
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FINISHABLE) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "job-state-gate",
          detectedState: `JOB_NOT_FINISHABLE (status=${state.status})`,
          recommendedAction: `Wait for the running job to complete, or check its progress with \`specrunner ps\`.`,
          resumeCommand: `specrunner finish ${target.jobId}`,
        }),
      };
    }
    throw err;
  }

  // Step 3: Fetch PR state
  stdoutWrite(`Checking PR #${target.prNumber} state...`);
  const prStateResult = await fetchPrState(target.prNumber, cwd, spawn);

  if (!prStateResult.ok) {
    return {
      exitCode: 1,
      escalation: [
        "=== specrunner finish: escalation ===",
        "",
        `Failed Step:       pr-state-detection`,
        `Detected State:    gh pr view failed`,
        `Recommended Action:`,
        `  Check gh error: ${prStateResult.stderr.trim()}`,
        `  Ensure 'gh' is authenticated: specrunner login`,
        "",
        `Resume Command:    specrunner finish ${target.jobId}`,
        "",
        "=====================================",
      ].join("\n"),
    };
  }

  const prState = prStateResult.normalized;
  stdoutWrite(`PR #${target.prNumber} state: ${prState}`);

  // TC-022: CLOSED → escalation with cancel hint
  if (prState === "CLOSED") {
    return {
      exitCode: 1,
      escalation: [
        "=== specrunner finish: escalation ===",
        "",
        `Failed Step:       merge-feature-pr`,
        `Detected State:    CLOSED`,
        `Recommended Action:`,
        `  The PR was closed (not merged). Use 'specrunner cancel' to mark the job as cancelled.`,
        "",
        `Resume Command:    specrunner finish ${target.jobId}`,
        "",
        "=====================================",
      ].join("\n"),
    };
  }

  // Step 4: Merge feature PR (or skip)
  const mergeResult = await mergeFeaturePr({
    prNumber: target.prNumber,
    prState,
    force: flags.force ?? false,
    cleanupOnly: flags.cleanupOnly ?? false,
    cwd,
    spawn,
    jobId: target.jobId,
  });

  if (!mergeResult.ok) {
    return { exitCode: 1, escalation: mergeResult.escalation };
  }

  stdoutWrite(mergeResult.message);

  // Step 5: Archive idempotency probe — must run BEFORE any tree mutation
  // (openspec archive / git mv would otherwise land on the wrong branch
  // if a prior finish run already created and merged the archive PR).
  const archivePrAlreadyMerged = await checkArchivePrAlreadyMerged(
    target.slug,
    cwd,
    spawn,
  );

  if (archivePrAlreadyMerged) {
    stdoutWrite(`Archive PR for ${target.slug} already merged. Skipping archive steps.`);
    await markJobArchived(target.jobId);
    stdoutWrite(`Job ${target.jobId} marked as archived.`);
    return { exitCode: 0 };
  }

  // Step 6: Prepare archive branch — must run BEFORE openspec archive / git mv
  // so that those commits land on chore/archive-<slug>, NOT on the current
  // (typically main) branch. Re-uses git fetch + checkout from origin/main and
  // force-resets the branch via -B if a stale local copy from a prior failed
  // run is found.
  stdoutWrite(`Preparing archive branch chore/archive-${target.slug}...`);
  const prepareResult = await prepareArchiveBranch({
    slug: target.slug,
    jobId: target.jobId,
    cwd,
    spawn,
  });

  if (!prepareResult.ok) {
    return { exitCode: 1, escalation: prepareResult.escalation };
  }

  // Step 7: Archive openspec change folder (now committed onto archive branch)
  stdoutWrite(`Archiving openspec change folder...`);
  const openspecResult = await archiveOpenspec({
    slug: target.slug,
    jobId: target.jobId,
    cwd,
    spawn,
    fs,
  });

  if (!openspecResult.ok) {
    return { exitCode: 1, escalation: openspecResult.escalation };
  }

  stdoutWrite(openspecResult.message);

  // Step 8: Move requests dir (awaiting-merge → merged) and commit
  // (also lands on archive branch).
  stdoutWrite(`Moving requests dir to merged...`);
  const moveResult = await moveRequestsDir({
    slug: target.slug,
    jobId: target.jobId,
    cwd,
    spawn,
    fs,
  });

  if (!moveResult.ok) {
    return { exitCode: 1, escalation: moveResult.escalation };
  }

  stdoutWrite(moveResult.message);

  // Step 9: Push archive branch + create PR + auto-merge
  stdoutWrite(`Pushing archive branch and creating PR...`);
  const archivePrResult = await pushAndCreateArchivePr({
    slug: target.slug,
    jobId: target.jobId,
    cwd,
    spawn,
  });

  if (!archivePrResult.ok) {
    return { exitCode: 1, escalation: archivePrResult.escalation };
  }

  stdoutWrite(archivePrResult.message);

  // Step 10: Update job state to archived
  await markJobArchived(target.jobId);
  stdoutWrite(`Job ${target.jobId} marked as archived.`);

  // Step 11: Return to main branch — the archive branch's remote copy was
  // deleted by --delete-branch, leaving the user on a branch that no longer
  // exists on origin. Only restore on the success path; leave the branch
  // intact on failure so the user can debug.
  await spawn("git", ["checkout", "main"], { cwd });

  return { exitCode: 0 };
}
