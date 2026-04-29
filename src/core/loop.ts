import type { JobState } from "../state/schema.js";
import type { PipelineDeps } from "./types.js";
import { stdoutWrite } from "../logger/stdout.js";

export type LoopVerdict = "approved" | "needs-fix" | "escalation";

export interface LoopOptions {
  loopName: string;
  body: (state: JobState, deps: PipelineDeps, iter: number) => Promise<JobState>;
  evaluator: (state: JobState) => { verdict: LoopVerdict; reason?: string };
  maxIterations: number;
  onExceeded?: (state: JobState) => Promise<JobState>;
}

/**
 * Run a loop until the evaluator returns "approved" or "escalation",
 * or the maximum number of iterations is reached.
 *
 * runLoopUntil itself does NOT call writeJobState/persistJobState.
 * State persistence is the responsibility of the body (step functions).
 */
export async function runLoopUntil(
  state: JobState,
  deps: PipelineDeps,
  opts: LoopOptions,
): Promise<JobState> {
  const { loopName, body, evaluator, maxIterations, onExceeded } = opts;

  let current = state;

  for (let iter = 1; iter <= maxIterations; iter++) {
    // Log iteration start
    stdoutWrite(`[iter ${iter}/${maxIterations}] starting ${loopName}\n`);

    // Append history entry: iter started
    current = {
      ...current,
      history: [
        ...current.history,
        {
          ts: new Date().toISOString(),
          step: loopName,
          status: "started" as const,
          message: `${loopName} iteration ${iter} started`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    // Execute body
    current = await body(current, deps, iter);

    // Evaluate result
    const { verdict } = evaluator(current);

    // Map verdict to history status
    const historyStatus = verdict === "approved"
      ? ("ok" as const)
      : verdict === "escalation"
        ? ("error" as const)
        : ("warning" as const);

    // Append history entry: iter completed
    current = {
      ...current,
      history: [
        ...current.history,
        {
          ts: new Date().toISOString(),
          step: loopName,
          status: historyStatus,
          message: `${loopName} iteration ${iter} completed with verdict: ${verdict}`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    if (verdict === "approved") {
      stdoutWrite(`[iter ${iter}] ${loopName} verdict: approved → done\n`);
      return current;
    }

    if (verdict === "escalation") {
      stdoutWrite(`[iter ${iter}] ${loopName} verdict: escalation → halt\n`);
      return current;
    }

    // verdict === "needs-fix"
    if (iter < maxIterations) {
      stdoutWrite(`[iter ${iter}] ${loopName} verdict: needs-fix → spawning fixer\n`);
      // Continue to next iteration
    } else {
      // Max iterations reached
      stdoutWrite(`[iter ${iter}/${maxIterations}] retries exhausted, escalating\n`);
      if (onExceeded) {
        current = await onExceeded(current);
      }
      return current;
    }
  }

  return current;
}
