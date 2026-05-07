import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { Step } from "../step/types.js";
import { getMaxRetries } from "../../config/getAgentId.js";
import { Pipeline } from "./pipeline.js";
import { STANDARD_TRANSITIONS } from "./types.js";
import type { Transition } from "./types.js";
import { EventBus } from "../event/event-bus.js";
import { StepExecutor } from "../step/executor.js";
import { createManagedAgentRunner } from "../../adapter/managed-agent/agent-runner.js";
import { createClaudeCodeRunner } from "../../adapter/claude-code/agent-runner.js";
import type { AgentRunner } from "../port/agent-runner.js";
import { ProposeStep } from "../step/propose.js";
import { SpecReviewStep } from "../step/spec-review.js";
import { SpecFixerStep } from "../step/spec-fixer.js";
import { ImplementerStep } from "../step/implementer.js";
import { VerificationStep } from "../step/verification.js";
import { BuildFixerStep } from "../step/build-fixer.js";
import { CodeReviewStep } from "../step/code-review.js";
import { CodeFixerStep } from "../step/code-fixer.js";
import { PrCreateStep } from "../step/pr-create.js";

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

  let runner: AgentRunner;
  if (deps.config.runtime === "local") {
    runner = createClaudeCodeRunner({ cwd: deps.cwd });
  } else {
    if (!deps.client) {
      throw new Error("PipelineDeps.client is required for managed runtime. Run 'specrunner init' first.");
    }
    runner = createManagedAgentRunner({
      sessionClient: deps.client,
      githubClient: deps.githubClient,
      repo: deps.repo,
    });
  }

  const executor = new StepExecutor(bus, runner);

  const steps = new Map<string, Step>([
    ["propose",      ProposeStep],
    ["spec-review",  SpecReviewStep],
    ["spec-fixer",   SpecFixerStep],
    ["implementer",  ImplementerStep],
    ["verification", VerificationStep],
    ["build-fixer",  BuildFixerStep],
    ["code-review",  CodeReviewStep],
    ["code-fixer",   CodeFixerStep],
    ["pr-create",    PrCreateStep],
  ]);

  return new Pipeline({
    steps,
    transitions: STANDARD_TRANSITIONS,
    maxIterations,
    executor,
    events: bus,
    loopName: "spec-review",
    loopNames: ["spec-review", "verification", "code-review"],
  });
}

/**
 * Run the full pipeline: propose → spec-review loop (with spec-fixer on needs-fix).
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
  // Design D8: composition root branches on config.runtime.
  // TC-035: managed → ManagedAgentRunner (SessionClient required)
  // TC-036: local → ClaudeCodeRunner (no SessionClient)
  const pipeline = createStandardPipeline(deps, bus);
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
  events?: EventBus,
): Promise<JobState> {
  const bus = events ?? new EventBus();

  // Design D8: composition root branches on config.runtime.
  let proposeRunner: AgentRunner;
  if (deps.config.runtime === "local") {
    proposeRunner = createClaudeCodeRunner({ cwd: deps.cwd });
  } else {
    if (!deps.client) {
      throw new Error("PipelineDeps.client is required for managed runtime. Run 'specrunner init' first.");
    }
    proposeRunner = createManagedAgentRunner({
      sessionClient: deps.client,
      githubClient: deps.githubClient,
      repo: deps.repo,
    });
  }

  const executor = new StepExecutor(bus, proposeRunner);

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
    events: bus,
    loopName: "propose",
  });

  return pipeline.run("propose", jobState, deps);
}
