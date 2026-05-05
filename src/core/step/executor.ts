import * as path from "node:path";
import type { Step, AgentStep, CliStep } from "./types.js";
import type { JobState, Verdict } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import type { AgentRunner } from "../port/agent-runner.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { pushStepResult } from "../../state/helpers.js";
import { stderrWrite } from "../../logger/stdout.js";
import {
  recordFailedStepResult,
  attachStateAndRethrow,
} from "./executor-helpers.js";
import type { ErrorInfo } from "../../state/schema.js";

/**
 * StepExecutor encapsulates the I/O lifecycle for any Step.
 * Receives injected EventBus and AgentRunner (port interface).
 * Delegates all agent session logic to the runner (Design D1).
 *
 * Design D3: StepExecutor is the executor; Step is the declaration.
 * Design D5: verifyBranch / requiresCommit guard run inside the adapter (runner).
 */
export class StepExecutor {
  constructor(
    private readonly events: EventBus,
    private readonly runner: AgentRunner,
  ) {}

  /**
   * Execute a single step, driving the full I/O lifecycle:
   * 1. emit step:start
   * 2. Delegate to CLI or Agent runner
   * 3. emit step:complete or step:error
   *
   * Error semantics: on failure, attaches `err.state` and rethrows.
   */
  async execute(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    this.events.emit("step:start", { step: step.name, state: jobState });

    try {
      const result = await this.runStepInternal(step, jobState, deps);
      this.events.emit("step:complete", { step: step.name, state: result });
      return result;
    } catch (err) {
      const errState = (err as Record<string, unknown>)["state"] as JobState | undefined;
      this.events.emit("step:error", {
        step: step.name,
        error: err as Error,
        state: errState ?? jobState,
      });
      throw err;
    }
  }

  /**
   * Internal: run the step lifecycle, returning the updated state.
   * Dispatches on step.kind — never on step name.
   *
   * kind === "cli": calls step.run(), reads resultFilePath, emits events.
   * kind === "agent": delegates to AgentRunner.run() (Design D1).
   */
  private async runStepInternal(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    if (step.kind === "cli") {
      return this.runCliStep(step, jobState, deps);
    }
    // kind === "agent" — delegate to AgentRunner port (Design D1)
    return this.runAgentStep(step, jobState, deps);
  }

  /**
   * Agent step: delegate to AgentRunner.run().
   * The adapter handles session creation, SSE/polling, verification, and result fetching.
   * Emits verdict:parsed and returns the updated state from the adapter.
   *
   * Design D1: StepExecutor calls runner.run(ctx) and processes the returned result.
   */
  private async runAgentStep(
    step: AgentStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const ctx = {
      step,
      state: jobState,
      branch: jobState.branch ?? "",
      slug: deps.slug,
      cwd: deps.cwd ?? process.cwd(),
      requestContent: deps.request.content,
      config: deps.config,
      emit: (event: string, payload: Record<string, unknown>) => {
        // Forward adapter events to the event bus
        this.events.emit(event as Parameters<EventBus["emit"]>[0], payload as never);
      },
    };

    const result = await this.runner.run(ctx);

    // Managed adapter attaches updated state as _updatedState internal extension
    // (includes full history, step result, and verdict — adapter managed state itself).
    const updatedState = (result as { _updatedState?: JobState })._updatedState;
    if (updatedState) {
      this.events.emit("verdict:parsed", {
        step: step.name,
        outcome: { verdict: updatedState.steps?.[step.name]?.at(-1)?.outcome?.verdict ?? null },
      });
      return updatedState;
    }

    // Local runtime path: adapter returned only runtime-neutral AgentRunResult fields.
    // Executor manages state persistence here (JobStateStore lifecycle).
    const store = this.getStore(jobState.jobId);
    const completedAt = new Date().toISOString();

    if (result.completionReason !== "success") {
      // Agent step failed — record error and rethrow
      const err = result.error ?? new Error(`Agent step '${step.name}' failed`);
      const errorInfo: ErrorInfo = {
        code: (err as Error & { code?: string }).code ?? "AGENT_STEP_FAILED",
        message: err.message,
        hint: (err as Error & { hint?: string }).hint ?? "",
      };
      let state = recordFailedStepResult(jobState, step.name, errorInfo, { completedAt });
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    // Local runtime: update state.branch after propose (branch is CLI-determined INPUT)
    if (step.name === "propose" && !jobState.branch) {
      const canonicalBranch = `feat/${deps.slug}`;
      jobState = { ...jobState, branch: canonicalBranch };
    }

    // Success path: parse verdict from resultContent, persist step result and history.
    const resultFilePath = step.resultFilePath(jobState, deps);
    const findingsPath = resultFilePath;

    let verdict: Verdict | null = null;
    if (result.resultContent !== null) {
      const parsed = step.parseResult(result.resultContent, deps);
      verdict = parsed.verdict;
    } else if (step.completionVerdict) {
      verdict = step.completionVerdict;
    }

    if (verdict === null) {
      stderrWrite(`Warning: Could not parse verdict from agent step '${step.name}'. Treating as escalation.`);
    }
    verdict = verdict ?? "escalation";

    this.events.emit("verdict:parsed", { step: step.name, outcome: { verdict } });

    let state = pushStepResult(jobState, step.name, {
      session: null,
      verdict: verdict as Verdict | null,
      findingsPath,
      fileContent: result.resultContent,
      completedAt,
      error: null,
    });

    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-verdict`,
      status: "ok",
      message: `${step.name} verdict: ${verdict}`,
    });

    await store.persist(state);

    return state;
  }

  /**
   * Get or create a JobStateStore for the given job ID.
   * Cached on the executor instance to avoid redundant constructions within a step.
   */
  private getStore(jobId: string): JobStateStore {
    if (!this.storeCache || this.storeCacheJobId !== jobId) {
      this.storeCache = new JobStateStore(jobId);
      this.storeCacheJobId = jobId;
    }
    return this.storeCache;
  }

  private storeCache: JobStateStore | undefined;
  private storeCacheJobId: string | undefined;

  /**
   * CLI step: runs step.run() directly (no session creation).
   * Reads the result file after run() completes and parses verdict.
   * Emits verdict:parsed with the parsed result (null → "escalation").
   */
  private async runCliStep(
    step: CliStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const store = this.getStore(jobState.jobId);
    let state = await store.update(jobState, { step: step.name });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "step-transition",
      status: "ok",
      message: `Transitioning to ${step.name} step`,
    });

    const completedAt = new Date().toISOString();

    try {
      await step.run(state, deps);
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo = {
        code: "CLI_STEP_FAILED",
        message: `${step.name} failed: ${errMsg}`,
        hint: `Check the ${step.name} output for details.`,
      };
      state = await store.fail(state, errorInfo, step.name);
      state = recordFailedStepResult(state, step.name, errorInfo, {
        completedAt,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    // Read the result file and parse verdict
    const resultFilePath = step.resultFilePath(state, deps);
    const findingsPath = resultFilePath;

    // Read the result file from disk (not GitHub — CLI steps write locally)
    let fileContent: string | null = null;
    try {
      const { readFile } = await import("node:fs/promises");
      const cwd = deps.cwd ?? process.cwd();
      fileContent = await readFile(
        path.resolve(cwd, resultFilePath),
        "utf-8",
      );
    } catch {
      // File may not exist yet — treat as null verdict
    }

    let verdict: Verdict | null = null;
    if (fileContent !== null) {
      const parsed = step.parseResult(fileContent, deps);
      verdict = parsed.verdict;
    }

    if (verdict === null) {
      stderrWrite(`Warning: Could not parse verdict from ${findingsPath}. Treating as escalation.`);
    }
    verdict = verdict ?? "escalation";

    this.events.emit("verdict:parsed", { step: step.name, outcome: { verdict } });

    state = pushStepResult(state, step.name, {
      session: null,
      verdict: verdict as Verdict | null,
      findingsPath,
      fileContent,
      completedAt,
      error: null,
    });

    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-verdict`,
      status: "ok",
      message: `${step.name} verdict: ${verdict}`,
    });

    await store.persist(state);

    return state;
  }
}
