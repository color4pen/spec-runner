import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { PipelineDescriptor } from "./types.js";
import { getMaxRetries } from "../../config/getAgentId.js";
import { Pipeline } from "./pipeline.js";
import { EventBus } from "../event/event-bus.js";
import { StepExecutor } from "../step/executor.js";
import type { AgentRunner } from "../port/agent-runner.js";
import { getPipelineId } from "../../state/pipeline-id.js";
import {
  STANDARD_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
  getPipelineDescriptor,
} from "./registry.js";
import { composeReviewerDescriptor } from "./compose-reviewers.js";

/**
 * Loop step names used by the standard pipeline.
 * Re-exported as a view of STANDARD_DESCRIPTOR.loopNames for backward compatibility.
 * resolve-step.ts and tests import from this module — export name and type are preserved.
 */
export const STANDARD_LOOP_NAMES: readonly string[] = STANDARD_DESCRIPTOR.loopNames;

/**
 * Review → fixer step mapping used by the standard pipeline.
 * Re-exported as a view of STANDARD_DESCRIPTOR.loopFixerPairs for backward compatibility.
 * resolve-step.ts imports STANDARD_LOOP_FIXER_PAIRS from this module — preserved.
 */
export const STANDARD_LOOP_FIXER_PAIRS: Readonly<Record<string, string>> = STANDARD_DESCRIPTOR.loopFixerPairs;

// ---------------------------------------------------------------------------
// buildPipeline — core builder (descriptor → Pipeline)
// ---------------------------------------------------------------------------

/**
 * Construct a Pipeline from a PipelineDescriptor.
 * Resolves executor from deps.runner and maxIterations from descriptor or config.
 *
 * @param descriptor - pipeline configuration descriptor from the registry
 * @param deps - pipeline dependencies (config, runtime, etc.)
 * @param events - optional EventBus (creates a new one if not provided)
 */
export function buildPipeline(
  descriptor: PipelineDescriptor,
  deps: PipelineDeps,
  events?: EventBus,
): Pipeline {
  const bus = events ?? new EventBus();

  // Design D8: runner is injected by RuntimeStrategy.buildDeps() — no runtime branch here.
  const runner: AgentRunner = deps.runner ?? (() => {
    throw new Error("PipelineDeps.runner is required. Use createRuntime().buildDeps() to construct PipelineDeps.");
  })();

  const executor = new StepExecutor(bus, runner, deps.storeFactory, deps.gitTransportSpawn, undefined, descriptor.permissionScope);

  const maxIterations = descriptor.maxIterations ?? getMaxRetries(deps.config);

  return new Pipeline({
    steps: new Map(descriptor.steps),
    transitions: [...descriptor.transitions],
    maxIterations,
    executor,
    events: bus,
    loopName: descriptor.loopName,
    loopNames: [...descriptor.loopNames],
    loopFixerPairs: { ...descriptor.loopFixerPairs },
    summaryStep: descriptor.summaryStep,
    maxIterationsByStep: descriptor.maxIterationsByStep ? { ...descriptor.maxIterationsByStep } : undefined,
    parallelReview: descriptor.parallelReview,
  });
}

// ---------------------------------------------------------------------------
// buildPipelineForJob — convenience wrapper for job-state-driven construction
// ---------------------------------------------------------------------------

/**
 * Resolve the pipeline descriptor from jobState.pipelineId and construct a Pipeline.
 * Applies composeReviewerDescriptor to inject any custom reviewers from job state.
 * Used by CommandRunner to build the pipeline for a specific job.
 *
 * @param jobState - job state carrying the pipelineId (defaults to "standard" if absent)
 * @param deps - pipeline dependencies
 * @param events - optional EventBus
 */
export function buildPipelineForJob(
  jobState: JobState,
  deps: PipelineDeps,
  events?: EventBus,
): Pipeline {
  const base = getPipelineDescriptor(getPipelineId(jobState));
  const descriptor = composeReviewerDescriptor(base, jobState.reviewers);
  return buildPipeline(descriptor, deps, events);
}

// ---------------------------------------------------------------------------
// createStandardPipeline — backward-compat wrapper
// ---------------------------------------------------------------------------

/**
 * Construct the standard Pipeline with all steps and transitions.
 * Delegates to buildPipeline(STANDARD_DESCRIPTOR, ...) for backward compatibility.
 * Existing callers (tests, resume.ts) work unchanged.
 *
 * @param deps - pipeline dependencies (config, runtime, etc.)
 * @param events - optional EventBus (creates a new one if not provided)
 */
export function createStandardPipeline(deps: PipelineDeps, events?: EventBus): Pipeline {
  return buildPipeline(STANDARD_DESCRIPTOR, deps, events);
}

// ---------------------------------------------------------------------------
// runPipeline — thin wrapper for the full pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full pipeline: resolves pipelineId from jobState → descriptor → Pipeline → run.
 *
 * Behavior invariants maintained:
 * - stdout `[iter N/M]` format is bit-for-bit unchanged
 * - Error codes: SESSION_TERMINATED, BRANCH_NOT_REGISTERED,
 *   SPEC_REVIEW_RETRIES_EXHAUSTED, CONFIG_INCOMPLETE
 */
export async function runPipeline(
  jobState: JobState,
  deps: PipelineDeps,
  events?: EventBus,
): Promise<JobState> {
  const bus = events ?? new EventBus();
  const base = getPipelineDescriptor(getPipelineId(jobState));
  const descriptor = composeReviewerDescriptor(base, jobState.reviewers);
  const pipeline = buildPipeline(descriptor, deps, bus);
  return pipeline.run(descriptor.startStep, jobState, deps);
}

// ---------------------------------------------------------------------------
// runDesignPipeline — design-only pipeline
// ---------------------------------------------------------------------------

/**
 * Run only the design step (no spec-review loop).
 *
 * Delegates to buildPipeline(DESIGN_ONLY_DESCRIPTOR, ...). Preserves all error
 * semantics of the original implementation via StepExecutor.
 *
 * Note: Errors from the design step are surfaced via err.state (attached by
 * StepExecutor) rather than re-thrown directly.
 */
export async function runDesignPipeline(
  jobState: JobState,
  deps: PipelineDeps,
  events?: EventBus,
): Promise<JobState> {
  const pipeline = buildPipeline(DESIGN_ONLY_DESCRIPTOR, deps, events);
  return pipeline.run(DESIGN_ONLY_DESCRIPTOR.startStep, jobState, deps);
}
