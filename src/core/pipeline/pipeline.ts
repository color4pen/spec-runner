import type { Step } from "../step/types.js";
import type { Transition, ParallelReviewConfig } from "./types.js";
import { LOOP_ERROR_CODES } from "./types.js";
import type { JobState, Verdict, StepRun } from "../../state/schema.js";
import { appendHistoryEntry } from "../../state/schema.js";
import { toStepName } from "../step/step-names.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import { StepExecutor } from "../step/executor.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { transitionJob } from "../../state/lifecycle.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import { notifyJobTerminal } from "../notify/issue-notifier.js";
import { resolveActiveReviewer, lastReviewerFixableCount } from "./reviewer-chain.js";
import { ConvergenceBudget } from "./convergence-budget.js";
import { ParallelReviewRound } from "./parallel-review-round.js";

/** Error codes that indicate truly fatal pipeline failures (not resumable). */
const FATAL_ERROR_CODES: Set<string> = new Set([
  "SESSION_CREATE_FAILED",
  "CONFIG_MISSING",
  "CONFIG_INCOMPLETE",
  "CONFIG_INVALID",
]);

/**
 * Resolve the review step that should be attributed with exhaustion for a given fixer.
 *
 * For one-to-one (single reviewer paired with fixer): returns that reviewer.
 * For many-to-one (multiple reviewers sharing a fixer): uses resolveActiveReviewer
 * to determine which reviewer is currently active.
 *
 * @param state         - Current job state (used by resolveActiveReviewer).
 * @param fixerName     - Name of the fixer step being entered.
 * @param loopFixerPairs - Review → fixer mapping from the pipeline descriptor.
 */
function resolvePairedReviewForFixer(
  state: JobState,
  fixerName: string,
  loopFixerPairs: Record<string, string>,
): string {
  const pairedReviewers = Object.entries(loopFixerPairs)
    .filter(([, fixer]) => fixer === fixerName)
    .map(([reviewer]) => reviewer);

  if (pairedReviewers.length === 0) return fixerName;
  if (pairedReviewers.length === 1) return pairedReviewers[0]!;

  // Multiple reviewers share this fixer → use active reviewer
  return resolveActiveReviewer(state, pairedReviewers);
}

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
  /** Per-step maxIterations overrides. When set for a step, used instead of maxIterations. */
  private readonly maxIterationsByStep: Record<string, number>;
  private readonly executor: StepExecutor;
  private readonly events: EventBus;
  /** Loop name for stdout progress output (matches legacy runLoopUntil output). */
  private readonly loopName: string;
  /** All loop step names (loopName + additional loops). */
  private readonly loopNames: string[];
  /** Mapping: review step name → paired fixer step name. */
  private readonly loopFixerPairs: Record<string, string>;
  /** Step name used for the pipeline summary (pipeline:summary event). */
  private readonly summaryStep: string | undefined;
  /**
   * Parallel review configuration (set by composeReviewerDescriptor).
   *
   * Design D2 / D3 (reviewer-parallel-execution): when present, the coordinator step
   * is handled specially in runInternal — it fans out to members in parallel rather
   * than dispatching to the steps Map (coordinator is a virtual node, not in the Map).
   *
   * absent = standard sequential execution (zero-reviewer backward compat preserved)
   */
  private readonly parallelReview: ParallelReviewConfig | undefined;
  /** Component that encapsulates coordinator fan-out for parallel reviewer execution. */
  private readonly round: ParallelReviewRound | undefined;

  constructor(params: {
    steps: Map<string, Step>;
    transitions: Transition[];
    maxIterations: number;
    executor: StepExecutor;
    events: EventBus;
    loopName?: string;
    loopNames?: string[];
    loopFixerPairs?: Record<string, string>;  // review → fixer mapping
    summaryStep?: string;
    maxIterationsByStep?: Record<string, number>;
    parallelReview?: ParallelReviewConfig;
  }) {
    this.steps = params.steps;
    this.transitions = params.transitions;
    this.maxIterations = params.maxIterations;
    this.maxIterationsByStep = params.maxIterationsByStep ?? {};
    this.executor = params.executor;
    this.events = params.events;
    this.loopName = params.loopName ?? (params.loopNames?.[0] ?? "");
    this.loopNames = params.loopNames ?? (this.loopName ? [this.loopName] : []);
    this.loopFixerPairs = params.loopFixerPairs ?? {};
    this.summaryStep = params.summaryStep;
    this.parallelReview = params.parallelReview;
    this.round = params.parallelReview
      ? new ParallelReviewRound({ executor: this.executor, steps: this.steps, parallelReview: params.parallelReview, events: this.events })
      : undefined;
  }

  /**
   * Resolve the effective maxIterations for a given step name.
   * Returns step-specific override if present, else the global maxIterations.
   */
  private resolveMaxIterations(stepName: string): number {
    return this.maxIterationsByStep[stepName] ?? this.maxIterations;
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
    logPipelineDiag("pipeline:run:entry", `jobId=${jobState.jobId}, startStep=${startStep}`);
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
        const store = deps.storeFactory!(finalState.jobId);
        const { state: resumeState } = transitionJob(finalState, "awaiting-resume", {
          trigger: "pipeline",
          reason: (err as Error).message ?? String(err),
          patch: {
            pid: null,
            resumePoint: {
              step: toStepName(finalState.step ?? startStep),
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
    let budget = ConvergenceBudget.initial();
    // D4: one-shot resume input ownership.
    // The first unit to execute (step or coordinator round) receives the original deps
    // (which may carry resumePrompt / resumeContext). Subsequent units receive a clone
    // with both resume fields stripped. This replaces the per-executor in-place clearing
    // that was previously in executor.ts.
    const depsWithoutResume: PipelineDeps = { ...deps, resumePrompt: undefined, resumeContext: undefined };
    let firstUnitExecuted = false;

    while (true) {
      // --- Coordinator fan-out detection (must precede steps.get) ---
      // Design D2 / D3 (reviewer-parallel-execution): the coordinator is a virtual node
      // NOT in the steps Map. When detected, the engine fans out to member steps in
      // parallel instead of dispatching to the steps Map.
      const isCoordinator = this.parallelReview !== undefined &&
        currentStep === this.parallelReview.coordinator;

      // --- Loop step entry bookkeeping ---
      const isLoopStep = currentStep === this.loopName;
      const isAnyLoopStep = this.loopNames.includes(currentStep);
      if (isAnyLoopStep) {
        const { budget: nextBudget, iteration: loopIter } = budget.enterLoopStep(currentStep);
        budget = nextBudget;

        // T-04: use resolveMaxIterations(currentStep) so step-specific overrides are reflected
        // in the displayed /M value (fixes iter N/M showing global max instead of step max).
        this.events.emit("pipeline:iteration:start", { step: currentStep, iteration: loopIter, maxIterations: this.resolveMaxIterations(currentStep) });

        // Append history: loop iteration started
        state = appendHistoryEntry(state, {
          ts: new Date().toISOString(),
          step: currentStep,
          status: "started" as const,
          message: `${currentStep} iteration ${budget.getLoopIter(currentStep)} started`,
        });
      }

      // --- Fixer step entry bookkeeping ---
      const isFixer = Object.values(this.loopFixerPairs).includes(currentStep);
      if (isFixer) {
        budget = budget.enterFixerStep(currentStep);
      }

      // --- Execute: coordinator fan-out or regular step dispatch ---
      let outcome: string;

      // Select effective deps for this unit: first unit gets original deps (with resume
      // input); subsequent units get depsWithoutResume (one-shot ownership, D4).
      const effectiveDeps = firstUnitExecuted ? depsWithoutResume : deps;

      if (isCoordinator) {
        // --- Coordinator fan-out (D3 / D4 / D6 / D8) ---
        const fanResult = await this.round!.run(currentStep, state, effectiveDeps);
        state = fanResult.state;
        outcome = fanResult.outcome;
      } else {
        const step = this.steps.get(currentStep);
        if (!step) {
          throw new Error(`Step not found in pipeline: ${currentStep}`);
        }

        // --- Non-loop CliStep entry announcement ---
        const isNonLoopCliStep = step.kind === "cli" && !isAnyLoopStep;
        if (isNonLoopCliStep) {
          this.events.emit("pipeline:cli-step", { step: currentStep });
        }

        // --- Execute the step ---
        const stateBeforeExec = state;
        logPipelineDiag("pipeline:step:pre-execute", `step=${currentStep}`);
        try {
          state = await this.executor.execute(step, state, effectiveDeps);
        } catch (err) {
          const errWithState = err as { state?: JobState };
          if (errWithState.state) {
            state = errWithState.state;
          } else {
            // Safety net: executor threw without attaching state.
            // Mark as failed so getStepOutcome() returns "error" and
            // the transition table routes to "escalate" → awaiting-resume.
            const store = deps.storeFactory!(state.jobId);
            state = await store.fail(state, {
              code: "UNEXPECTED_STEP_ERROR",
              message: (err as Error).message ?? String(err),
              hint: "",
            }, currentStep);
          }
        }

        logPipelineDiag("pipeline:step:post-execute", `step=${currentStep}, status=${state.status}`);

        // Persist state after each step for crash resilience
        const store = deps.storeFactory!(state.jobId);
        await store.persist(state);

        // --- Determine step outcome for transition lookup ---
        outcome = this.getStepOutcome(state, stateBeforeExec, currentStep);

        // --- Non-loop CliStep completion announcement ---
        if (isNonLoopCliStep) {
          const stepVerdict = getLatestStepResult(state, currentStep)?.verdict;
          if (stepVerdict != null) {
            this.events.emit("pipeline:cli-step", { step: currentStep, verdict: stepVerdict });
          }
        }
      }

      // D4: mark first unit as executed so subsequent units receive depsWithoutResume.
      firstUnitExecuted = true;

      // guard-halt honored: terminal control exit.
      // When a step's guard-halt (timeout / drift) sets state.status="awaiting-resume",
      // the pipeline must stop immediately and NOT execute any subsequent steps.
      //
      // This is the convergence point for both sequential and coordinator paths:
      //   - Sequential: executor.execute throws (commitHalt → attachStateAndRethrow), catch
      //     block sets state = errWithState.state (awaiting-resume), store.persist runs.
      //   - Coordinator: commitRound does NOT set awaiting-resume (halt members are recorded
      //     in-memory only); state remains "running" and outcome is "escalation". The escalation
      //     terminal below handles it — this guard does NOT fire for the coordinator path.
      //
      // Why break here instead of routing via escalate terminal:
      //   The escalate terminal calls transitionJob("awaiting-resume") again, which would clobber
      //   resumePoint.step and error already written by commitHalt / executor. Double transition
      //   corrupts the resume anchor. Breaking here preserves the commitHalt-written state intact.
      //
      // Publisher seam (pipeline.ts:504): reached unconditionally after break.
      // getStepOutcome hardening (below) is a defensive fail-safe for this guard.
      if (state.status === "awaiting-resume") {
        // guard-halt honored: terminal control exit → publisher seam
        this.printPipelineFinished(state);
        break;
      }

      const loopIter = budget.getLoopIter(currentStep);

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
      // `when` predicate (if defined) must return true for the transition to fire.
      // Rows without `when` always match — enabling context-aware conditional routing.
      const transition = this.transitions.find(
        (t) => t.step === currentStep && t.on === outcome && (!t.when || t.when(state)),
      );
      let nextStep = transition?.to ?? "escalate";
      logPipelineDiag("pipeline:transition:resolved", `step=${currentStep}, outcome=${outcome}, next=${nextStep}`);

      // --- Terminal conditions ---
      if (nextStep === "end" || nextStep === "escalate") {
        logPipelineDiag("pipeline:terminal", `step=${currentStep}, terminal=${nextStep}`);
        // Print loop verdict line for primary loop steps
        if (isAnyLoopStep) {
          if (outcome === "approved") {
            this.events.emit("pipeline:iteration:verdict", { step: currentStep, iteration: loopIter, verdict: "approved", action: "done" });
          } else if (outcome === "escalation" || outcome === "error") {
            this.events.emit("pipeline:iteration:verdict", { step: currentStep, iteration: loopIter, verdict: outcome, action: "halt" });
          }
        }

        // Print final pipeline summary if spec-review was in the pipeline
        this.printPipelineFinished(state);

        // Normal completion → awaiting-archive
        if (nextStep === "end" && state.status === "running") {
          const { state: mergeState } = transitionJob(state, "awaiting-archive", {
            trigger: "pipeline",
            reason: "pipeline complete",
          });
          state = mergeState;
          const endStore = deps.storeFactory!(state.jobId);
          await endStore.persist(state);
          // D5: commit slug canonical state (state.json / events.jsonl) to feature branch
          await deps.runtimeStrategy?.commitFinalState(deps, state);
        }

        // Escalation → awaiting-resume (unless fatal error)
        if (nextStep === "escalate" && (state.status !== "failed" || !FATAL_ERROR_CODES.has(state.error?.code ?? ""))) {
          const { state: escalateState } = transitionJob(state, "awaiting-resume", {
            trigger: "pipeline",
            reason: state.error?.message ?? `${currentStep} escalated`,
            patch: {
              resumePoint: {
                step: toStepName(currentStep),
                reason: state.error?.message ?? `${currentStep} escalated`,
                iterationsExhausted: budget.getLoopIter(currentStep),
              },
            },
          });
          state = escalateState;
          const escalateStore = deps.storeFactory!(state.jobId);
          await escalateStore.persist(state);
        }

        break;
      }

      // --- T-03: Prevent approved verdict from being overturned by fixer budget exhaustion ---
      // When a reviewer approves (outcome==="approved") but the paired fixer's iteration
      // budget is already exhausted, re-route to the clean approved destination instead of
      // entering the fixer (which would trigger the fixer exhaustion check and escalate).
      //
      // Conditions (all must be true to fire):
      //   1. outcome === "approved"
      //   2. nextStep is a paired fixer
      //   3. fixer iteration budget >= effectiveMax for the paired reviewer
      //
      // Action: replace nextStep with the clean approved transition (the approved row with
      // no `when` guard that does NOT target a fixer step). If no clean transition is found,
      // fall through to the existing fixer exhaustion check (fail-safe = traditional escalation).
      //
      // T-04: Record the omission in history and emit pipeline:fixer:budget-skipped event.
      //
      // DESTRUCTION CONFIRMATION (TC-014):
      // Commenting out this block causes TC-001 to fail:
      //   result.status === "awaiting-resume" with CODE_REVIEW_RETRIES_EXHAUSTED
      // Reproduce: comment this block, run:
      //   bun run test tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts
      {
        const fixerNamesForReroute = new Set(Object.values(this.loopFixerPairs));
        if (
          outcome === "approved" &&
          typeof nextStep === "string" &&
          fixerNamesForReroute.has(nextStep)
        ) {
          const budgetSkippedFixer = nextStep;
          const exhaustedReviewer = resolvePairedReviewForFixer(state, budgetSkippedFixer, this.loopFixerPairs);
          const effectiveMaxReroute = this.resolveMaxIterations(exhaustedReviewer);
          if (budget.getFixerIter(budgetSkippedFixer) >= effectiveMaxReroute) {
            // Find the clean approved transition: target is not a fixer, and no when guard
            // (or when guard passes). The clean row is the unconditional approved→next row
            // produced by buildReviewerChainTransitions / buildParallelReviewerTransitions.
            const cleanTransition = this.transitions.find(
              (t) =>
                t.step === currentStep &&
                t.on === "approved" &&
                !fixerNamesForReroute.has(t.to as string) &&
                t.to !== "end" &&
                t.to !== "escalate" &&
                (!t.when || t.when(state)),
            );
            if (cleanTransition !== undefined) {
              // T-04: Record the omission before re-routing
              const omitted = lastReviewerFixableCount(state, currentStep);
              this.events.emit("pipeline:fixer:budget-skipped", {
                step: currentStep,
                fixer: budgetSkippedFixer,
                omittedFixableFindings: omitted,
                maxIterations: effectiveMaxReroute,
              });
              state = appendHistoryEntry(state, {
                ts: new Date().toISOString(),
                step: currentStep,
                status: "warning",
                message: `${currentStep} approved: ${omitted} fixable finding(s) not applied (${budgetSkippedFixer} budget exhausted after ${effectiveMaxReroute} iterations); proceeding to ${cleanTransition.to as string}`,
              });
              logPipelineDiag("pipeline:budget-skip:reroute", `step=${currentStep}, fixer=${budgetSkippedFixer}, omitted=${omitted}, next=${cleanTransition.to as string}`);
              nextStep = cleanTransition.to;
            }
            // If no clean transition found: fall through to existing fixer exhaustion check
            // (fail-safe: escalation is better than silently skipping the omission record)
          }
        }
      }

      // --- Fresh convergence episode reset (fixer-pair loops only) ---
      // A loop step that has a dedicated fixer starts a NEW convergence episode whenever
      // it is (re-)entered from a step that is NOT its paired fixer (initial arrival,
      // conformance re-entry, resume). Reset BOTH the gate's iteration budget and its
      // fixer's iteration budget so the new episode gets a fresh maxIterations budget.
      // Loops WITHOUT a dedicated fixer (conformance) are intentionally excluded:
      // pairedFixerForNext is undefined → their lifetime counter is preserved
      // (termination guarantee for whole-phase re-execution).
      //
      // Shared-fixer forward entry: with multiple reviewers sharing one fixer, the
      // fixer's "approved" can ADVANCE the chain to the NEXT reviewer (observation-fix
      // completion). Arriving from the shared fixer is then still the START of that
      // reviewer's episode — detected by comparing the reviewer the fixer was serving
      // (resolveActiveReviewer over the fixer's siblings) with the reviewer being
      // entered. Same-reviewer fallback returns keep their counters (same episode).
      const pairedFixerForNext = this.loopNames.includes(nextStep as string)
        ? this.loopFixerPairs[nextStep as string]
        : undefined;
      if (pairedFixerForNext !== undefined) {
        let newEpisode = currentStep !== pairedFixerForNext;
        if (!newEpisode) {
          const siblings = Object.entries(this.loopFixerPairs)
            .filter(([, fixer]) => fixer === pairedFixerForNext)
            .map(([reviewer]) => reviewer);
          newEpisode = siblings.length > 1 && resolveActiveReviewer(state, siblings) !== nextStep;
        }
        if (newEpisode) {
          budget = budget.resetLoopStep(nextStep as string).resetFixerStep(pairedFixerForNext);
        }
      }

      // --- Unpaired step → fixer episode reset ---
      // When a step with no paired fixer (e.g. conformance) routes to a fixer step,
      // reset the fixer's iter counter and its paired reviewer's counter so the fixer
      // gets a fresh budget. This prevents the fixer's pre-existing budget (from its
      // previous reviewer episode) from exhausting immediately on this entry.
      if (!(currentStep in this.loopFixerPairs)) {
        const fixerNames = new Set(Object.values(this.loopFixerPairs));
        if (typeof nextStep === "string" && fixerNames.has(nextStep)) {
          const pairedReview = resolvePairedReviewForFixer(state, nextStep, this.loopFixerPairs);
          budget = budget.resetFixerStep(nextStep as string).resetLoopStep(pairedReview);
        }
      }

      // --- Check current loop step exhaustion (for loop steps without a paired fixer) ---
      // Loop steps that route to a non-loop step on needs-fix (e.g. conformance → implementer)
      // bypass the "entering next loop step" guard below: the retry path traverses other loop
      // steps (verification, code-review) whose counters reach maxIterations first.
      // Detect exhaustion immediately when the current loop step has no paired fixer.
      if (isAnyLoopStep && nextStep !== "end" && nextStep !== "escalate" && outcome !== "approved" && outcome !== "passed") {
        const pairedFixer = this.loopFixerPairs[currentStep];
        if (pairedFixer === undefined) {
          const r = await this.tryExhaust(state, deps, { iteration: budget.getLoopIter(currentStep), stepName: currentStep, phase: "review-exhausted" });
          if (r.exhausted) { state = r.state; break; }
        }
      }

      // --- Check loop exhaustion before entering next loop iteration ---
      // Check bypass: fixer has reached its max iterations → allow one more review.
      // Condition is based on fixer iteration count, not the immediately preceding step,
      // so the bypass survives intermediate deterministic steps that the transition table
      // inserts between the fixer and the review (e.g. spec-fixer → spec-review).
      // Per loop, the review is only re-entered through its paired fixer,
      // so this counter-based check is correct for any path that reaches the review.
      if (this.loopNames.includes(nextStep as string)) {
        const pairedFixer = this.loopFixerPairs[nextStep as string];
        const r = await this.tryExhaust(state, deps, { iteration: budget.getLoopIter(nextStep as string), stepName: nextStep as string, phase: "review-exhausted", bypassIteration: pairedFixer !== undefined ? budget.getFixerIter(pairedFixer) : undefined });
        if (r.exhausted) { state = r.state; break; }
      }

      // --- Check fixer exhaustion before entering fixer step ---
      // Fixer exhausted: the review that triggered this needs-fix has already used the bypass.
      // Find the paired review for this fixer to escalate properly.
      // For many-to-one (multiple reviewers sharing a fixer), use resolveActiveReviewer
      // so the exhaustion is attributed to the reviewer that actually triggered this fixer run.
      const fixerNames = new Set(Object.values(this.loopFixerPairs));
      if (fixerNames.has(nextStep as string)) {
        const exhaustedLoopName = resolvePairedReviewForFixer(state, nextStep as string, this.loopFixerPairs);
        const effectiveMax = this.resolveMaxIterations(exhaustedLoopName);
        const r = await this.tryExhaust(state, deps, { iteration: budget.getFixerIter(nextStep as string), stepName: exhaustedLoopName, phase: "review-after-final-fix", reportIteration: effectiveMax });
        if (r.exhausted) { state = r.state; break; }
      }

      // Print needs-fix transition message for loop steps
      if (isAnyLoopStep && (outcome === "needs-fix" || outcome.startsWith("needs-fix:"))) {
        this.events.emit("pipeline:iteration:verdict", { step: currentStep, iteration: loopIter, verdict: "needs-fix", action: "fixer" });
      }

      // --- Append transition history ---
      const fromMsg = budget.getPreviousLoopStep()
        ? `${budget.getPreviousLoopStep()} complete → ${nextStep} (iter ${budget.getLoopIter(this.loopName) + (nextStep === this.loopName ? 1 : 0)})`
        : `${currentStep} → ${nextStep}`;
      const transitionStore = deps.storeFactory!(state.jobId);
      state = await transitionStore.appendHistory(state, {
        ts: new Date().toISOString(),
        step: "step-transition",
        status: "ok",
        message: fromMsg,
      });

      budget = budget.withPreviousLoopStep(isLoopStep ? currentStep : "");
      currentStep = nextStep as string;
    }

    // D5 (remote-checkpoint-publish-attach-closure/design.md): single-seam awaiting-resume
    // checkpoint publisher. All controlled awaiting-resume exits (escalation / exhaustion /
    // guard halt) converge here after local persist. Publish is best-effort — commitFinalState
    // does NOT throw, so local resume possibility is never broken by a push failure.
    // The awaiting-archive publish is handled earlier (running → awaiting-archive transition);
    // that seam is intentionally NOT moved here to preserve existing test coverage.
    if (state.status === "awaiting-resume") {
      await deps.runtimeStrategy?.commitFinalState(deps, state);
    }

    // Best-effort: notify linked issue of terminal state (awaiting-resume / awaiting-archive).
    // Runs after all state transitions and persistence are complete.
    // Failures are caught inside notifyJobTerminal and logged as warnings only.
    await notifyJobTerminal(state, deps);

    return state;
  }

  /**
   * Check iteration counter against maxIterations and handle exhaustion if reached.
   *
   * Returns `{ exhausted: false, state }` in two cases:
   *   (a) iteration has not yet reached maxIterations
   *   (b) bypassIteration is provided and has reached maxIterations (fixer-final-review bypass)
   *
   * Returns `{ exhausted: true, state }` (with the post-handleExhausted state) when the
   * loop has genuinely exhausted its budget.
   */
  private async tryExhaust(
    state: JobState,
    deps: PipelineDeps,
    opts: {
      iteration: number;
      stepName: string;
      phase: "review-exhausted" | "review-after-final-fix";
      reportIteration?: number;
      bypassIteration?: number;
    },
  ): Promise<{ exhausted: boolean; state: JobState }> {
    const effectiveMax = this.resolveMaxIterations(opts.stepName);
    // Not yet exhausted
    if (opts.iteration < effectiveMax) {
      return { exhausted: false, state };
    }
    // Bypass: paired fixer has also reached max → allow one extra review
    if (opts.bypassIteration !== undefined && opts.bypassIteration >= effectiveMax) {
      return { exhausted: false, state };
    }
    // Exhausted
    const reportedIteration = opts.reportIteration ?? opts.iteration;
    logPipelineDiag("pipeline:loop:exhausted", `step=${opts.stepName}, iter=${reportedIteration}, max=${effectiveMax}`);
    this.events.emit("pipeline:iteration:exhausted", { step: opts.stepName, iteration: reportedIteration, maxIterations: effectiveMax });
    const next = await this.handleExhausted(state, deps, opts.stepName, opts.phase);
    this.printPipelineFinished(next);
    return { exhausted: true, state: next };
  }

  /** Emit the "pipeline:summary" event if summaryStep is configured and present in the pipeline. */
  private printPipelineFinished(state: JobState): void {
    if (!this.summaryStep || !this.steps.has(this.summaryStep)) return;
    const summaryStepResults = state.steps?.[this.summaryStep] ?? [];
    const finalVerdict = getLatestStepResult(state, this.summaryStep)?.verdict ?? "escalation";
    this.events.emit("pipeline:summary", { step: this.summaryStep, iterations: summaryStepResults.length, finalVerdict });
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

    // guard-halt source of truth (fail-safe / defensive hardening).
    // The primary guard is the status check inserted after firstUnitExecuted = true (above).
    // This secondary check prevents awaiting-resume from being inadvertently treated as a
    // legitimate step verdict and routed to the next step if the primary guard is ever bypassed
    // (e.g. in future refactors). NOT used to initiate awaiting-resume transitions — that is
    // owned by the escalate terminal. Does NOT share the escalate terminal to avoid
    // double transitionJob(awaiting-resume) that would clobber resumePoint/error.
    if (state.status === "awaiting-resume") {
      return "awaiting-resume";
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
    deps: PipelineDeps,
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
    const effectiveMax = this.resolveMaxIterations(exhaustedLoopName);
    const lastIteration = loopResults.length > 0
      ? (loopResults[loopResults.length - 1] as StepRun).attempt ?? effectiveMax
      : effectiveMax;
    const nnn = String(lastIteration).padStart(3, "0");

    // Lookup error shape from LOOP_ERROR_CODES (no hardcode)
    const errorShape = LOOP_ERROR_CODES[exhaustedLoopName] ?? {
      code: `${exhaustedLoopName.toUpperCase().replace(/-/g, "_")}_RETRIES_EXHAUSTED`,
      message: (n: number) => `${exhaustedLoopName} did not complete after ${n} iterations`,
      hint: (_nnn: string) => `Review the ${exhaustedLoopName} results and fix manually.`,
    };

    // Record the fixer step (not the exhausted reviewer) so resume starts at the productive
    // entry point. For loop steps without a paired fixer (e.g. conformance), fall back to self.
    const resumeStep = toStepName(this.loopFixerPairs[exhaustedLoopName] ?? exhaustedLoopName);

    const stateWithSteps = { ...state, steps: updatedSteps };
    const { state: exhaustedState } = transitionJob(stateWithSteps, "awaiting-resume", {
      trigger: "pipeline",
      reason: errorShape.message(effectiveMax),
      patch: {
        resumePoint: {
          step: resumeStep,
          reason: errorShape.message(effectiveMax),
          iterationsExhausted: effectiveMax,
          ...(exhaustionPhase && { exhaustionPhase }),
        },
        error: {
          code: errorShape.code,
          message: errorShape.message(effectiveMax),
          hint: errorShape.hint(nnn),
        },
      },
    });
    const exhaustedStore = deps.storeFactory!(exhaustedState.jobId);
    await exhaustedStore.persist(exhaustedState);
    return exhaustedState;
  }

}
