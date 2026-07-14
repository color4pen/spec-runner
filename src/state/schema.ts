/**
 * Job state schema and types for specrunner state files.
 *
 * Split across:
 *   - schema/types.ts      — status, step-name, and JobState type declarations
 *   - schema/operations.ts — appendHistoryEntry + validateJobState (on-read normalization)
 */
export * from "./schema/types.js";
export * from "./schema/operations.js";
