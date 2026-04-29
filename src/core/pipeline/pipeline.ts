import type { Step } from "../step/types.js";
import type { Transition } from "./types.js";
import type { JobState, Verdict, StepRun } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import { StepExecutor } from "../step/executor.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { stdoutWrite } from "../../logger/stdout.js";

/**
 * Pipeline: state machine driven by a declarative Transition table.
 *
 * Design D5: replaces the inline if-chain + runLoopUntil in pipeline.ts.
 *
 * runInternal drives execution entirely from the transition table:
 *   at each step's completion, look up (step, outcome) → next step.
 *   "end" and "escalate" terminate the pipeline.
 *   Steps named `loopName` are treated as loop steps: they increment the
 *   iteration counter and print the `[iter N/M]` progress line.
 *
 * The loop guard tracks iterations of `loopName` and terminates with
 * SPEC_REVIEW_RETRIES_EXHAUSTED at maxIterations.
 */
export class Pipeline {
  private readonly steps: Map<string, Step>;
  private readonly transitions: Transition[];
  private readonly maxIterations: number;
  private readonly executor: StepExecutor;
  private readonly events: EventBus;
  /** Loop name for stdout progress output (matches legacy runLoopUntil output). */
  private readonly loopName: string;

  constructor(params: {
    steps: Map<string, Step>;
    transitions: Transition[];
    maxIterations: number;
    executor: StepExecutor;
    events: EventBus;
    loopName?: string;
  }) {
    this.steps = params.steps;
    this.transitions = params.transitions;
    this.maxIterations = params.maxIterations;
    this.executor = params.executor;
    this.events = params.events;
    this.loopName = params.loopName ?? "spec-review";
  }

  /**
   * Run the pipeline starting at `startStep`.
   * Returns the final state after the pipeline completes or fails.
   */
  async run(
    startStep: string,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    this.events.emit("pipeline:start", { state: jobState });

    try {
      const result = await this.runInternal(startStep, jobState, deps);
      this.events.emit("pipeline:complete", { state: result });
      return result;
    } catch (err) {
      const errState = (err as Record<string, unknown>)["state"] as JobState | undefined;
      const finalState = errState ?? jobState;
      this.events.emit("pipeline:fail", {
        state: finalState,
        reason: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Internal pipeline execution, fully table-driven.
   *
   * Algorithm:
   * 1. Start at `startStep`.
   * 2. Execute the current step (catching errors into state).
   * 3. Determine the step's "outcome" (verdict or status signal).
   * 4. Look up the transition (currentStep, outcome) → nextStep.
   * 5. "end" / "escalate" → stop.
   * 6. Entering `loopName` → increment iter counter, print progress, check exhaustion.
   * 7. Append transition history, set currentStep = nextStep, repeat from 2.
   *
   * Stdout format is bit-for-bit preserved vs. the old runLoopUntil implementation.
   */
  private async runInternal(
    startStep: string,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    let state = jobState;
    let currentStep = startStep;
    let loopIter = 0;       // counts iterations of loopName
    let prevLoopStep = "";  // last step before entering loopName (for history message)

    while (true) {
      const step = this.steps.get(currentStep);
      if (!step) {
        throw new Error(`Step not found in pipeline: ${currentStep}`);
      }

      // --- Loop step entry bookkeeping ---
      const isLoopStep = currentStep === this.loopName;
      if (isLoopStep) {
        loopIter++;
        stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] starting ${this.loopName}\n`);

        // Append history: loop iteration started
        state = {
          ...state,
          history: [
            ...state.history,
            {
              ts: new Date().toISOString(),
              step: this.loopName,
              status: "started" as const,
              message: `${this.loopName} iteration ${loopIter} started`,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      }

      // --- Execute the step ---
      const stateBeforeExec = state;
      try {
        state = await this.executor.execute(step, state, deps);
      } catch (err) {
        const errWithState = err as { state?: JobState };
        if (errWithState.state) {
          state = errWithState.state;
        }
        // state.status will be "failed" — outcome detection below handles it
      }

      // Persist state after each step for crash resilience
      const store = new JobStateStore(state.jobId);
      await store.persist(state);

      // --- Determine step outcome for transition lookup ---
      const outcome = this.getStepOutcome(state, stateBeforeExec, currentStep);

      // --- Loop step exit bookkeeping ---
      if (isLoopStep) {
        const verdict: Verdict | string = outcome;
        const historyStatus = verdict === "approved"
          ? ("ok" as const)
          : verdict === "escalation" || verdict === "error"
            ? ("error" as const)
            : ("warning" as const);

        state = {
          ...state,
          history: [
            ...state.history,
            {
              ts: new Date().toISOString(),
              step: this.loopName,
              status: historyStatus,
              message: `${this.loopName} iteration ${loopIter} completed with verdict: ${verdict}`,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      }

      // --- Look up next step from transition table ---
      const transition = this.transitions.find(
        (t) => t.step === currentStep && t.on === outcome,
      );
      const nextStep = transition?.to ?? "escalate";

      // --- Terminal conditions ---
      if (nextStep === "end" || nextStep === "escalate") {
        // Print loop verdict line for loop steps
        if (isLoopStep) {
          if (outcome === "approved") {
            stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: approved → done\n`);
          } else if (outcome === "escalation" || outcome === "error") {
            stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: escalation → halt\n`);
          }
        }

        // Print final pipeline summary if spec-review was in the pipeline
        if (this.steps.has("spec-review")) {
          const specReviewResults = state.steps?.["spec-review"] ?? [];
          const finalVerdict = getLatestStepResult(state, "spec-review")?.verdict ?? "escalation";
          stdoutWrite(
            `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
          );
        }
        break;
      }

      // --- Check loop exhaustion before entering next loopName iteration ---
      if (nextStep === this.loopName && loopIter >= this.maxIterations) {
        // Print exhaustion message
        stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] retries exhausted, escalating\n`);
        state = await this.handleExhausted(state);

        // Print final summary
        if (this.steps.has("spec-review")) {
          const specReviewResults = state.steps?.["spec-review"] ?? [];
          const finalVerdict = getLatestStepResult(state, "spec-review")?.verdict ?? "escalation";
          stdoutWrite(
            `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
          );
        }
        break;
      }

      // Print needs-fix transition message for loop steps
      if (isLoopStep && outcome === "needs-fix") {
        stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: needs-fix → spawning fixer\n`);
      }

      // --- Append transition history ---
      const fromMsg = prevLoopStep
        ? `${prevLoopStep} complete → ${nextStep} (iter ${loopIter + (nextStep === this.loopName ? 1 : 0)})`
        : `${currentStep} → ${nextStep}`;
      const transitionStore = new JobStateStore(state.jobId);
      state = await transitionStore.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "step-transition",
        status: "ok",
        message: fromMsg,
      });

      prevLoopStep = isLoopStep ? currentStep : "";
      currentStep = nextStep;
    }

    return state;
  }

  /**
   * Determine the outcome signal for a completed step.
   *
   * The outcome is used to look up the transition. Convention:
   * - "error": step failed (state.status === "failed")
   * - For propose (no verdict): "success" on completion
   * - For spec-fixer (no verdict): "approved" on completion (always loops back to spec-review)
   * - For spec-review: the verdict string from the latest step result
   */
  private getStepOutcome(
    state: JobState,
    _stateBeforeExec: JobState,
    stepName: string,
  ): string {
    if (state.status === "failed") {
      return "error";
    }

    const verdict = getLatestStepResult(state, stepName)?.verdict;
    if (verdict !== null && verdict !== undefined) {
      return verdict;
    }

    // No verdict in step result: use step-specific default
    if (stepName === "propose") {
      return "success";
    }

    // spec-fixer and other polling-style steps with no result file default to "approved"
    return "approved";
  }

  /**
   * Handle loop exhaustion: sets SPEC_REVIEW_RETRIES_EXHAUSTED error.
   * Mirrors the existing `onExceeded` callback in the legacy pipeline.ts.
   */
  private async handleExhausted(state: JobState): Promise<JobState> {
    const specReviewResults = state.steps?.["spec-review"] ?? [];
    let updatedSteps = state.steps ?? {};
    if (specReviewResults.length > 0) {
      const lastIdx = specReviewResults.length - 1;
      const lastResult = specReviewResults[lastIdx];
      if (lastResult) {
        const updatedResults: StepRun[] = [
          ...specReviewResults.slice(0, lastIdx),
          { ...lastResult, outcome: { ...("outcome" in lastResult ? lastResult.outcome : {}), verdict: "escalation" as const } } as StepRun,
        ];
        updatedSteps = { ...updatedSteps, "spec-review": updatedResults };
      }
    }
    const lastIteration = specReviewResults.length > 0
      ? (specReviewResults[specReviewResults.length - 1] as StepRun).attempt ?? this.maxIterations
      : this.maxIterations;
    const nnn = String(lastIteration).padStart(3, "0");
    const updated: JobState = {
      ...state,
      steps: updatedSteps,
      error: {
        code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
        message: `spec-review did not approve after ${this.maxIterations} iterations`,
        hint: `Review spec-review-result-${nnn}.md and adjust the request manually.`,
      },
      updatedAt: new Date().toISOString(),
    };
    const exhaustedStore = new JobStateStore(updated.jobId);
    await exhaustedStore.persist(updated);
    return updated;
  }
}
