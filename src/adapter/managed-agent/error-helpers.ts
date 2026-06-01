/**
 * Centralized ErrorInfo construction + throw helpers for ManagedAgentRunner.
 *
 * All throw logic delegates to executor-helpers.throwWrappedError / attachStateAndRethrow —
 * no reimplementation of the wrapped-error construction pattern.
 *
 * TC-008: No JobStateStore dependency (state is passed as argument, not read from store).
 */
import type { JobState, ErrorInfo } from "../../state/schema.js";
import type { AgentRunResult } from "../../core/port/agent-runner.js";
import { throwWrappedError } from "../../core/port/error-helpers.js";
import { sessionTerminatedError } from "../../errors.js";

/**
 * SESSION_CREATE_FAILED pattern for session creation failures (5 places).
 * When context is provided, appends "(context)" to the message.
 */
export function throwSessionCreateError(
  errMsg: string,
  stepName: string,
  state: JobState,
  context?: string,
): never {
  const contextSuffix = context ? ` (${context})` : "";
  const errorInfo: ErrorInfo = {
    code: "SESSION_CREATE_FAILED",
    message: `Failed to create ${stepName} session${contextSuffix}: ${errMsg}`,
    hint: "Check your API key and try again.",
  };
  throwWrappedError(errorInfo, state);
}

/**
 * SESSION_CREATE_FAILED pattern for send-message failures.
 * Same code as throwSessionCreateError but different message/hint.
 */
export function throwSendMessageError(
  errMsg: string,
  stepName: string,
  state: JobState,
  context?: string,
): never {
  const contextSuffix = context ? ` (${context})` : "";
  const errorInfo: ErrorInfo = {
    code: "SESSION_CREATE_FAILED",
    message: `Failed to send ${context ? "message to" : "initial message to"} ${stepName} session${contextSuffix}: ${errMsg}`,
    hint: "Check your network connection.",
  };
  throwWrappedError(errorInfo, state);
}

/**
 * Extract code/message/hint from a caught error with defaults, then throw (2 places).
 */
export function throwCaughtAsWrapped(
  err: unknown,
  defaults: { code: string; hint: string },
  state: JobState,
): never {
  const errCode = (err as { code?: string }).code ?? defaults.code;
  const errMsg = (err as Error).message;
  const errHint = (err as { hint?: string }).hint ?? defaults.hint;
  throwWrappedError({ code: errCode, message: errMsg, hint: errHint }, state);
}

/**
 * Build a POLL_TIMEOUT AgentRunResult (return, not throw; 2 places).
 */
export function buildTimeoutResult(
  pollError: { code: string; message: string; hint: string },
  sessionId: string,
): AgentRunResult {
  const timeoutErr = new Error(pollError.message) as Error & { code: string; hint: string };
  timeoutErr.code = pollError.code;
  timeoutErr.hint = pollError.hint;
  return { completionReason: "timeout", resultContent: null, sessionId, error: timeoutErr, toolResult: null, followUpAttempts: 0 };
}

/**
 * Poll failure ErrorInfo construction + throw (2 places).
 * Falls back to sessionTerminatedError() when pollError is undefined.
 */
export function throwPollError(
  pollError: ErrorInfo | undefined,
  state: JobState,
): never {
  const errorInfo = pollError ?? sessionTerminatedError();
  throwWrappedError(errorInfo, state);
}
