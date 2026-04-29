import { appendHistory, persistJobState } from "../state/store.js";
import type { JobState } from "../state/schema.js";
import { getLatestStepResult } from "../state/helpers.js";
import { getMaxRetries } from "../config/getAgentId.js";
import { runProposeStep } from "./steps/propose.js";
import { runSpecReviewStep } from "./steps/spec-review.js";
import { runSpecFixerStep } from "./steps/spec-fixer.js";
import { runLoopUntil } from "./loop.js";
import { stdoutWrite } from "../logger/stdout.js";
import type { PipelineDeps } from "./types.js";

// Re-export PipelineDeps for backward compatibility with existing test imports
export type { PipelineDeps };

/**
 * Run the full pipeline: propose → spec-review loop (with spec-fixer on needs-fix).
 * Steps are executed sequentially; a failing step stops execution.
 * State is persisted between steps for crash resilience.
 */
export async function runPipeline(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  // Step 1: propose
  let state: JobState;
  try {
    state = await runProposeStep(jobState, deps);
  } catch (err) {
    // Propose failed — extract the failed state attached by runProposeStep.
    // (runProposeStep already persisted it; returning jobState would lose error info)
    const errWithState = err as { state?: JobState };
    if (errWithState.state) {
      return errWithState.state;
    }
    // Fallback: jobState is stale but there is nothing better to return
    return jobState;
  }

  // Persist state between steps (crash resilience)
  await persistJobState(state);

  // If propose did not succeed, skip subsequent steps
  if (state.status !== "success") {
    return state;
  }

  // Step transition: record in history
  state = await appendHistory(state, {
    ts: new Date().toISOString(),
    step: "step-transition",
    status: "ok",
    message: "propose → spec-review",
  });

  const maxIterations = getMaxRetries(deps.config);

  // Step 2+: spec-review loop (with spec-fixer on needs-fix)
  state = await runLoopUntil(state, deps, {
    loopName: "spec-review",
    maxIterations,
    body: async (s, d, iter) => {
      // iter >= 2: run spec-fixer before spec-review
      if (iter > 1) {
        // Update step tracking
        s = {
          ...s,
          step: "spec-fixer",
          updatedAt: new Date().toISOString(),
        };
        s = await appendHistory(s, {
          ts: new Date().toISOString(),
          step: "step-transition",
          status: "ok",
          message: `spec-review needs-fix → spec-fixer (iter ${iter})`,
        });
        await persistJobState(s);

        try {
          s = await runSpecFixerStep(s, d);
        } catch (err) {
          const errWithState = err as { state?: JobState };
          if (errWithState.state) {
            return errWithState.state;
          }
          return s;
        }

        if (s.status === "failed") {
          return s;
        }

        // Transition back to spec-review
        s = {
          ...s,
          step: "spec-review",
          updatedAt: new Date().toISOString(),
        };
        s = await appendHistory(s, {
          ts: new Date().toISOString(),
          step: "step-transition",
          status: "ok",
          message: `spec-fixer complete → spec-review (iter ${iter})`,
        });
        await persistJobState(s);
      }

      // Run spec-review
      try {
        s = await runSpecReviewStep(s, d);
      } catch (err) {
        const errWithState = err as { state?: JobState };
        if (errWithState.state) {
          return errWithState.state;
        }
        return s;
      }

      return s;
    },
    evaluator: (s) => {
      const last = getLatestStepResult(s, "spec-review");
      return { verdict: last?.verdict ?? "escalation" };
    },
    onExceeded: async (s) => {
      // Write escalation verdict to the last spec-review step result (immutable update).
      const specReviewResults = s.steps?.["spec-review"] ?? [];
      let updatedSteps = s.steps ?? {};
      if (specReviewResults.length > 0) {
        const lastIdx = specReviewResults.length - 1;
        const updatedResults = [
          ...specReviewResults.slice(0, lastIdx),
          { ...specReviewResults[lastIdx]!, verdict: "escalation" as const },
        ];
        updatedSteps = { ...updatedSteps, "spec-review": updatedResults };
      }
      const lastIteration = specReviewResults.length > 0
        ? specReviewResults[specReviewResults.length - 1]!.iteration
        : maxIterations;
      const nnn = String(lastIteration).padStart(3, "0");
      const updated: typeof s = {
        ...s,
        steps: updatedSteps,
        error: {
          code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
          message: `spec-review did not approve after ${maxIterations} iterations`,
          hint: `Review spec-review-result-${nnn}.md and adjust the request manually.`,
        },
        updatedAt: new Date().toISOString(),
      };
      await persistJobState(updated);
      return updated;
    },
  });

  // Final summary
  const specReviewResults = state.steps?.["spec-review"] ?? [];
  const finalVerdict = getLatestStepResult(state, "spec-review")?.verdict ?? "escalation";
  stdoutWrite(
    `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
  );

  return state;
}

/**
 * @deprecated Use runPipeline instead. Kept for backward compatibility with existing tests.
 * Runs only the propose step (single-step pipeline).
 */
export async function runProposePipeline(
  jobState: JobState,
  deps: PipelineDeps,
): Promise<JobState> {
  return runProposeStep(jobState, deps);
}
