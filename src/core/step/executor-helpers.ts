/**
 * Cohesive session-lifecycle helpers extracted from StepExecutor.
 *
 * All helpers are pure orchestration: they receive store / state / errorInfo
 * as arguments and do not hold I/O or loop state themselves.
 * This separation improves testability and reduces executor.ts LOC.
 *
 * Design D1 (module-analysis): sibling file pattern, no executor instance state.
 */
import type { JobState, ErrorInfo } from "../../state/schema.js";
import { throwWrappedError } from "../port/error-helpers.js";
export { throwWrappedError, attachStateAndRethrow } from "../port/error-helpers.js";
import type { SessionClient } from "../port/session-client.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { pushStepResult } from "../../state/helpers.js";
import type { StepResultInput } from "../../state/helpers.js";

// ---------------------------------------------------------------------------
// Helper 1: createSessionWithHistory
// ---------------------------------------------------------------------------

/**
 * Create an Anthropic session and record history entries for the propose-style flow.
 *
 * On success: appends history "started" → update state with sessionId → "ok".
 * On failure: fails state, appends history "error", attaches state to error, rethrows.
 *
 * Note: This helper is propose-style only (fixed step label "session-create").
 * For polling-style steps, session creation uses a different label pattern.
 */
export async function createSessionWithHistory(
  store: JobStateStore,
  state: JobState,
  client: SessionClient,
  params: {
    agentId: string;
    environmentId: string;
    repoUrl: string;
    githubToken: string;
  },
  opts: {
    stepLabel: string;
    errorCode: string;
    errorMessageFmt: (msg: string) => string;
    errorHint: string;
  },
): Promise<{ state: JobState; sessionId: string }> {
  let currentState = await store.appendHistory(state, {
    ts: new Date().toISOString(),
    step: opts.stepLabel,
    status: "started",
    message: "Creating Anthropic session",
  });

  let sessionId: string;
  try {
    const sessionResult = await client.createSession(params);
    sessionId = sessionResult.sessionId;

    currentState = await store.update(currentState, {
      session: {
        id: sessionId,
        agentId: params.agentId,
        environmentId: params.environmentId,
      },
      step: "events-stream-connected",
    });
    currentState = await store.appendHistory(currentState, {
      ts: new Date().toISOString(),
      step: opts.stepLabel,
      status: "ok",
      message: sessionId,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    currentState = await store.fail(currentState, {
      code: opts.errorCode,
      message: opts.errorMessageFmt(errMsg),
      hint: opts.errorHint,
    }, opts.stepLabel);
    currentState = await store.appendHistory(currentState, {
      ts: new Date().toISOString(),
      step: opts.stepLabel,
      status: "error",
      message: errMsg,
    });
    (err as Record<string, unknown>)["state"] = currentState;
    throw err;
  }

  return { state: currentState, sessionId };
}

// ---------------------------------------------------------------------------
// Helper 2: recordFailedStepResult
// ---------------------------------------------------------------------------

/**
 * Push a failure step result into state. Pure — does not persist to disk.
 *
 * Centralizes the null-findings template that appears 7+ times in executor.ts.
 */
export function recordFailedStepResult(
  state: JobState,
  stepName: string,
  errorInfo: ErrorInfo,
  partial: Omit<StepResultInput, "verdict" | "findingsPath" | "error"> = {},
): JobState {
  return pushStepResult(state, stepName, {
    ...partial,
    verdict: null,
    findingsPath: null,
    error: errorInfo,
  });
}

// ---------------------------------------------------------------------------
// Helper 3: failStepWithError (formerly Helper 5)
// ---------------------------------------------------------------------------

/**
 * Execute the full "fail-and-record" sequence for a polling-style step failure:
 * 1. pushStepResult (failure record) into state
 * 2. store.fail (marks state as failed with errorInfo)
 * 3. store.persist (writes to disk)
 * 4. throwWrappedError (constructs and throws wrapped error)
 *
 * This 4-step sequence appears 3+ times in runPollingStyleStep.
 * Return type is `Promise<never>` because throwWrappedError always throws.
 */
export async function failStepWithError(
  store: JobStateStore,
  state: JobState,
  stepName: string,
  errorInfo: ErrorInfo,
  opts: {
    session?: { id: string; agentId: string; environmentId: string } | null;
    completedAt: string;
  },
): Promise<never> {
  let currentState = recordFailedStepResult(state, stepName, errorInfo, {
    session: opts.session ?? null,
    completedAt: opts.completedAt,
  });
  currentState = await store.fail(currentState, errorInfo, stepName);
  await store.persist(currentState);
  throwWrappedError(errorInfo, currentState);
}
