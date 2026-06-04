/**
 * Pure helper for resolving the pipeline identifier from a JobState.
 *
 * Modelled after getJobSlug (src/state/job-slug.ts).
 * No I/O or filesystem dependency — testable in isolation.
 *
 * TC-PIPID-001: pipelineId absent → "standard"
 * TC-PIPID-002: pipelineId present → its value
 */
import type { JobState } from "./schema.js";
import { STANDARD_PIPELINE_ID } from "../kernel/pipeline-ids.js";

/**
 * Resolve the pipeline identifier for a job state.
 *
 * Fallback: if pipelineId is absent (legacy state), returns STANDARD_PIPELINE_ID ("standard").
 * This is the single resolution entry-point — consumers must not define their own default.
 */
export function getPipelineId(state: Pick<JobState, "pipelineId">): string {
  return state.pipelineId ?? STANDARD_PIPELINE_ID;
}
