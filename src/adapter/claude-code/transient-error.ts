/**
 * Re-export shim — implementation lives in src/adapter/shared/transient-error.ts.
 * Existing claude-code imports and tests continue to work unchanged.
 */
export { isTransientAgentError, TRANSIENT_TOKENS } from "../shared/transient-error.js";
