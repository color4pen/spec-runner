/**
 * Reviewer-stage capability predicate for pipeline descriptors.
 *
 * Pure module: no fs / child_process / env / SDK imports.
 * Dependency edges: core/pipeline → step (STEP_NAMES), core/pipeline → types (PipelineDescriptor).
 * Both edges are existing permitted edges in the DSM (same as compose-reviewers.ts).
 */
import type { PipelineDescriptor } from "./types.js";
import { STEP_NAMES } from "../step/step-names.js";

/**
 * Return true when the resolved descriptor has a reviewer stage — i.e. when
 * composeReviewerDescriptor would insert custom reviewers at a reachable position.
 *
 * composeReviewerDescriptor inserts the custom reviewer chain before the CONFORMANCE
 * step (conformanceIdx = findIndex(name === CONFORMANCE)).  When CONFORMANCE is absent,
 * it appends to the end — making the reviewers unreachable (zombie steps with no
 * transitions leading to them).  Therefore:
 *
 *   "custom reviewer actually runs"  ⟺  "descriptor.steps contains CONFORMANCE"
 *
 * The predicate uses the same anchor (CONFORMANCE) as the composer, so the two
 * concepts stay aligned.  Drift is detected by the alignment test (T-04), which
 * calls composeReviewerDescriptor with a fake reviewer and observes whether the
 * fake ends up reachable in the composed output.
 *
 * Profile-name hardcoding (e.g. `descriptor.id === "design-only"`) is intentionally
 * absent: the predicate derives from descriptor capability, not from identity.
 */
export function descriptorHasReviewerInsertionPoint(descriptor: PipelineDescriptor): boolean {
  return descriptor.steps.some(([name]) => name === STEP_NAMES.CONFORMANCE);
}
