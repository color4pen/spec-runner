import * as path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type { Step, AgentStep, CliStep } from "./types.js";
import type { JobState, Verdict, ModelUsage } from "../../state/schema.js";
import type { PipelineDeps, StoreFactory } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import type { DomainEvent } from "../event/types.js";
import type { AgentRunner } from "../port/agent-runner.js";
import type { RequiredInput } from "../port/runtime-strategy.js";
import type { JobStateStore } from "../../store/job-state-store.js";
import { pushStepResult } from "../../state/helpers.js";
import { stderrWrite, logVerbose, isLevelEnabled } from "../../logger/stdout.js";
import { getAgentLogDir } from "../../util/xdg.js";
import * as nodePath from "node:path";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import { appendInvocation } from "../usage/store.js";
import { usageJsonPath } from "../../util/paths.js";
import {
  recordFailedStepResult,
  attachStateAndRethrow,
} from "./executor-helpers.js";
import type { ErrorInfo } from "../../state/schema.js";
import { getBranchPrefix } from "../../config/type-config.js";
import { transitionJob } from "../../state/lifecycle.js";
import { projectMdPath } from "../../util/paths.js";
import { resolveStepRules } from "./rules-resolve.js";
import { buildRulesFollowUpPrompts } from "./rules-followup-prompts.js";
import { defaultSpawnFn, type SpawnFn } from "../../util/git-exec.js";
import { FIXER_STEP_NAMES, getPreviousSessionId } from "./fixer-helpers.js";
import type { CommitPushInfra } from "./commit-push.js";
import { DEFAULT_TOOL_RETRY } from "../../core/port/report-result.js";
import type { JudgeReportResult, ProducerReportResult } from "../../core/port/report-result.js";

import { JUDGE_REPORT_TOOL, CODE_REVIEW_REPORT_TOOL } from "./report-tool.js";

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
  private readonly storeFactory: StoreFactory;
  private readonly commitPushInfra: CommitPushInfra;

  constructor(
    private readonly events: EventBus,
    private readonly runner: AgentRunner,
    storeFactory: StoreFactory,
    spawnFn?: SpawnFn,
    sleepFn?: (ms: number) => Promise<void>,
  ) {
    this.storeFactory = storeFactory;
    this.spawnFn = spawnFn ?? defaultSpawnFn;
    this.sleepFn = sleepFn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.commitPushInfra = { spawnFn: this.spawnFn, sleepFn: this.sleepFn, events: this.events };
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
    logVerbose("step", "step started", { step: step.name, jobId: jobState.jobId });

    try {
      const result = await this.runStepInternal(step, jobState, deps);
      logVerbose("step", "step completed", { step: step.name, jobId: jobState.jobId });
      this.events.emit("step:complete", { step: step.name, state: result });
      return result;
    } catch (err) {
      const errState = (err as Record<string, unknown>)["state"] as JobState | undefined;
      logVerbose("step", "step error", { step: step.name, jobId: jobState.jobId, error: (err as Error).message });
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
      logPipelineDiag("executor:step:dispatch", `step=${step.name}, kind=${step.kind}`);
      return this.runCliStep(step, jobState, deps);
    }
    // kind === "agent" — delegate to AgentRunner port (Design D1)
    logPipelineDiag("executor:step:dispatch", `step=${step.name}, kind=${step.kind}`);
    return this.runAgentStep(step, jobState, deps);
  }

  /**
   * Agent step: delegate to AgentRunner.run(). Executor owns all state persistence.
   * TC-012: store.update before runner.run so `specrunner ps` shows current step.
   */
  /**
   * Pre-validate required step inputs before execution (D3, step-io-contracts).
   * Projects step.reads() → RequiredInput[] and delegates existence checks to the
   * RuntimeStrategy. Records a failed step result and rethrows (with state attached)
   * when a required input is absent.
   */
  private async validateRequiredInputs(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    store: JobStateStore,
    cwd: string,
    startedAt: string,
  ): Promise<void> {
    if (!deps.runtimeStrategy || !step.reads) return;
    const reads = step.reads(state, deps);
    const required: RequiredInput[] = reads
      .filter((r) => r.required !== false)
      .map((r) => ({ path: r.path, artifact: r.artifact ?? "file" }));
    if (required.length === 0) return;
    await deps.runtimeStrategy.validateStepInputs(required, cwd, state.branch ?? null)
      .catch(async (thrownErr: unknown) => {
        const err = thrownErr as Error & { code?: string; hint?: string };
        const errorInfo: ErrorInfo = {
          code: err.code ?? "STEP_INPUT_MISSING",
          message: err.message,
          hint: (err as { hint?: string }).hint ?? "",
        };
        let failed = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
        failed = await store.fail(failed, errorInfo, step.name);
        failed = await store.appendHistory(failed, {
          ts: new Date().toISOString(),
          step: `${step.name}-failed`,
          status: "error",
          message: `${step.name} failed: ${errorInfo.code} — ${errorInfo.message}`,
        });
        await store.persist(failed);
        attachStateAndRethrow(err, failed);
        return null as never;
      });
  }

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

    const cwd = deps.cwd ?? process.cwd();

    let projectContext: string | undefined;
    if (step.needsProjectContext === true) {
      const pmPath = path.join(cwd, projectMdPath());
      try {
        projectContext = await readFile(pmPath, "utf-8");
      } catch {
        // File not found — projectContext remains undefined
      }
    }

    // Resolve project rules for this step and build follow-up prompt list.
    const ruleContents = await resolveStepRules(step.name, cwd, {
      readdir: (dir: string) => readdir(dir),
      readFile: async (filePath: string, _enc: string): Promise<string> => readFile(filePath, "utf-8"),
    });
    const rulesPrompts = buildRulesFollowUpPrompts(ruleContents);
    const existingFollowUp = step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt;
    const allFollowUpPrompts = [
      ...(existingFollowUp ? [existingFollowUp] : []),
      ...rulesPrompts,
    ];

    // For fixer steps, pass the previous session ID so adapters can continue the session.
    // Non-fixer steps always get undefined (new session).
    const resumeSessionId = FIXER_STEP_NAMES.has(step.name)
      ? getPreviousSessionId(state, step.name) ?? undefined
      : undefined;

    // Compute session log path if debug level and repoRoot is available
    let sessionLogPath: string | undefined;
    if (isLevelEnabled("debug") && deps.repoRoot) {
      const attempt = (state.steps?.[step.name]?.length ?? 0) + 1;
      const agentLogDir = getAgentLogDir(deps.repoRoot, state.jobId);
      sessionLogPath = nodePath.join(agentLogDir, `${step.name}-${attempt}.jsonl`);
    }

    const ctx = {
      step,
      state,
      branch: state.branch ?? "",
      slug: deps.slug,
      cwd,
      requestType: deps.request.type,
      config: deps.config,
      input: {
        requestContent: deps.request.content,
        requestAdr: deps.request.adr,
        dynamicContext: deps.dynamicContext,
        projectContext,
      },
      session: {
        resumeSessionId,
        resumePrompt: deps.resumePrompt,
        logPath: sessionLogPath,
      },
      policy: {
        postWorkPrompts: allFollowUpPrompts.length > 0 ? allFollowUpPrompts : undefined,
        reportTool: step.reportTool,
        toolReportRetry: step.reportTool ? DEFAULT_TOOL_RETRY : undefined,
      },
      emit: (event: DomainEvent, payload: Record<string, unknown>) => {
        // Forward adapter events to the event bus
        this.events.emit(event, payload as never);
      },
    };

    // One-shot: 最初の agent ステップで消費し、後続ステップには引き継がない
    if (deps.resumePrompt) {
      deps.resumePrompt = undefined;
    }

    // Capture HEAD SHA before agent executes (delegated to RuntimeStrategy seam).
    // LocalRuntime: git rev-parse HEAD. ManagedRuntime / no strategy: null (safe).
    const headBeforeStep: string | null = deps.runtimeStrategy
      ? await deps.runtimeStrategy.captureHeadSha(cwd)
      : null;

    // Place step output templates in the change folder before the agent runs (delegated to RuntimeStrategy).
    await deps.runtimeStrategy?.prepareStepArtifacts(cwd, deps.slug, step.name, state);

    const startedAt = new Date().toISOString();

    // Pre-validate required step inputs (D3, step-io-contracts).
    // Runs before runner.run() so the agent session is never started on missing inputs.
    await this.validateRequiredInputs(step, state, deps, store, cwd, startedAt);

    logPipelineDiag("executor:agent:pre-run", `step=${step.name}`);
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
    logPipelineDiag("executor:agent:post-run", `step=${step.name}, reason=${runResult.completionReason}`);

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
      // T-11: Record interruption event in journal
      await store.appendInterruption({
        type: "interruption",
        reason: "timeout",
        ts: new Date().toISOString(),
      });
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

    // T-02 (outcome-cutover R3): no-tool-call → proceed instead of halt.
    // When reportTool is set but agent did not call it (toolResult === null),
    // executor proceeds to finalizeStep. Verdict is determined by step-class:
    //   judge  → "needs-fix"  (conservative; fixer loop → loop exhaustion = grounded halt)
    //   producer → completionVerdict (downstream grounded step verifies correctness)

    // Delete B-group templates and commit-push (delegated to RuntimeStrategy seam).
    // LocalRuntime: cleanupOutputTemplates() + commitAndPush(). ManagedRuntime / no strategy: no-op.
    // commitAndPush errors are recorded in state here (executor owns state), then rethrown.
    await (deps.runtimeStrategy?.finalizeStepArtifacts(step, state, deps, headBeforeStep, this.commitPushInfra) ?? Promise.resolve())
      .catch(async (thrownErr: unknown) => {
        const err = thrownErr as Error & { code?: string; hint?: string };
        const errorInfo: ErrorInfo = {
          code: err.code ?? "COMMIT_AND_PUSH_FAILED",
          message: err.message,
          hint: err.hint ?? "",
        };
        state = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
        state = await store.fail(state, errorInfo, step.name);
        await store.persist(state);
        attachStateAndRethrow(err, state);
        return null as never;
      });

    return this.finalizeStep(step, state, deps, runResult.resultContent, completedAt, startedAt, {
      sessionId: runResult.sessionId,
      agentBranch: runResult.agentBranch,
      modelUsage: runResult.modelUsage,
      toolResult: runResult.toolResult,
      followUpAttempts: runResult.followUpAttempts,
    });
  }

  /**
   * Get or create a JobStateStore for the given job ID.
   * Cached on the executor instance to avoid redundant constructions within a step.
   */
  private getStore(jobId: string): JobStateStore {
    if (!this.storeCache || this.storeCacheJobId !== jobId) {
      this.storeCache = this.storeFactory(jobId);
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

    // Pre-validate required step inputs (D3, step-io-contracts).
    await this.validateRequiredInputs(step, state, deps, store, deps.cwd ?? process.cwd(), startedAt);

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
      toolResult?: import("../port/report-result.js").BaseReportResult | null;
      followUpAttempts?: number;
    },
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const findingsPath = step.resultFilePath(state, deps);
    let verdict: Verdict | null = null;
    let parsed: import("./types.js").ParsedStepResult | null = null;

    // T-01 (outcome-cutover R3): typed outcome takes priority over prose parse.
    // Determine if this is a judge step (spec-review / code-review) by reportTool identity.
    const stepReportTool = "reportTool" in step ? step.reportTool : undefined;
    const isJudgeStep = stepReportTool === JUDGE_REPORT_TOOL || stepReportTool === CODE_REVIEW_REPORT_TOOL;

    if (agentResult !== undefined && stepReportTool !== undefined) {
      // Agent step with reportTool — use typed outcome exclusively.
      const toolResult = agentResult.toolResult;
      if (toolResult !== null && toolResult !== undefined) {
        // Non-null toolResult: derive verdict from typed fields.
        if (isJudgeStep) {
          // judge: approved true → "approved", false/undefined → "needs-fix"
          verdict = (toolResult as JudgeReportResult).approved === true ? "approved" : "needs-fix";
        } else {
          // producer: status "error" → "error", else completionVerdict (fallback "success")
          const completionVerdict =
            "completionVerdict" in step
              ? (step as { completionVerdict?: Verdict }).completionVerdict
              : undefined;
          verdict =
            (toolResult as ProducerReportResult).status === "error"
              ? "error"
              : (completionVerdict ?? "success");
        }
      } else {
        // T-02: null toolResult (no-tool-call proceed path) — step-class based fallback.
        if (isJudgeStep) {
          verdict = "needs-fix";
        } else {
          const completionVerdict =
            "completionVerdict" in step
              ? (step as { completionVerdict?: Verdict }).completionVerdict
              : undefined;
          verdict = completionVerdict ?? "success";
        }
      }
    } else {
      // Prose parse path: grounded CLI steps or agent steps without reportTool.
      if (resultContent !== null) {
        parsed = step.parseResult(resultContent, deps);
        verdict = parsed.verdict;
      } else if ("completionVerdict" in step) {
        verdict = (step as { completionVerdict?: Verdict | null }).completionVerdict ?? null;
      }
    }

    if (verdict === null) {
      stderrWrite(`Warning: Could not parse verdict from ${step.kind} step '${step.name}'. Treating as escalation.`);
    }
    verdict = verdict ?? "escalation";
    logVerbose("step", "verdict parsed", { step: step.name, verdict });
    this.events.emit("verdict:parsed", {
      step: step.name,
      outcome: {
        verdict,
        toolResult: agentResult?.toolResult ?? null,
        followUpAttempts: agentResult?.followUpAttempts ?? 0,
      },
    });
    const sessionEntry = agentResult?.sessionId
      ? { id: agentResult.sessionId, agentId: "", environmentId: "" }
      : null;
    state = pushStepResult(state, step.name, {
      session: sessionEntry,
      verdict: verdict as Verdict | null,
      findingsPath,
      completedAt,
      startedAt,
      error: null,
      toolResult: agentResult?.toolResult ?? null,
      followUpAttempts: agentResult?.followUpAttempts ?? 0,
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
    // T-10: Append per-step usage to changes/<slug>/usage.json before step commit
    if (agentResult?.modelUsage && deps.cwd && deps.slug) {
      const usageAbsPath = path.join(deps.cwd, usageJsonPath(deps.slug));
      try {
        await appendInvocation(usageAbsPath, {
          command: "job",
          timestamp: completedAt,
          modelUsage: agentResult.modelUsage,
          jobId: state.jobId,
          stepName: step.name,
        });
      } catch {
        // Best-effort: usage append failure must not block step completion
      }
    }
    await store.persist(state);
    return state;
  }
}
