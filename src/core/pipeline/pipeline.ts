import type { Step } from "../step/types.js";
import type { Transition } from "./types.js";
import { LOOP_ERROR_CODES } from "./types.js";
import type { JobState, Verdict, StepRun, StepName } from "../../state/schema.js";
import { appendHistoryEntry } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import { StepExecutor } from "../step/executor.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { transitionJob } from "../../state/lifecycle.js";
import { stdoutWrite } from "../../logger/stdout.js";
import { STEP_NAMES } from "../step/step-names.js";

/** Error codes that indicate truly fatal pipeline failures (not resumable). */
const FATAL_ERROR_CODES: Set<string> = new Set([
  "SESSION_CREATE_FAILED",
  "CONFIG_MISSING",
  "CONFIG_INCOMPLETE",
  "CONFIG_INVALID",
]);

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
  /** Loop name for stdout progress output (matches legacy runLoopUntil output). */
  private readonly loopName: string;
  /** All loop step names (loopName + additional loops). */
  private readonly loopNames: string[];
  /** Mapping: review step name → paired fixer step name. */
  private readonly loopFixerPairs: Record<string, string>;

  constructor(params: {
    steps: Map<string, Step>;
    transitions: Transition[];
    maxIterations: number;
    executor: StepExecutor;
    events: EventBus;
    loopName?: string;
    loopNames?: string[];
    loopFixerPairs?: Record<string, string>;  // review → fixer mapping
  }) {
    this.steps = params.steps;
    this.transitions = params.transitions;
    this.maxIterations = params.maxIterations;
    this.executor = params.executor;
    this.events = params.events;
    this.loopName = params.loopName ?? STEP_NAMES.SPEC_REVIEW;
    this.loopNames = params.loopNames ?? [this.loopName];
    this.loopFixerPairs = params.loopFixerPairs ?? {};
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
      let finalState = errState ?? jobState;

      // Last-resort safety net: if state is still "running" after an unhandled throw,
      // transition to awaiting-resume so the job is resumable (not stuck).
      if (finalState.status === "running") {
        const store = new JobStateStore(finalState.jobId);
        const { state: resumeState } = transitionJob(finalState, "awaiting-resume", {
          trigger: "pipeline",
          reason: (err as Error).message ?? String(err),
          patch: {
            pid: null,
            resumePoint: {
              step: (finalState.step ?? STEP_NAMES.DESIGN) as StepName,
              reason: (err as Error).message ?? String(err),
              iterationsExhausted: 0,
            },
            error: {
              code: "PIPELINE_UNHANDLED_ERROR",
              message: (err as Error).message ?? String(err),
              hint: "",
            },
          },
        });
        finalState = resumeState;
        await store.persist(finalState);
      }

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
    // Per-loop iteration counters (supports multiple loops)
    const loopIters = new Map<string, number>();
    // Per-fixer iteration counters (independent from loopIters)
    const fixerIters = new Map<string, number>();
    let prevLoopStep = "";  // last step before entering the primary loopName (for history message)

    while (true) {
      const step = this.steps.get(currentStep);
      if (!step) {
        throw new Error(`Step not found in pipeline: ${currentStep}`);
      }

      // --- Loop step entry bookkeeping ---
      const isLoopStep = currentStep === this.loopName;
      const isAnyLoopStep = this.loopNames.includes(currentStep);
      if (isAnyLoopStep) {
        const prevIter = loopIters.get(currentStep) ?? 0;
        const newIter = prevIter + 1;
        loopIters.set(currentStep, newIter);

        if (isLoopStep) {
          const loopIter = newIter;
          stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] starting ${this.loopName}\n`);
        }

        // Append history: loop iteration started
        state = appendHistoryEntry(state, {
          ts: new Date().toISOString(),
          step: currentStep,
          status: "started" as const,
          message: `${currentStep} iteration ${loopIters.get(currentStep)} started`,
        });
      }

      // --- Fixer step entry bookkeeping ---
      const isFixer = Object.values(this.loopFixerPairs).includes(currentStep);
      if (isFixer) {
        const prevFixerIter = fixerIters.get(currentStep) ?? 0;
        fixerIters.set(currentStep, prevFixerIter + 1);
      }

      // --- Execute the step ---
      const stateBeforeExec = state;
      try {
        state = await this.executor.execute(step, state, deps);
      } catch (err) {
        const errWithState = err as { state?: JobState };
        if (errWithState.state) {
          state = errWithState.state;
        } else {
          // Safety net: executor threw without attaching state.
          // Mark as failed so getStepOutcome() returns "error" and
          // the transition table routes to "escalate" → awaiting-resume.
          const store = new JobStateStore(state.jobId);
          state = await store.fail(state, {
            code: "UNEXPECTED_STEP_ERROR",
            message: (err as Error).message ?? String(err),
            hint: "",
          }, currentStep);
        }
      }

      // Persist state after each step for crash resilience
      const store = new JobStateStore(state.jobId);
      await store.persist(state);

      // --- Determine step outcome for transition lookup ---
      const outcome = this.getStepOutcome(state, stateBeforeExec, currentStep);
      const loopIter = loopIters.get(currentStep) ?? 0;

      // --- Loop step exit bookkeeping ---
      if (isAnyLoopStep) {
        const verdict: Verdict | string = outcome;
        const historyStatus = verdict === "approved" || verdict === "passed"
          ? ("ok" as const)
          : verdict === "escalation" || verdict === "error"
            ? ("error" as const)
            : ("warning" as const);

        state = appendHistoryEntry(state, {
          ts: new Date().toISOString(),
          step: currentStep,
          status: historyStatus,
          message: `${currentStep} iteration ${loopIter} completed with verdict: ${verdict}`,
        });
      }

      // --- Look up next step from transition table ---
      const transition = this.transitions.find(
        (t) => t.step === currentStep && t.on === outcome,
      );
      const nextStep = transition?.to ?? "escalate";

      // --- Terminal conditions ---
      if (nextStep === "end" || nextStep === "escalate") {
        // Print loop verdict line for primary loop steps
        if (isLoopStep) {
          if (outcome === "approved") {
            stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: approved → done\n`);
          } else if (outcome === "escalation" || outcome === "error") {
            stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: escalation → halt\n`);
          }
        }

        // Print final pipeline summary if spec-review was in the pipeline
        if (this.steps.has(STEP_NAMES.SPEC_REVIEW)) {
          const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
          const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
          stdoutWrite(
            `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
          );
        }

        // Normal completion → awaiting-merge
        if (nextStep === "end" && state.status === "running") {
          const { state: mergeState } = transitionJob(state, "awaiting-merge", {
            trigger: "pipeline",
            reason: "pipeline complete",
          });
          state = mergeState;
          const endStore = new JobStateStore(state.jobId);
          await endStore.persist(state);
        }

        // Escalation → awaiting-resume (unless fatal error)
        if (nextStep === "escalate" && (state.status !== "failed" || !FATAL_ERROR_CODES.has(state.error?.code ?? ""))) {
          const { state: escalateState } = transitionJob(state, "awaiting-resume", {
            trigger: "pipeline",
            reason: state.error?.message ?? `${currentStep} escalated`,
            patch: {
              resumePoint: {
                step: currentStep as StepName,
                reason: state.error?.message ?? `${currentStep} escalated`,
                iterationsExhausted: loopIters.get(currentStep) ?? 0,
              },
            },
          });
          state = escalateState;
          const escalateStore = new JobStateStore(state.jobId);
          await escalateStore.persist(state);
        }

        break;
      }

      // --- Check loop exhaustion before entering next loop iteration ---
      if (this.loopNames.includes(nextStep as string)) {
        const nextLoopIter = loopIters.get(nextStep as string) ?? 0;
        if (nextLoopIter >= this.maxIterations) {
          // Check bypass: fixer has reached its max iterations → allow one more review.
          // Condition is based on fixer iteration count, not the immediately preceding step,
          // so the bypass survives intermediate deterministic steps that the transition table
          // inserts between the fixer and the review (e.g. spec-fixer → delta-spec-validation
          // → spec-review). Per loop, the review is only re-entered through its paired fixer,
          // so this counter-based check is correct for any path that reaches the review.
          const pairedFixer = this.loopFixerPairs[nextStep as string];
          const fixerAtMax = pairedFixer !== undefined && (fixerIters.get(pairedFixer) ?? 0) >= this.maxIterations;

          if (!fixerAtMax) {
            // Conventional exhaustion (no fixer bypass)
            stdoutWrite(`[iter ${nextLoopIter}/${this.maxIterations}] retries exhausted, escalating\n`);
            state = await this.handleExhausted(state, nextStep as string, "review-exhausted");

            if (this.steps.has(STEP_NAMES.SPEC_REVIEW)) {
              const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
              const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
              stdoutWrite(
                `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
              );
            }
            break;
          }
          // else: bypass — allow the +1 review iteration (fixer final iter review)
        }
      }

      // --- Check fixer exhaustion before entering fixer step ---
      const fixerNames = new Set(Object.values(this.loopFixerPairs));
      if (fixerNames.has(nextStep as string)) {
        const nextFixerIter = fixerIters.get(nextStep as string) ?? 0;
        if (nextFixerIter >= this.maxIterations) {
          // Fixer exhausted: the review that triggered this needs-fix has already used the bypass
          // Find the paired review for this fixer to escalate properly
          const pairedReview = Object.entries(this.loopFixerPairs)
            .find(([_, fixer]) => fixer === nextStep)?.[0];
          const exhaustedLoopName = pairedReview ?? (nextStep as string);
          stdoutWrite(`[iter ${this.maxIterations}/${this.maxIterations}] retries exhausted, escalating\n`);
          state = await this.handleExhausted(state, exhaustedLoopName, "review-after-final-fix");

          if (this.steps.has(STEP_NAMES.SPEC_REVIEW)) {
            const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
            const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
            stdoutWrite(
              `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
            );
          }
          break;
        }
      }

      // Print needs-fix transition message for loop steps
      if (isLoopStep && outcome === "needs-fix") {
        stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: needs-fix → spawning fixer\n`);
      }

      // --- Append transition history ---
      const fromMsg = prevLoopStep
        ? `${prevLoopStep} complete → ${nextStep} (iter ${(loopIters.get(this.loopName) ?? 0) + (nextStep === this.loopName ? 1 : 0)})`
        : `${currentStep} → ${nextStep}`;
      const transitionStore = new JobStateStore(state.jobId);
      state = await transitionStore.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "step-transition",
        status: "ok",
        message: fromMsg,
      });

      prevLoopStep = isLoopStep ? currentStep : "";
      currentStep = nextStep as string;
    }

    return state;
  }

  /**
   * Determine the outcome signal for a completed step.
   *
   * The outcome is used to look up the transition. Convention:
   * - "error": step failed (state.status === "failed")
   * - For steps with a recorded verdict: that verdict string
   * - For steps with no verdict (resultFilePath null): uses step.completionVerdict
   *   (defaults to "approved" if unset, preserving spec-fixer → spec-review loop)
   * - Special case: "design" uses the design SSE path and gets "success" via completionVerdict
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

    // No verdict in step result: use the step's completionVerdict if available
    const step = this.steps.get(stepName);
    if (step && step.kind === "agent" && step.completionVerdict !== undefined) {
      return step.completionVerdict;
    }

    // spec-fixer and other polling-style steps with no result file default to "approved"
    return "approved";
  }

  /**
   * Handle loop exhaustion: sets the loop-specific error code from LOOP_ERROR_CODES.
   * Derived from the exhaustedLoopName → LOOP_ERROR_CODES lookup (no hardcoded error strings).
   * @param exhaustedLoopName - the name of the loop step that exhausted its retries
   * @param exhaustionPhase - optional diagnostic phase for the resumePoint
   */
  private async handleExhausted(
    state: JobState,
    exhaustedLoopName: string = this.loopName,
    exhaustionPhase?: "review-after-final-fix" | "review-exhausted",
  ): Promise<JobState> {
    const loopResults = state.steps?.[exhaustedLoopName] ?? [];
    let updatedSteps = state.steps ?? {};
    if (loopResults.length > 0) {
      const lastIdx = loopResults.length - 1;
      const lastResult = loopResults[lastIdx];
      if (lastResult) {
        const updatedResults: StepRun[] = [
          ...loopResults.slice(0, lastIdx),
          { ...lastResult, outcome: { ...("outcome" in lastResult ? lastResult.outcome : {}), verdict: "escalation" as const } } as StepRun,
        ];
        updatedSteps = { ...updatedSteps, [exhaustedLoopName]: updatedResults };
      }
    }
    const lastIteration = loopResults.length > 0
      ? (loopResults[loopResults.length - 1] as StepRun).attempt ?? this.maxIterations
      : this.maxIterations;
    const nnn = String(lastIteration).padStart(3, "0");

    // Lookup error shape from LOOP_ERROR_CODES (no hardcode)
    const errorShape = LOOP_ERROR_CODES[exhaustedLoopName] ?? {
      code: `${exhaustedLoopName.toUpperCase().replace(/-/g, "_")}_RETRIES_EXHAUSTED`,
      message: (n: number) => `${exhaustedLoopName} did not complete after ${n} iterations`,
      hint: (_nnn: string) => `Review the ${exhaustedLoopName} results and fix manually.`,
    };

    const stateWithSteps = { ...state, steps: updatedSteps };
    const { state: exhaustedState } = transitionJob(stateWithSteps, "awaiting-resume", {
      trigger: "pipeline",
      reason: errorShape.message(this.maxIterations),
      patch: {
        resumePoint: {
          step: exhaustedLoopName as StepName,
          reason: errorShape.message(this.maxIterations),
          iterationsExhausted: this.maxIterations,
          ...(exhaustionPhase && { exhaustionPhase }),
        },
        error: {
          code: errorShape.code,
          message: errorShape.message(this.maxIterations),
          hint: errorShape.hint(nnn),
        },
      },
    });
    const exhaustedStore = new JobStateStore(exhaustedState.jobId);
    await exhaustedStore.persist(exhaustedState);
    return exhaustedState;
  }
}
