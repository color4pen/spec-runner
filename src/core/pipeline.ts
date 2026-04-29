import type Anthropic from "@anthropic-ai/sdk";
import { appendHistory, persistJobState } from "../state/store.js";
import type { JobState } from "../state/schema.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";
import { runProposeStep } from "./steps/propose.js";
import { runSpecReviewStep } from "./steps/spec-review.js";

export interface PipelineDeps {
  client: Anthropic;
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
  slug: string;
  timeoutMs?: number;
  /** Injectable sleep for testing */
  sleepFn?: (ms: number) => Promise<void>;
  /** Injectable fetch for GitHub API */
  githubFetch?: typeof fetch;
}

/**
 * Run the full pipeline: propose → spec-review.
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

  // Step 2: spec-review
  // runSpecReviewStep throws on fatal errors but attaches `state` to the error.
  // We extract the failed state from the error so we can return it to the caller.
  try {
    state = await runSpecReviewStep(state, deps);
  } catch (err) {
    // If the step attached a failed state to the error, use it.
    const errWithState = err as { state?: JobState };
    if (errWithState.state) {
      return errWithState.state;
    }
    // Fallback: return the pre-throw state (will have the step-transition history entry)
    return state;
  }

  // Check verdict — Phase 1: needs-fix / escalation stop pipeline (no further steps)
  const specReviewResult = state.steps?.["spec-review"];
  if (
    specReviewResult?.verdict === "needs-fix" ||
    specReviewResult?.verdict === "escalation"
  ) {
    // Pipeline stops here for Phase 1; future phases would continue differently
    return state;
  }

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
