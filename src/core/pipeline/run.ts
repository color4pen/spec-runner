import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { Step } from "../step/types.js";
import { getMaxRetries } from "../../config/getAgentId.js";
import { Pipeline } from "./pipeline.js";
import { STANDARD_TRANSITIONS } from "./types.js";
import type { Transition } from "./types.js";
import { EventBus } from "../event/event-bus.js";
import { StepExecutor } from "../step/executor.js";
import type { AgentRunner } from "../port/agent-runner.js";
import { DesignStep } from "../step/design.js";
import { SpecReviewStep } from "../step/spec-review.js";
import { SpecFixerStep } from "../step/spec-fixer.js";
import { DeltaSpecValidationStep } from "../step/delta-spec-validation.js";
import { DeltaSpecFixerStep } from "../step/delta-spec-fixer.js";
import { ImplementerStep } from "../step/implementer.js";
import { VerificationStep } from "../step/verification.js";
import { BuildFixerStep } from "../step/build-fixer.js";
import { CodeReviewStep } from "../step/code-review.js";
import { CodeFixerStep } from "../step/code-fixer.js";
import { PrCreateStep } from "../step/pr-create.js";
import { TestCaseGenStep } from "../step/test-case-gen.js";
import { STEP_NAMES } from "../step/step-names.js";

/** Loop step names used by the standard pipeline. */
export const STANDARD_LOOP_NAMES: readonly string[] = [
  STEP_NAMES.SPEC_REVIEW,
  STEP_NAMES.VERIFICATION,
  STEP_NAMES.CODE_REVIEW,
];

/** Review → fixer step mapping used by the standard pipeline. */
export const STANDARD_LOOP_FIXER_PAIRS: Readonly<Record<string, string>> = {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  [STEP_NAMES.DELTA_SPEC_VALIDATION]: STEP_NAMES.DELTA_SPEC_FIXER,
};

/**
 * Construct the standard Pipeline with all steps and transitions.
 * Extracted so that resume.ts can call pipeline.run(startStep, ...) directly.
 *
 * @param deps - pipeline dependencies (config, runtime, etc.)
 * @param events - optional EventBus (creates a new one if not provided)
 */
export function createStandardPipeline(deps: PipelineDeps, events?: EventBus): Pipeline {
  const maxIterations = getMaxRetries(deps.config);
  const bus = events ?? new EventBus();

  // Design D8: runner is injected by RuntimeStrategy.buildDeps() — no runtime branch here.
  const runner: AgentRunner = deps.runner ?? (() => {
    throw new Error("PipelineDeps.runner is required. Use createRuntime().buildDeps() to construct PipelineDeps.");
  })();

  const executor = new StepExecutor(bus, runner);

  const steps = new Map<string, Step>([
    [STEP_NAMES.DESIGN,                DesignStep],
    [STEP_NAMES.SPEC_REVIEW,           SpecReviewStep],
    [STEP_NAMES.SPEC_FIXER,            SpecFixerStep],
    [STEP_NAMES.DELTA_SPEC_VALIDATION, DeltaSpecValidationStep],
    [STEP_NAMES.DELTA_SPEC_FIXER,      DeltaSpecFixerStep],
    [STEP_NAMES.TEST_CASE_GEN,         TestCaseGenStep],
    [STEP_NAMES.IMPLEMENTER,           ImplementerStep],
    [STEP_NAMES.VERIFICATION,          VerificationStep],
    [STEP_NAMES.BUILD_FIXER,           BuildFixerStep],
    [STEP_NAMES.CODE_REVIEW,           CodeReviewStep],
    [STEP_NAMES.CODE_FIXER,            CodeFixerStep],
    [STEP_NAMES.PR_CREATE,             PrCreateStep],
  ]);

  return new Pipeline({
    steps,
    transitions: STANDARD_TRANSITIONS,
    maxIterations,
    executor,
    events: bus,
    loopName: STEP_NAMES.SPEC_REVIEW,
    loopNames: [...STANDARD_LOOP_NAMES],
    loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS },
  });
}

/**
 * Run the full pipeline: design → spec-review loop (with spec-fixer on needs-fix).
 *
 * This is a thin wrapper that constructs the Pipeline class with the standard
 * transition table and calls pipeline.run(). The function signature is preserved
 * bit-for-bit so existing callers (CLI) work unchanged.
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
  const pipeline = createStandardPipeline(deps, bus);
  return pipeline.run(STEP_NAMES.DESIGN, jobState, deps);
}

/**
 * Run only the design step (no spec-review loop).
 *
 * Uses the Pipeline class with a design-only step map and a transition table
 * that terminates after design completes. Preserves all error semantics of the
 * original implementation via StepExecutor.
 *
 * Note: Unlike the old runDesignStepLegacy, errors from the design step are
 * surfaced via err.state (attached by StepExecutor) rather than re-thrown directly.
 * Tests that relied on the legacy re-throw behavior should use the err.state path.
 */
export async function runDesignPipeline(
  jobState: JobState,
  deps: PipelineDeps,
  events?: EventBus,
): Promise<JobState> {
  const bus = events ?? new EventBus();

  // Design D8: runner is injected by RuntimeStrategy.buildDeps() — no runtime branch here.
  const designRunner: AgentRunner = deps.runner ?? (() => {
    throw new Error("PipelineDeps.runner is required. Use createRuntime().buildDeps() to construct PipelineDeps.");
  })();

  const executor = new StepExecutor(bus, designRunner);

  const steps = new Map([
    [STEP_NAMES.DESIGN, DesignStep],
  ]);

  // Design-only transition table: design always terminates (success or error → end)
  const designOnlyTransitions: Transition[] = [
    { step: STEP_NAMES.DESIGN, on: "success", to: "end" },
    { step: STEP_NAMES.DESIGN, on: "error",   to: "escalate" },
  ];

  const pipeline = new Pipeline({
    steps,
    transitions: designOnlyTransitions,
    maxIterations: 1,
    executor,
    events: bus,
    loopName: STEP_NAMES.DESIGN,
  });

  return pipeline.run(STEP_NAMES.DESIGN, jobState, deps);
}
