import * as path from "node:path";
import type { Step, AgentStep, CliStep } from "./types.js";
import type { JobState, Verdict, ModelUsage } from "../../state/schema.js";
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
import { getBranchPrefix } from "../../config/type-config.js";

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

  /** Dispatch to CLI or Agent runner based on step.kind. Never dispatch on name. */
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
   * Agent step: delegate to AgentRunner.run(). Executor owns all state persistence.
   * TC-012: store.update before runner.run so `specrunner ps` shows current step.
   */
  private async runAgentStep(
    step: AgentStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const store = this.getStore(jobState.jobId);
    let state = await store.update(jobState, { step: step.name });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-started`,
      status: "started",
      message: `Starting ${step.name} step`,
    });

    const ctx = {
      step,
      state,
      branch: state.branch ?? "",
      slug: deps.slug,
      cwd: deps.cwd ?? process.cwd(),
      requestContent: deps.request.content,
      config: deps.config,
      dynamicContext: deps.dynamicContext,
      emit: (event: string, payload: Record<string, unknown>) => {
        // Forward adapter events to the event bus
        this.events.emit(event as Parameters<EventBus["emit"]>[0], payload as never);
      },
    };

    const completedAt = new Date().toISOString();
    const runResult = await this.runner.run(ctx).catch(async (thrownErr: unknown) => {
      const err = thrownErr as Error & { code?: string; hint?: string };
      const errorInfo: ErrorInfo = {
        code: err.code ?? "AGENT_STEP_FAILED",
        message: err.message,
        hint: err.hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, { completedAt });
      state = await store.fail(state, errorInfo, step.name);
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-failed`,
        status: "error",
        message: `${step.name} failed: ${errorInfo.code} — ${errorInfo.message}`,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
      // Never reached — attachStateAndRethrow always throws
      return null as never;
    });

    if (runResult.completionReason !== "success") {
      // Agent step failed — record error and rethrow
      const err = runResult.error ?? new Error(`Agent step '${step.name}' failed`);
      const errorInfo: ErrorInfo = {
        code: (err as Error & { code?: string }).code ?? "AGENT_STEP_FAILED",
        message: err.message,
        hint: (err as Error & { hint?: string }).hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, { completedAt });
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    return this.finalizeStep(step, state, deps, runResult.resultContent, completedAt, {
      sessionId: runResult.sessionId,
      agentBranch: runResult.agentBranch,
      modelUsage: runResult.modelUsage,
    });
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

  /** CLI step: run directly (no session), read result file, delegate to finalizeStep. */
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

    // Read the result file from disk (not GitHub — CLI steps write locally)
    const resultFilePath = step.resultFilePath(state, deps);
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

    return this.finalizeStep(step, state, deps, fileContent, completedAt);
  }

  /** Shared success path: parse verdict, persist result, set branch, and emit events. */
  private async finalizeStep(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    resultContent: string | null,
    completedAt: string,
    agentResult?: {
      sessionId?: string;
      agentBranch?: string;
      modelUsage?: Record<string, ModelUsage>;
    },
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const findingsPath = step.resultFilePath(state, deps);
    let verdict: Verdict | null = null;
    if (resultContent !== null) {
      verdict = step.parseResult(resultContent, deps).verdict;
    } else if ("completionVerdict" in step) {
      verdict = (step as { completionVerdict?: Verdict | null }).completionVerdict ?? null;
    }
    if (verdict === null) {
      stderrWrite(`Warning: Could not parse verdict from ${step.kind} step '${step.name}'. Treating as escalation.`);
    }
    verdict = verdict ?? "escalation";
    this.events.emit("verdict:parsed", { step: step.name, outcome: { verdict } });
    const sessionEntry = agentResult?.sessionId
      ? { id: agentResult.sessionId, agentId: "", environmentId: "" }
      : null;
    state = pushStepResult(state, step.name, {
      session: sessionEntry,
      verdict: verdict as Verdict | null,
      findingsPath,
      fileContent: resultContent,
      completedAt,
      error: null,
      modelUsage: agentResult?.modelUsage,
    });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-verdict`,
      status: "ok",
      message: `${step.name} verdict: ${verdict}`,
    });
    if (agentResult?.agentBranch && !state.branch) {
      state = { ...state, branch: agentResult.agentBranch };
    }
    if ("setsBranch" in step && (step as { setsBranch?: boolean }).setsBranch === true && !state.branch) {
      const prefix = getBranchPrefix(deps.request.type);
      state = { ...state, branch: `${prefix}${deps.slug}-${state.jobId.slice(0, 8)}` };
    }
    await store.persist(state);
    return state;
  }
}
