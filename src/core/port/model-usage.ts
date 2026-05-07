/**
 * Canonical definition of ModelUsage — shared between the port layer and state layer.
 *
 * Extracted into its own module to prevent a circular import:
 *   state/schema.ts → core/port/agent-runner.ts → state/schema.ts (JobState)
 *
 * Both agent-runner.ts and state/schema.ts import from here.
 */

/**
 * Token usage breakdown for a single model invocation.
 * Mirrors the SDK's ModelUsage type (subset of fields used for verification).
 */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}
