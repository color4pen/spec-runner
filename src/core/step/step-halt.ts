/**
 * StepHalt discriminated union and factory functions.
 *
 * Represents a named failure or awaiting-resume value produced by each of the
 * 6 guard conditions in StepExecutor.runAgentStep. Each factory constructs a
 * StepHalt value; the executor applies persist / transition / rethrow in its
 * own scope (ownership unchanged — single-writer migration is R2).
 *
 * Design:
 *   - Values only: no side effects, no I/O.
 *   - Factory functions are 1:1 with executor guard sites (:380, :404, :442, :472, :525, :598).
 *   - Behavioral equivalence: each factory reproduces the same ErrorInfo and thrownErr
 *     as the guard it replaces.
 */
import type { ErrorInfo, JobState, StepName } from "../../state/schema.js";
import type { AgentRunResult } from "../port/agent-runner.js";
import type { OutputViolation } from "../port/output-contract.js";
import type { GuardDrift } from "./main-checkout-guard.js";
import { toStepName } from "./step-names.js";

/**
 * Type alias for the inline mainCheckoutDrift shape in JobState.
 * Avoids duplicating the inline literal type.
 */
type MainCheckoutDrift = NonNullable<JobState["mainCheckoutDrift"]>;

/**
 * StepHalt: the two possible non-success outcomes from a guard condition.
 *
 * - "failed": terminal failure → executor calls store.fail + attachStateAndRethrow.
 * - "awaiting-resume": interruptible pause → executor calls transitionJob("awaiting-resume") + attachStateAndRethrow.
 *
 * thrownErr is the Error to pass to attachStateAndRethrow. For guards that produce
 * a new error (output-gate, drift) it is constructed here. For guards that re-throw
 * the caught exception (agent-throw, timeout, non-success, commit-fail) it IS the
 * original exception.
 */
export type StepHalt =
  | { kind: "failed"; error: ErrorInfo; thrownErr: Error }
  | {
      kind: "awaiting-resume";
      error: ErrorInfo;
      thrownErr: Error;
      resumePoint: { step: StepName; reason: string; iterationsExhausted: number };
      /**
       * Interruption record minus the `ts` field (added by the executor at call time).
       * reason must be one of the valid InterruptionRecord.reason values.
       */
      interruption: {
        type: "interruption";
        reason: "timeout" | "signal" | "failure" | "exhaustion";
        errorCode?: string;
      };
      statePatch?: { mainCheckoutDrift?: MainCheckoutDrift };
    };

// ---------------------------------------------------------------------------
// Factory: agent throw guard (:380)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the agent runner throw path.
 * Preserves the original thrown error as thrownErr (re-thrown by attachStateAndRethrow).
 * code defaults to "AGENT_STEP_FAILED" when not set on the error.
 */
export function makeAgentThrowHalt(
  err: Error & { code?: string; hint?: string },
  _stepName: string,
): StepHalt & { kind: "failed" } {
  const error: ErrorInfo = {
    code: err.code ?? "AGENT_STEP_FAILED",
    message: err.message,
    hint: err.hint ?? "",
  };
  return { kind: "failed", error, thrownErr: err };
}

// ---------------------------------------------------------------------------
// Factory: timeout guard (:404)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the poll-timeout path.
 * Produces an awaiting-resume halt so the pipeline can continue after a resume.
 * code defaults to "POLL_TIMEOUT".
 */
export function makeTimeoutHalt(
  runResult: Pick<AgentRunResult, "error">,
  stepName: string,
): StepHalt & { kind: "awaiting-resume" } {
  const err = runResult.error ?? Object.assign(
    new Error(`Agent step '${stepName}' timed out`),
    {} as Record<string, unknown>,
  );
  const error: ErrorInfo = {
    code: (err as Error & { code?: string }).code ?? "POLL_TIMEOUT",
    message: err.message,
    hint: (err as Error & { hint?: string }).hint ?? "",
  };
  return {
    kind: "awaiting-resume",
    error,
    thrownErr: err as Error,
    resumePoint: {
      step: toStepName(stepName),
      reason: "timeout",
      iterationsExhausted: 0,
    },
    interruption: { type: "interruption", reason: "timeout" },
  };
}

// ---------------------------------------------------------------------------
// Factory: non-success guard (:442)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the non-success (error) completionReason path.
 * Terminal failure — executor calls store.fail.
 * code defaults to "AGENT_STEP_FAILED".
 */
export function makeNonSuccessHalt(
  runResult: Pick<AgentRunResult, "error">,
  stepName: string,
): StepHalt & { kind: "failed" } {
  const err = runResult.error ?? Object.assign(
    new Error(`Agent step '${stepName}' failed`),
    {} as Record<string, unknown>,
  );
  const error: ErrorInfo = {
    code: (err as Error & { code?: string }).code ?? "AGENT_STEP_FAILED",
    message: err.message,
    hint: (err as Error & { hint?: string }).hint ?? "",
  };
  return { kind: "failed", error, thrownErr: err as Error };
}

// ---------------------------------------------------------------------------
// Factory: main-checkout drift guard (:472)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the main-checkout write-detected path.
 * Produces an awaiting-resume halt so the operator can inspect and resume.
 * Creates a synthetic Error for attachStateAndRethrow (no original exception).
 *
 * @param drift    Result of diffGuardSnapshots — must have drifted === true.
 * @param stepName Name of the step during which the drift was detected.
 * @param slug     Job slug for the resume command hint message.
 */
export function makeDriftHalt(
  drift: GuardDrift,
  stepName: string,
  slug: string,
): StepHalt & { kind: "awaiting-resume" } {
  const pathSummary = drift.changes.map((c) => `${c.kind}: ${c.path}`).join(", ");
  const detectedAtStep = toStepName(stepName);
  const error: ErrorInfo = {
    code: "MAIN_CHECKOUT_WRITE_DETECTED",
    message: `Main checkout write detected during '${stepName}': ${pathSummary}`,
    hint: `Guarded paths in main checkout were modified while the agent step was running. This may be a legitimate parallel edit by the operator. Verify the changes and run 'specrunner job resume ${slug}' to continue.`,
  };
  const thrownErr = Object.assign(
    new Error(error.message),
    { code: "MAIN_CHECKOUT_WRITE_DETECTED", hint: error.hint },
  );
  return {
    kind: "awaiting-resume",
    error,
    thrownErr,
    resumePoint: {
      step: detectedAtStep,
      reason: "main checkout write detected",
      iterationsExhausted: 0,
    },
    interruption: {
      type: "interruption",
      reason: "failure",
      errorCode: "MAIN_CHECKOUT_WRITE_DETECTED",
    },
    statePatch: {
      mainCheckoutDrift: {
        changes: drift.changes,
        detectedAtStep,
        ts: new Date().toISOString(),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Factory: output-gate guard (:525)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the output-contract gate failure path.
 * Constructs the error message from the violations list.
 * Creates a synthetic Error for attachStateAndRethrow.
 *
 * @param violations Combined halt + followUp violations (allViolations in executor).
 * @param stepName   Name of the step whose outputs failed the gate.
 * @param branch     Current branch (state.branch ?? null) for error message context.
 */
export function makeOutputGateHalt(
  violations: OutputViolation[],
  stepName: string,
  branch: string | null,
): StepHalt & { kind: "failed" } {
  const violationPaths = violations.map((v) =>
    v.kind === "tasks-complete"
      ? `${v.path} (incomplete tasks: ${v.detail.join(", ") || "see file"})`
      : v.path,
  );
  const pathList = violationPaths.map((p) => `  - ${p}`).join("\n");
  const branchNote = branch ? ` on branch '${branch}'` : "";
  const error: ErrorInfo = {
    code: "STEP_OUTPUT_MISSING",
    message: `Step '${stepName}' output contract(s) not satisfied${branchNote}: ${violationPaths.join(", ")}`,
    hint: `Required step output(s) missing or incomplete${branchNote}.\nViolations:\n${pathList}`,
  };
  const thrownErr = Object.assign(
    new Error(error.message),
    { code: "STEP_OUTPUT_MISSING", hint: error.hint },
  );
  return { kind: "failed", error, thrownErr };
}

// ---------------------------------------------------------------------------
// Factory: commit-fail guard (:598)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the finalizeStepArtifacts (commit/push) failure path.
 * Preserves the original error as thrownErr.
 * code defaults to "COMMIT_AND_PUSH_FAILED".
 */
export function makeCommitFailHalt(
  err: Error & { code?: string; hint?: string },
  _stepName: string,
): StepHalt & { kind: "failed" } {
  const error: ErrorInfo = {
    code: err.code ?? "COMMIT_AND_PUSH_FAILED",
    message: err.message,
    hint: err.hint ?? "",
  };
  return { kind: "failed", error, thrownErr: err };
}
