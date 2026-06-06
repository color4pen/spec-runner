/**
 * RunResult: terminal contract for run / resume commands.
 *
 * Design D2: status → kind mapping is the single truth in this module.
 * Design D3: JSON schema for the terminal contract.
 * Design D5: mapping rules for each terminal status.
 */
import type { JobState } from "../../state/schema.js";

export type RunResultKind = "pr-created" | "awaiting-human" | "failed";

/**
 * Terminal contract emitted to stdout when --json is specified.
 * schemaVersion allows consumers to detect future field additions.
 */
export interface RunResultContract {
  schemaVersion: 1;
  result: RunResultKind;
  slug: string;
  jobId: string;
  step: string;
  prUrl: string | null;
  reason: { code: string | null; message: string } | null;
}

/**
 * Map a terminal JobState to a RunResultContract.
 * Pure function — no I/O, no side effects.
 *
 * Mapping rules (D5):
 *   awaiting-archive  → pr-created
 *   awaiting-resume   → awaiting-human
 *   everything else   → failed
 *
 * Special case: SPEC_REVIEW_RESULT_NOT_FOUND is treated as "failed" for machine
 * consumers even when the pipeline set status to "awaiting-resume" (because
 * handleResult() returns exit 1 and does not proceed to the normal awaiting-resume flow).
 */
export function buildRunResult(state: JobState, slug: string): RunResultContract {
  if (state.error?.code === "SPEC_REVIEW_RESULT_NOT_FOUND") {
    return {
      schemaVersion: 1,
      result: "failed",
      slug,
      jobId: state.jobId,
      step: state.resumePoint?.step ?? state.step,
      prUrl: state.pullRequest?.url ?? null,
      reason: {
        code: state.error.code,
        message: state.error.message,
      },
    };
  }

  if (state.status === "awaiting-archive") {
    return {
      schemaVersion: 1,
      result: "pr-created",
      slug,
      jobId: state.jobId,
      step: state.step,
      prUrl: state.pullRequest?.url ?? null,
      reason: null,
    };
  }

  if (state.status === "awaiting-resume") {
    return {
      schemaVersion: 1,
      result: "awaiting-human",
      slug,
      jobId: state.jobId,
      step: state.resumePoint?.step ?? state.step,
      prUrl: state.pullRequest?.url ?? null,
      reason: {
        code: state.error?.code ?? null,
        message:
          state.resumePoint?.reason ??
          state.error?.message ??
          "awaiting human judgment",
      },
    };
  }

  // failed or any other terminal status
  return {
    schemaVersion: 1,
    result: "failed",
    slug,
    jobId: state.jobId,
    step: state.step,
    prUrl: state.pullRequest?.url ?? null,
    reason: {
      code: state.error?.code ?? null,
      message: state.error?.message ?? "unknown error",
    },
  };
}

/**
 * Serialize a RunResultContract to a JSON string.
 * Matches the format used by `doctor` and `request review` (2-space indent + trailing newline).
 */
export function formatRunResultJson(contract: RunResultContract): string {
  return JSON.stringify(contract, null, 2) + "\n";
}
