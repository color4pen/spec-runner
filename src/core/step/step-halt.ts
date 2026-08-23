/**
 * StepHalt discriminated union and factory functions.
 *
 * Represents a named failure or awaiting-resume value produced by each of the
 * guard conditions in StepExecutor.runAgentStep and runCliStep. Each factory
 * constructs a StepHalt value; the CommitOrchestrator applies persist / transition /
 * rethrow (single-writer ownership — B-13 / B-14).
 *
 * Design:
 *   - Values only: no side effects, no I/O.
 *   - Factory functions are 1:1 with executor guard sites.
 *   - Behavioral equivalence: each factory reproduces the same ErrorInfo and thrownErr
 *     as the guard it replaces.
 *   - recordOpts: forwarded to recordFailedStepResult (absorbs startedAt / completedAt /
 *     transientRetryAttempts differences per guard site).
 *   - history: forwarded to store.appendHistory (absent = no history append for this halt).
 */
import type { ErrorInfo, JobState, StepName, HistoryEntry } from "../../state/schema.js";
import type { AgentRunResult, AgentSessionRollover } from "../port/agent-runner.js";
import type { AgentContextMetrics } from "../../kernel/context-metrics.js";
import type { OutputViolation } from "../port/output-contract.js";
import type { GuardDrift } from "./main-checkout-guard.js";
import type { StepResultInput } from "../../state/helpers.js";
import { toStepName } from "./step-names.js";

/**
 * Type alias for the inline mainCheckoutDrift shape in JobState.
 * Avoids duplicating the inline literal type.
 */
type MainCheckoutDrift = NonNullable<JobState["mainCheckoutDrift"]>;

/**
 * StepHalt: the two possible non-success outcomes from a guard condition.
 *
 * - "failed": terminal failure → CommitOrchestrator calls store.fail + attachStateAndRethrow.
 * - "awaiting-resume": interruptible pause → CommitOrchestrator calls
 *   transitionJob("awaiting-resume") + attachStateAndRethrow.
 *
 * thrownErr is the Error to pass to attachStateAndRethrow. For guards that produce
 * a new error (output-gate, drift) it is constructed here. For guards that re-throw
 * the caught exception (agent-throw, timeout, non-success, commit-fail) it IS the
 * original exception.
 *
 * recordOpts is forwarded as the 4th argument of recordFailedStepResult in CommitOrchestrator.
 * history, when set, is appended to the job history by CommitOrchestrator after
 * applying the halt (ts is added at apply time).
 */
export type StepHalt =
  | {
      kind: "failed";
      error: ErrorInfo;
      thrownErr: Error;
      recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">;
      history?: Omit<HistoryEntry, "ts">;
      /**
       * Active context and compaction metrics observed during this invocation.
       * Forwarded from AgentRunResult.contextMetrics (agent-context-observability).
       * absent = runner did not observe context metrics (Codex / managed / pre-feature runs).
       */
      contextMetrics?: AgentContextMetrics;
      /**
       * Per-rollover observation records forwarded from AgentRunResult.sessionRollovers.
       * Absent when no context-exhaustion rollovers occurred (most steps).
       * Added in fresh-session-rollover.
       */
      sessionRollovers?: AgentSessionRollover[];
    }
  | {
      kind: "awaiting-resume";
      error: ErrorInfo;
      thrownErr: Error;
      resumePoint: { step: StepName; reason: string; iterationsExhausted: number };
      /**
       * Interruption record minus the `ts` field (added by CommitOrchestrator at call time).
       * reason must be one of the valid InterruptionRecord.reason values.
       */
      interruption: {
        type: "interruption";
        reason: "timeout" | "signal" | "failure" | "exhaustion";
        errorCode?: string;
      };
      statePatch?: { mainCheckoutDrift?: MainCheckoutDrift };
      recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">;
      history?: Omit<HistoryEntry, "ts">;
      /**
       * Active context and compaction metrics observed during this invocation.
       * Forwarded from AgentRunResult.contextMetrics (agent-context-observability).
       * absent = runner did not observe context metrics (Codex / managed / pre-feature runs).
       */
      contextMetrics?: AgentContextMetrics;
      /**
       * Per-rollover observation records forwarded from AgentRunResult.sessionRollovers.
       * Absent when no context-exhaustion rollovers occurred (most steps).
       * Added in fresh-session-rollover.
       */
      sessionRollovers?: AgentSessionRollover[];
    };

// ---------------------------------------------------------------------------
// Factory: agent throw guard
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the agent runner throw path.
 * Preserves the original thrown error as thrownErr (re-thrown by attachStateAndRethrow).
 * code defaults to "AGENT_STEP_FAILED" when not set on the error.
 *
 * history: `{step}-failed` / error / `${step} failed: ${code} — ${message}`
 */
export function makeAgentThrowHalt(
  err: Error & { code?: string; hint?: string },
  stepName: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
): StepHalt & { kind: "failed" } {
  const error: ErrorInfo = {
    code: err.code ?? "AGENT_STEP_FAILED",
    message: err.message,
    hint: err.hint ?? "",
  };
  return {
    kind: "failed",
    error,
    thrownErr: err,
    recordOpts,
    history: {
      step: `${stepName}-failed`,
      status: "error",
      message: `${stepName} failed: ${error.code} — ${error.message}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Factory: timeout guard
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the poll-timeout path.
 * Produces an awaiting-resume halt so the pipeline can continue after a resume.
 * code defaults to "POLL_TIMEOUT".
 *
 * history: `{step}-timeout` / error / `${step} timed out: ${message}`
 */
export function makeTimeoutHalt(
  runResult: Pick<AgentRunResult, "error" | "contextMetrics" | "sessionRollovers">,
  stepName: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
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
    recordOpts,
    history: {
      step: `${stepName}-timeout`,
      status: "error",
      message: `${stepName} timed out: ${error.message}`,
    },
    ...(runResult.contextMetrics !== undefined ? { contextMetrics: runResult.contextMetrics } : {}),
    ...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0 ? { sessionRollovers: runResult.sessionRollovers } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: non-success guard
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the non-success (error) completionReason path.
 * Terminal failure — CommitOrchestrator calls store.fail.
 * code defaults to "AGENT_STEP_FAILED".
 *
 * history: none (no history append for non-success)
 */
export function makeNonSuccessHalt(
  runResult: Pick<AgentRunResult, "error" | "contextMetrics" | "sessionRollovers">,
  stepName: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
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
  return {
    kind: "failed",
    error,
    thrownErr: err as Error,
    recordOpts,
    ...(runResult.contextMetrics !== undefined ? { contextMetrics: runResult.contextMetrics } : {}),
    ...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0 ? { sessionRollovers: runResult.sessionRollovers } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: main-checkout drift guard
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the main-checkout write-detected path.
 * Produces an awaiting-resume halt so the operator can inspect and resume.
 * Creates a synthetic Error for attachStateAndRethrow (no original exception).
 *
 * history: `{step}-main-checkout-write-detected` / error / `${step}: main checkout write detected — ${pathSummary}`
 *
 * @param drift            Result of diffGuardSnapshots — must have drifted === true.
 * @param stepName         Name of the step during which the drift was detected.
 * @param slug             Job slug for the resume command hint message.
 * @param recordOpts       Forwarded to recordFailedStepResult (startedAt / completedAt / transientRetryAttempts).
 * @param contextMetrics   Active context metrics observed during the agent invocation (agent-context-observability).
 *                         Forwarded from AgentRunResult.contextMetrics so that drift halt entries are also recorded
 *                         in usage.json per spec "halted step SHALL also append one usage entry when — and only when —
 *                         context metrics were observed" (D7).
 * @param sessionRollovers Per-rollover observation records forwarded from AgentRunResult.sessionRollovers.
 *                         Ensures rollover contextOnly entries are persisted to usage.json even when
 *                         the halt is due to a post-success drift guard (design D7 invariant).
 */
export function makeDriftHalt(
  drift: GuardDrift,
  stepName: string,
  slug: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
  contextMetrics?: AgentContextMetrics,
  sessionRollovers?: AgentSessionRollover[],
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
    recordOpts,
    history: {
      step: `${stepName}-main-checkout-write-detected`,
      status: "error",
      message: `${stepName}: main checkout write detected — ${pathSummary}`,
    },
    // agent-context-observability: carry context metrics from the successful runner invocation
    // so that commitHalt can persist them even when the halt is due to a post-success drift guard.
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),
    // fresh-session-rollover: carry rollover records so usage.json contextOnly entries are
    // written even when the halt is due to a post-success drift guard (design D7 invariant).
    ...(sessionRollovers && sessionRollovers.length > 0 ? { sessionRollovers } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: output-gate guard
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the output-contract gate failure path.
 * Constructs the error message from the violations list.
 * Creates a synthetic Error for attachStateAndRethrow.
 *
 * history: `{step}-failed` / error / `${step} failed: ${code} — ${message}`
 *
 * @param violations Combined halt + followUp violations (allViolations in executor).
 * @param stepName   Name of the step whose outputs failed the gate.
 * @param branch     Current branch (state.branch ?? null) for error message context.
 */
/**
 * Format a test-coverage violation path entry with categorized TC-IDs.
 *
 * When `coverage` is defined and has non-empty categories, renders:
 *   `<path> (missing TCs: TC-001, TC-002; assertionless TCs: TC-003)`
 * with only the non-empty parts included (joined by "; ").
 *
 * Falls back to `<path> (see file)` when coverage is undefined or both
 * categories are empty.
 */
function formatTestCoverageViolationPath(v: OutputViolation): string {
  const cov = v.coverage;
  const parts: string[] = [];
  if (cov && cov.missingTcIds.length > 0) {
    parts.push(`missing TCs: ${cov.missingTcIds.join(", ")}`);
  }
  if (cov && cov.assertionlessTcIds.length > 0) {
    parts.push(`assertionless TCs: ${cov.assertionlessTcIds.join(", ")}`);
  }
  const detail = parts.length > 0 ? parts.join("; ") : "see file";
  return `${v.path} (${detail})`;
}

export function makeOutputGateHalt(
  violations: OutputViolation[],
  stepName: string,
  branch: string | null,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
  contextMetrics?: AgentContextMetrics,
  sessionRollovers?: AgentSessionRollover[],
): StepHalt & { kind: "failed" } {
  const violationPaths = violations.map((v) =>
    v.kind === "tasks-complete"
      ? `${v.path} (incomplete tasks: ${v.detail.join(", ") || "see file"})`
      : v.kind === "content-format"
        ? `${v.path} (format violations: ${v.detail.join(", ") || "see file"})`
        : v.kind === "test-coverage"
          ? formatTestCoverageViolationPath(v)
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
  return {
    kind: "failed",
    error,
    thrownErr,
    recordOpts,
    history: {
      step: `${stepName}-failed`,
      status: "error",
      message: `${stepName} failed: ${error.code} — ${error.message}`,
    },
    // agent-context-observability: carry context metrics from the successful runner invocation
    // so that commitHalt can persist them even when the halt is due to a post-success guard.
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),
    // fresh-session-rollover: carry rollover records so usage.json contextOnly entries are
    // written even when the halt is due to a post-success output-gate (design D7 invariant).
    ...(sessionRollovers && sessionRollovers.length > 0 ? { sessionRollovers } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: commit-fail guard
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the finalizeStepArtifacts (commit/push) failure path.
 * Preserves the original error as thrownErr.
 * code defaults to "COMMIT_AND_PUSH_FAILED".
 *
 * history: none (no history append for commit-fail)
 */
export function makeCommitFailHalt(
  err: Error & { code?: string; hint?: string },
  _stepName: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
  contextMetrics?: AgentContextMetrics,
  sessionRollovers?: AgentSessionRollover[],
): StepHalt & { kind: "failed" } {
  const error: ErrorInfo = {
    code: err.code ?? "COMMIT_AND_PUSH_FAILED",
    message: err.message,
    hint: err.hint ?? "",
  };
  return {
    kind: "failed",
    error,
    thrownErr: err,
    recordOpts,
    // agent-context-observability: carry context metrics from the successful runner invocation
    // so that commitHalt can persist them even when the halt is due to a post-success commit failure.
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),
    // fresh-session-rollover: carry rollover records so usage.json contextOnly entries are
    // written even when the halt is due to a post-success commit failure (design D7 invariant).
    ...(sessionRollovers && sessionRollovers.length > 0 ? { sessionRollovers } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: unpushable-path halt (awaiting-resume — post-follow-up violation persists)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the unpushable-path output contract violation path.
 * Produces an awaiting-resume halt so the job is escalated to the linked issue and remains resumable.
 * Creates a synthetic Error for attachStateAndRethrow.
 *
 * The halt reason names the matching paths and states the environment constraint.
 *
 * history: `{step}-unpushable-path-blocked` / error / message
 *
 * @param matchedPaths       Paths that matched the unpushable pattern.
 * @param capabilitySource   Human-readable environment constraint description.
 * @param stepName           Name of the step during which the violation was detected.
 * @param slug               Job slug for the resume command hint message.
 * @param recordOpts         Forwarded to recordFailedStepResult.
 * @param contextMetrics     Active context metrics observed during the agent invocation.
 * @param sessionRollovers   Per-rollover observation records.
 */
export function makeUnpushablePathHalt(
  matchedPaths: string[],
  capabilitySource: string,
  stepName: string,
  slug: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
  contextMetrics?: AgentContextMetrics,
  sessionRollovers?: AgentSessionRollover[],
): StepHalt & { kind: "awaiting-resume" } {
  const pathList = matchedPaths.map((p) => `  - ${p}`).join("\n");
  const error: ErrorInfo = {
    code: "UNPUSHABLE_PATH_BLOCKED",
    message:
      `Step '${stepName}' cannot push changes to protected path(s): ${matchedPaths.join(", ")}. ` +
      `Environment constraint: ${capabilitySource}`,
    hint:
      `The current environment's token cannot push to the following paths:\n${pathList}\n` +
      `Constraint: ${capabilitySource}\n` +
      `Remove the changes to these paths or resolve the requirement without modifying them, ` +
      `then run 'specrunner job resume ${slug}' to continue.`,
  };
  const thrownErr = Object.assign(
    new Error(error.message),
    { code: "UNPUSHABLE_PATH_BLOCKED", hint: error.hint },
  );
  return {
    kind: "awaiting-resume",
    error,
    thrownErr,
    resumePoint: {
      step: toStepName(stepName),
      reason: `unpushable path constraint: ${matchedPaths.join(", ")}`,
      iterationsExhausted: 0,
    },
    interruption: {
      type: "interruption",
      reason: "failure",
      errorCode: "UNPUSHABLE_PATH_BLOCKED",
    },
    recordOpts,
    history: {
      step: `${stepName}-unpushable-path-blocked`,
      status: "error",
      message: `${stepName}: unpushable path blocked — ${matchedPaths.join(", ")}`,
    },
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),
    ...(sessionRollovers && sessionRollovers.length > 0 ? { sessionRollovers } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: input-missing halt (new — validateRequiredInputs failure)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the validateRequiredInputs failure path.
 * Terminal failure — CommitOrchestrator calls store.fail.
 * code defaults to "STEP_INPUT_MISSING".
 *
 * history: `{step}-failed` / error / `${step} failed: ${code} — ${message}`
 */
export function makeInputMissingHalt(
  err: Error & { code?: string; hint?: string },
  stepName: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
): StepHalt & { kind: "failed" } {
  const error: ErrorInfo = {
    code: err.code ?? "STEP_INPUT_MISSING",
    message: err.message,
    hint: (err as { hint?: string }).hint ?? "",
  };
  return {
    kind: "failed",
    error,
    thrownErr: err,
    recordOpts,
    history: {
      step: `${stepName}-failed`,
      status: "error",
      message: `${stepName} failed: ${error.code} — ${error.message}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Factory: CLI step fail halt (new — runCliStep step.run() failure)
// ---------------------------------------------------------------------------

/**
 * Build a StepHalt for the runCliStep step.run() throw path.
 * Terminal failure — CommitOrchestrator calls store.fail.
 * code: "CLI_STEP_FAILED".
 *
 * history: none (no history append for CLI step fail)
 */
export function makeCliStepFailHalt(
  err: Error & { code?: string; hint?: string },
  stepName: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
): StepHalt & { kind: "failed" } {
  const errMsg = err.message;
  const error: ErrorInfo = {
    code: "CLI_STEP_FAILED",
    message: `${stepName} failed: ${errMsg}`,
    hint: `Check the ${stepName} output for details.`,
  };
  return { kind: "failed", error, thrownErr: err, recordOpts };
}
