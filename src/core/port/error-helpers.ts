import type { JobState, ErrorInfo } from "../../state/schema.js";

/**
 * Attach the current JobState to an error object and rethrow.
 * Centralizes the `(err as Record<string, unknown>)["state"] = state; throw err` pattern.
 * Return type is `never` because this function always throws.
 */
export function attachStateAndRethrow(err: unknown, state: JobState): never {
  (err as Record<string, unknown>)["state"] = state;
  throw err;
}

/**
 * Construct a wrapped Error with code, hint, and state attached, then throw it.
 * Centralizes the `wrappedErr` construction pattern that appears 4 times.
 * Return type is `never` because this function always throws.
 */
export function throwWrappedError(errorInfo: ErrorInfo, state: JobState): never {
  const wrappedErr = new Error(errorInfo.message) as Error & {
    code: string;
    hint: string;
    state: JobState;
  };
  wrappedErr.code = errorInfo.code;
  wrappedErr.hint = errorInfo.hint;
  wrappedErr.state = state;
  throw wrappedErr;
}
