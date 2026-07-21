import type { JobState, StepResult, StepRun, ModelUsage } from "./schema.js";
import type { BaseReportResult, Finding, Observation, Evidence } from "../kernel/report-result.js";
import type { CompletionReportDiagnostic } from "../kernel/completion-report-diagnostic.js";

/**
 * Convert a StepRun to StepResult shape (legacy view).
 * Used for backward compatibility when consuming step records.
 */
export function toLegacyStepResult(step: StepRun | StepResult): StepResult {
  // Check if it's already a StepResult (has iteration field)
  if ("iteration" in step) {
    return step as StepResult;
  }

  // Otherwise it's a StepRun, project to StepResult
  const run = step as StepRun;
  return {
    iteration: run.attempt,
    session: run.sessionId
      ? {
          id: run.sessionId,
          agentId: "",
          environmentId: "",
        }
      : null,
    verdict: run.outcome.verdict,
    findingsPath: run.outcome.findingsPath ?? null,
    completedAt: run.endedAt,
    error: run.outcome.error,
  };
}

/**
 * Get the most recent step result for a given step name.
 * Returns undefined if the step has no results.
 */
export function getLatestStepResult(
  state: JobState,
  stepName: string,
): StepResult | undefined {
  const results = state.steps?.[stepName];
  if (!results || results.length === 0) {
    return undefined;
  }
  const lastResult = results[results.length - 1];
  return lastResult ? toLegacyStepResult(lastResult) : undefined;
}

/**
 * Input shape accepted by pushStepResult.
 * Accepts the legacy StepResult shape (without iteration) for backward compat.
 * Internally writes StepRun objects to state.
 */
export interface StepResultInput {
  session?: { id: string; agentId: string; environmentId: string } | null;
  verdict: import("./schema.js").Verdict | null;
  findingsPath: string | null;
  completedAt?: string | null;
  startedAt?: string | null;
  error: import("./schema.js").ErrorInfo | null;
  /**
   * Per-model token usage from the agent run.
   * Only present for ClaudeCodeRunner steps; absent for ManagedAgentRunner and CLI steps.
   */
  modelUsage?: Record<string, ModelUsage>;
  /**
   * Result from report_result tool call.
   * null = tool was not called. Added in tool-driven-step-completion.
   * Widened to include findings and observations arrays for judge steps.
   */
  toolResult?: (BaseReportResult & { findings?: Finding[]; observations?: Observation[]; evidence?: Evidence }) | null;
  /**
   * Number of follow-up retry attempts. 0 = first turn success.
   * Added in tool-driven-step-completion.
   */
  followUpAttempts?: number;
  /**
   * Number of transient-error auto-retry attempts.
   * 0 = no retries needed. Absent = feature disabled (maxRetries: 0).
   * Added in transient-error-auto-retry.
   */
  transientRetryAttempts?: number;
  /**
   * Human-readable reason when verdict === "skipped".
   * Documents which activation condition was not satisfied.
   */
  skipReason?: string;
  /**
   * Diagnostics from failed completion-report extraction attempts (Codex adapter only).
   * Adapter-populated; absent on success.
   * Added in codex-completion-contract-injection.
   */
  completionReportDiagnostics?: CompletionReportDiagnostic[];
  /**
   * Added-turn metrics broken down by type (local runtime only).
   * reportRetry + outputRepair === followUpAttempts (invariant).
   * postWork is NOT counted in followUpAttempts.
   * Added in reduce-added-agent-turns.
   */
  addedTurns?: { reportRetry: number; postWork: number; outputRepair: number };
  /**
   * Commit OID captured after this step's per-node commit.
   * Set only for sequential steps that own their own git commit (not round members).
   * Added in bite-evidence-forward (R4).
   */
  commitOid?: string;
}

/**
 * Push a new step result into state.steps for the given step name.
 * Auto-assigns attempt number based on existing array length.
 * Returns a new state object (does not mutate the original).
 *
 * Writes StepRun objects (new schema D8b). Legacy StepResult-shaped input is
 * mapped to StepRun internally so all new state files use the canonical schema.
 */
export function pushStepResult(
  state: JobState,
  stepName: string,
  partial: StepResultInput,
): JobState {
  const existing = state.steps?.[stepName] ?? [];
  const attempt = existing.length + 1;
  const now = new Date().toISOString();
  const run: StepRun = {
    attempt,
    sessionId: partial.session?.id ?? null,
    outcome: {
      verdict: partial.verdict,
      findingsPath: partial.findingsPath,
      error: partial.error,
      ...(partial.toolResult !== undefined ? { toolResult: partial.toolResult } : {}),
      ...(partial.followUpAttempts !== undefined ? { followUpAttempts: partial.followUpAttempts } : {}),
      ...(partial.transientRetryAttempts !== undefined ? { transientRetryAttempts: partial.transientRetryAttempts } : {}),
      ...(partial.skipReason !== undefined ? { skipReason: partial.skipReason } : {}),
      ...(partial.completionReportDiagnostics !== undefined ? { completionReportDiagnostics: partial.completionReportDiagnostics } : {}),
      ...(partial.addedTurns !== undefined ? { addedTurns: partial.addedTurns } : {}),
    },
    startedAt: partial.startedAt ?? now,
    endedAt: partial.completedAt ?? now,
    ...(partial.modelUsage !== undefined ? { modelUsage: partial.modelUsage } : {}),
    ...(partial.commitOid !== undefined ? { commitOid: partial.commitOid } : {}),
  };
  return {
    ...state,
    steps: {
      ...state.steps,
      [stepName]: [...existing, run],
    },
    updatedAt: new Date().toISOString(),
  };
}
