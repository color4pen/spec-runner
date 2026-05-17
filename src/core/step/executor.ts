import * as path from "node:path";
import { readFile } from "node:fs/promises";
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
import { transitionJob } from "../../state/lifecycle.js";
import { projectMdPath } from "../../util/paths.js";
import { gitExec, gitExecExitCode, defaultSpawnFn, type SpawnFn } from "../../util/git-exec.js";
import { noCommitDetectedError, pushFailedError } from "../../errors.js";
import { FIXER_STEP_NAMES, getPreviousSessionId } from "./fixer-helpers.js";

/**
 * StepExecutor encapsulates the I/O lifecycle for any Step.
 * Receives injected EventBus and AgentRunner (port interface).
 * Delegates all agent session logic to the runner (Design D1).
 *
 * Design D3: StepExecutor is the executor; Step is the declaration.
 * Design D5: verifyBranch / requiresCommit guard run inside the adapter (runner).
 */
export class StepExecutor {
  private readonly spawnFn: SpawnFn;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(
    private readonly events: EventBus,
    private readonly runner: AgentRunner,
    spawnFn?: SpawnFn,
    sleepFn?: (ms: number) => Promise<void>,
  ) {
    this.spawnFn = spawnFn ?? defaultSpawnFn;
    this.sleepFn = sleepFn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

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

    let projectContext: string | undefined;
    if (step.needsProjectContext === true) {
      const cwd = deps.cwd ?? process.cwd();
      const pmPath = path.join(cwd, projectMdPath());
      try {
        projectContext = await readFile(pmPath, "utf-8");
      } catch {
        // File not found — projectContext remains undefined
      }
    }

    // For fixer steps, pass the previous session ID so adapters can continue the session.
    // Non-fixer steps always get undefined (new session).
    const resumeSessionId = FIXER_STEP_NAMES.has(step.name)
      ? getPreviousSessionId(state, step.name) ?? undefined
      : undefined;

    const ctx = {
      step,
      state,
      branch: state.branch ?? "",
      slug: deps.slug,
      cwd: deps.cwd ?? process.cwd(),
      requestContent: deps.request.content,
      config: deps.config,
      dynamicContext: deps.dynamicContext,
      projectContext,
      resumeSessionId,
      emit: (event: string, payload: Record<string, unknown>) => {
        // Forward adapter events to the event bus
        this.events.emit(event as Parameters<EventBus["emit"]>[0], payload as never);
      },
    };

    // Capture HEAD SHA before agent executes (local runtime only, for self-commit detection).
    // gitExec returns null on failure (non-git dir, etc.) — safe to use without try/catch.
    let headBeforeStep: string | null = null;
    if (deps.config.runtime === "local") {
      headBeforeStep = await gitExec(this.spawnFn, deps.cwd ?? process.cwd(), ["rev-parse", "HEAD"]);
    }

    const startedAt = new Date().toISOString();
    const runResult = await this.runner.run(ctx).catch(async (thrownErr: unknown) => {
      const err = thrownErr as Error & { code?: string; hint?: string };
      const errorInfo: ErrorInfo = {
        code: err.code ?? "AGENT_STEP_FAILED",
        message: err.message,
        hint: err.hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
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

    const completedAt = new Date().toISOString();

    if (runResult.completionReason === "timeout") {
      // Poll timeout — transition to awaiting-resume (not a hard failure)
      const err = runResult.error ?? new Error(`Agent step '${step.name}' timed out`);
      const errorInfo: ErrorInfo = {
        code: (err as Error & { code?: string }).code ?? "POLL_TIMEOUT",
        message: err.message,
        hint: (err as Error & { hint?: string }).hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, { completedAt, startedAt });
      const { state: timeoutState } = transitionJob(state, "awaiting-resume", {
        trigger: "executor",
        reason: "timeout",
        patch: {
          resumePoint: { step: step.name as import("../../state/schema.js").StepName, reason: "timeout", iterationsExhausted: 0 },
          error: errorInfo,
        },
      });
      state = timeoutState;
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-timeout`,
        status: "error",
        message: `${step.name} timed out: ${errorInfo.message}`,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    if (runResult.completionReason !== "success") {
      // Agent step failed — record error and rethrow
      const err = runResult.error ?? new Error(`Agent step '${step.name}' failed`);
      const errorInfo: ErrorInfo = {
        code: (err as Error & { code?: string }).code ?? "AGENT_STEP_FAILED",
        message: err.message,
        hint: (err as Error & { hint?: string }).hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, { completedAt, startedAt });
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    // Commit and push after successful agent run (local runtime only)
    if (deps.config.runtime === "local") {
      await this.commitAndPush(step, state, deps, headBeforeStep);
    }

    return this.finalizeStep(step, state, deps, runResult.resultContent, completedAt, startedAt, {
      sessionId: runResult.sessionId,
      agentBranch: runResult.agentBranch,
      modelUsage: runResult.modelUsage,
    });
  }

  /**
   * Stage all changes, commit, and push to origin.
   *
   * Extended with HEAD comparison for agent self-commit tolerance:
   * - git add -A
   * - git diff --cached --quiet (exit 0 = no changes)
   * - if no changes and requiresCommit:
   *   - compare headBeforeStep with current HEAD
   *   - if HEAD advanced (agent self-committed): push only, log detection message
   *   - otherwise: throw noCommitDetectedError
   * - if no changes and !requiresCommit: return silently
   * - git commit -m "${step.name}: ${slug}"
   * - git push origin ${branch} — retry once after 5s on failure
   * - if second push fails: throw pushFailedError
   * - emit commit:push on success
   */
  private async commitAndPush(
    step: AgentStep,
    state: JobState,
    deps: PipelineDeps,
    headBeforeStep: string | null,
  ): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const branch = state.branch ?? "";
    const slug = deps.slug;

    // Stage all changes. If git add fails (not a git repo, exit 128, etc.), handle gracefully.
    const addExitCode = await gitExecExitCode(this.spawnFn, cwd, ["add", "-A"]);
    if (addExitCode !== 0) {
      // git is non-functional in this directory (e.g., not a git repo).
      if (step.requiresCommit) {
        throw noCommitDetectedError(step.name, branch);
      }
      return;
    }

    // Check if there are staged changes.
    // `git diff --cached --quiet` exits 0 when no staged changes, 1 when there are staged changes.
    const diffExitCode = await gitExecExitCode(this.spawnFn, cwd, ["diff", "--cached", "--quiet"]);
    const hasChanges = diffExitCode === 1;

    if (!hasChanges) {
      if (step.requiresCommit) {
        // Check if HEAD advanced (agent self-committed before pipeline commit).
        const headAfterStep = await gitExec(this.spawnFn, cwd, ["rev-parse", "HEAD"]);
        if (headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep) {
          // Agent authored commit(s) since step start — push the existing commits as-is.
          stderrWrite("Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is.\n");
          await this.pushOnly(branch, cwd, step.name);
          return;
        }
        throw noCommitDetectedError(step.name, branch);
      }
      // No changes and requiresCommit is falsy — silently skip
      return;
    }

    // Commit
    const commitMessage = `${step.name}: ${slug}`;
    await gitExec(this.spawnFn, cwd, ["commit", "-m", commitMessage]);

    // Push with one retry
    await this.pushOnly(branch, cwd, step.name);
  }

  /**
   * Push to origin with one retry on failure.
   * Emits commit:push event on success.
   * Throws pushFailedError if both attempts fail.
   */
  private async pushOnly(branch: string, cwd: string, stepName: string): Promise<void> {
    const tryPush = () => gitExecExitCode(this.spawnFn, cwd, ["push", "origin", branch]);

    const firstPushCode = await tryPush();
    if (firstPushCode === 0) {
      this.events.emit("commit:push" as Parameters<EventBus["emit"]>[0], { step: stepName, branch } as never);
      return;
    }

    // Retry after 5 seconds (injectable for testing)
    await this.sleepFn(5000);
    const secondPushCode = await tryPush();
    if (secondPushCode === 0) {
      this.events.emit("commit:push" as Parameters<EventBus["emit"]>[0], { step: stepName, branch } as never);
      return;
    }

    throw pushFailedError(stepName, branch, `exit code ${secondPushCode}`);
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

    const startedAt = new Date().toISOString();

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
        startedAt,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    const completedAt = new Date().toISOString();

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

    return this.finalizeStep(step, state, deps, fileContent, completedAt, startedAt);
  }

  /** Shared success path: parse verdict, persist result, set branch, and emit events. */
  private async finalizeStep(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    resultContent: string | null,
    completedAt: string,
    startedAt: string,
    agentResult?: {
      sessionId?: string;
      agentBranch?: string;
      modelUsage?: Record<string, ModelUsage>;
    },
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const findingsPath = step.resultFilePath(state, deps);
    let verdict: Verdict | null = null;
    let parsed: import("./types.js").ParsedStepResult | null = null;
    if (resultContent !== null) {
      parsed = step.parseResult(resultContent, deps);
      verdict = parsed.verdict;
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
      startedAt,
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
    if (parsed?.pullRequest) {
      state = { ...state, pullRequest: parsed.pullRequest };
    }
    await store.persist(state);
    return state;
  }
}
