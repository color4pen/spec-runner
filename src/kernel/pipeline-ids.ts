/**
 * Canonical pipeline identifier constants.
 * Single source of truth — all files that reference pipeline identifiers must import from here.
 *
 * Modelled after step-names.ts in this same layer.
 */

export const PIPELINE_IDS = {
  STANDARD: "standard",
} as const;

/** Convenience re-export for the common case. */
export const STANDARD_PIPELINE_ID = PIPELINE_IDS.STANDARD;

/** Union type of all known pipeline identifiers. */
export type PipelineId = typeof PIPELINE_IDS[keyof typeof PIPELINE_IDS];
