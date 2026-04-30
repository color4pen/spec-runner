import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { Step } from "../step/types.js";
import { getMaxRetries } from "../../config/getAgentId.js";
import { Pipeline } from "./pipeline.js";
import { STANDARD_TRANSITIONS } from "./types.js";
import type { Transition } from "./types.js";
import { EventBus } from "../event/event-bus.js";
import { StepExecutor } from "../step/executor.js";
import { ProposeStep } from "../step/propose.js";
import { SpecReviewStep } from "../step/spec-review.js";
import { SpecFixerStep } from "../step/spec-fixer.js";
import { ImplementerStep } from "../step/implementer.js";
import { VerificationStep } from "../step/verification.js";
import { BuildFixerStep } from "../step/build-fixer.js";

/**
 * Run the full pipeline: propose → spec-review loop (with spec-fixer on needs-fix).
 *
 * This is a thin wrapper that constructs the Pipeline class with the standard
 * transition table and calls pipeline.run(). The function signature is preserved
 * bit-for-bit so existing callers (CLI) work unchanged.
 *
 * Behavior invariants maintained:
 * - stdout `[iter N/M]` format is bit-for-bit unchanged
 * - Error codes: SESSION_TIMEOUT, SESSION_TERMINATED, BRANCH_NOT_REGISTERED,
 *   SPEC_REVIEW_RETRIES_EXHAUSTED, CONFIG_INCOMPLETE
 */
export async function runPipeline(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  const maxIterations = getMaxRetries(deps.config);

  const events = new EventBus();
  const executor = new StepExecutor(events);

  const steps = new Map<string, Step>([
    ["propose",      ProposeStep],
    ["spec-review",  SpecReviewStep],
    ["spec-fixer",   SpecFixerStep],
    ["implementer",  ImplementerStep],
    ["verification", VerificationStep],
    ["build-fixer",  BuildFixerStep],
  ]);

  const pipeline = new Pipeline({
    steps,
    transitions: STANDARD_TRANSITIONS,
    maxIterations,
    executor,
    events,
    loopName: "spec-review",
    loopNames: ["spec-review", "verification"],
  });

  return pipeline.run("propose", jobState, deps);
}

/**
 * Run only the propose step (no spec-review loop).
 *
 * Uses the Pipeline class with a propose-only step map and a transition table
 * that terminates after propose completes. Preserves all error semantics of the
 * original implementation via StepExecutor.
 *
 * Note: Unlike the old runProposeStepLegacy, errors from the propose step are
 * surfaced via err.state (attached by StepExecutor) rather than re-thrown directly.
 * Tests that relied on the legacy re-throw behavior should use the err.state path.
 */
export async function runProposePipeline(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  const events = new EventBus();
  const executor = new StepExecutor(events);

  const steps = new Map([
    ["propose", ProposeStep],
  ]);

  // Propose-only transition table: propose always terminates (success or error → end)
  const proposeOnlyTransitions: Transition[] = [
    { step: "propose", on: "success", to: "end" },
    { step: "propose", on: "error",   to: "escalate" },
  ];

  const pipeline = new Pipeline({
    steps,
    transitions: proposeOnlyTransitions,
    maxIterations: 1,
    executor,
    events,
    loopName: "propose",
  });

  return pipeline.run("propose", jobState, deps);
}
