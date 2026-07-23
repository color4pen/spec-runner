/**
 * CommandRunner: Template Method for pipeline execution commands.
 *
 * Design D5: Abstract base class for run and resume commands.
 * Subclasses override prepare() only — all other steps are final.
 *
 * Execution sequence:
 *   1. prepare()               — subclass override (only override point)
 *   2. runtime.setupWorkspace()
 *   3. runtime.buildDeps()
 *   4. runtime.registerCleanup()
 *   5. runPipeline (via buildPipelineForJob + pipeline.run)
 *   6. handleResult()
 *   7. runtime.teardown()
 *
 * Error handling:
 *   - prepare() failure → return 1 immediately (no workspace/cleanup needed)
 *   - setupWorkspace() failure → return 1 (no cleanup handle yet)
 *   - pipeline throw → outputPipelineThrowError + teardown("error") + return 1
 *   - soft errors (awaiting-resume, failed) → teardown("error-status") + return 1
 *   - success (awaiting-merge) → teardown("awaiting-merge") + return 0
 */
import { logInfo, logError, stderrWrite, stdoutWrite, logWarn, initVerboseLog, closeVerboseLog, getVerboseLogFilePath, isLevelEnabled } from "../../logger/stdout.js";
import type { LogLevel } from "../../logger/stdout.js";
import { initPipelineLog, closePipelineLog } from "../../logger/pipeline-logger.js";
import { pruneOldLogs } from "../../logger/log-retention.js";
import { getVerboseLogDir } from "../../util/xdg.js";
import { KeepAlive } from "../lifecycle/keepalive.js";
import { createExitGuardHandler } from "../lifecycle/exit-guard.js";
import { SpecRunnerError } from "../../errors.js";
import type { JobState, StepName } from "../../state/schema.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { EventBus } from "../event/event-bus.js";
import { buildPipelineForJob } from "../pipeline/index.js";
import { scopeConfigWarningForJob } from "../pipeline/scope-warning.js";
import type { CleanupHandle, RuntimeStrategy, WorkspaceOptions } from "../port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import type { PipelineDeps } from "../types.js";
import type { ResumeContextSnapshot } from "../resume/resume-context.js";
import { collectDynamicContext } from "../../git/dynamic-context.js";
import { specReviewResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "../step/step-names.js";
import { buildRunResult, formatRunResultJson } from "./run-result.js";
import { transitionJob } from "../../state/lifecycle.js";

// ---------------------------------------------------------------------------
// PrepareResult
// ---------------------------------------------------------------------------

/**
 * Result returned by prepare() — encapsulates all context needed for the
 * remaining execute() steps. logLevel is used to configure ProgressDisplay.
 */
export interface PrepareResult {
  jobState: JobState;
  startStep: StepName;
  request: ParsedRequest;
  config: SpecRunnerConfig;
  slug: string;
  logLevel: LogLevel;
  workspaceOpts: WorkspaceOptions;
  /** Absolute path to the git repository root. Used for job state and verbose log paths. */
  repoRoot: string;
  /** resume 時に注入する追加プロンプト。ResumeCommand のみが設定する。 */
  resumePrompt?: string;
  /** resumePoint snapshot captured before ResumeCommand clears live state.resumePoint. */
  resumeContext?: ResumeContextSnapshot;
  /** --json flag: when true, emit terminal contract JSON to stdout. */
  json?: boolean;
}

// ---------------------------------------------------------------------------
// CommandRunner
// ---------------------------------------------------------------------------

/**
 * Abstract base class implementing the pipeline execution Template Method.
 * Concrete commands (PipelineRunCommand, ResumeCommand) override prepare() only.
 */
export abstract class CommandRunner {
  constructor(
    protected readonly runtime: RuntimeStrategy,
    protected readonly events: EventBus,
  ) {}

  /**
   * Execute the pipeline command.
   * Returns exit code (0 = success, 1 = failure).
   */
  async execute(): Promise<number> {
    // Step 0: provider readiness gate — must fire before prepare() so that readiness
    // failures surface prior to any persistent side effects (job record / worktree /
    // branch / journal). Uses optional call (`?.`) so test fakes without the method
    // are unaffected (backward-compatible with RuntimeStrategy-typed fakes).
    if (this.runtime.assertProviderReadiness) {
      try {
        await this.runtime.assertProviderReadiness(process.env as Record<string, string | undefined>);
      } catch (err) {
        if (err instanceof SpecRunnerError) {
          logError(err.message);
          if (err.hint) {
            stderrWrite(`Hint: ${err.hint}`);
          }
        } else {
          logError((err as Error).message ?? String(err));
        }
        // Do NOT emit RunResultContract JSON here — no job exists yet.
        return 1;
      }
    }

    // Step 1: prepare — subclass override
    // Note: re-throw any error so callers (e.g. ResumeCommand.execute) can inspect it
    const prepared = await this.prepare();

    const { startStep, request, config, slug, workspaceOpts, repoRoot } = prepared;
    let { jobState } = prepared;
    const json = prepared.json ?? false;

    // Register per-job exit guard so that beforeExit writes awaiting-resume to slug-based state.
    process.on("beforeExit", createExitGuardHandler(repoRoot, jobState.jobId, {
      noWorktree: workspaceOpts.noWorktree,
      slug,
    }));

    // Prune old logs before initializing pipeline log (run 開始時 retention チェック)
    try {
      const logsDir = getVerboseLogDir(repoRoot);
      await pruneOldLogs(logsDir, config.logs?.maxJobs ?? 20);
    } catch (err) {
      logWarn(`Failed to prune old logs: ${(err as Error).message}`);
    }

    // Initialize pipeline log (always, regardless of log level).
    const pipelineLogger = initPipelineLog(repoRoot, jobState.jobId);
    pipelineLogger.subscribe(this.events);

    // Initialize verbose log file (no-op if level < verbose)
    if (isLevelEnabled("verbose")) {
      initVerboseLog(repoRoot, jobState.jobId);
    }

    // Keep the event loop alive for the duration of the pipeline execution.
    const keepAlive = new KeepAlive();
    keepAlive.acquire();

    try {
      // Step 2: setupWorkspace
      let workspace;
      try {
        workspace = await this.runtime.setupWorkspace(slug, jobState.jobId, workspaceOpts);
      } catch (err) {
        const wsError = { code: "WORKSPACE_SETUP_FAILED", message: (err as Error).message, hint: "" };
        const { state: wsFailedState } = transitionJob(jobState, "failed", {
          trigger: "store-fail",
          reason: wsError.message,
          patch: { error: wsError, step: "init" },
        });
        await this.runtime.persistJobState(jobState.jobId, slug, null, wsFailedState);
        logError(`Failed to set up workspace: ${(err as Error).message}`);
        if (json) {
          stdoutWrite(formatRunResultJson(buildRunResult(wsFailedState, slug)));
        }
        closeVerboseLog();
        closePipelineLog();
        return 1;
      }

      // Reload in-memory state from slug store so pipeline receives all fields written
      // by setupWorkspace() (worktreePath, synthesizedCommits, branch). Deletes the
      // former manual mirror — the store is the single source of truth post-setup.
      // Skip reload on the resume path (existingWorktreePath !== undefined): the
      // resume prepare() already loaded the full state, and setupWorkspace() in the
      // resume/recreate branch does not write synthesizedCommits to the store.
      if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined) {
        try {
          jobState = await this.runtime.reloadJobState(jobState.jobId, slug, workspace);
        } catch (err) {
          // fail-closed: reload failure prevents pipeline start
          const reloadError = { code: "RELOAD_FAILED", message: (err as Error).message, hint: "" };
          const { state: reloadFailedState } = transitionJob(jobState, "failed", {
            trigger: "store-fail",
            reason: reloadError.message,
            patch: { error: reloadError, step: "init" },
          });
          await this.runtime.persistJobState(jobState.jobId, slug, workspace, reloadFailedState);
          logError(`Failed to reload job state after workspace setup: ${(err as Error).message}`);
          if (json) {
            stdoutWrite(formatRunResultJson(buildRunResult(reloadFailedState, slug)));
          }
          closeVerboseLog();
          closePipelineLog();
          return 1;
        }
      }

      // Step 3: buildDeps
      let deps: PipelineDeps;
      // Step 4: registerCleanup
      let handle: CleanupHandle;
      try {
        deps = this.runtime.buildDeps(config, request, slug, workspace) as PipelineDeps;

        // Step 3c: propagate resumePrompt from prepare() into deps (one-shot injection)
        if (prepared.resumePrompt) {
          deps.resumePrompt = prepared.resumePrompt;
        }
        if (prepared.resumeContext) {
          deps.resumeContext = prepared.resumeContext;
        }

        // Step 3b: collect dynamic context and attach to deps (once per run, not per-step)
        // collectDynamicContext never throws — failures return empty fields.
        try {
          deps.dynamicContext = await collectDynamicContext(
            workspace.cwd,
            request.baseBranch,
          );
        } catch {
          // Swallow any unexpected error — pipeline must not be blocked
        }

        handle = this.runtime.registerCleanup(jobState.jobId, startStep);
      } catch (err) {
        const initError = { code: "INIT_FAILED", message: (err as Error).message, hint: "" };
        const { state: initFailedState } = transitionJob(jobState, "failed", {
          trigger: "store-fail",
          reason: initError.message,
          patch: { error: initError, step: "init" },
        });
        await this.runtime.persistJobState(jobState.jobId, slug, workspace ?? null, initFailedState);
        logError((err as Error).message);
        if (json) {
          stdoutWrite(formatRunResultJson(buildRunResult(initFailedState, slug)));
        }
        closeVerboseLog();
        closePipelineLog();
        return 1;
      }

      // Step 5: runPipeline
      // Emit scope-config warning once per run, before buildPipelineForJob is called.
      const scopeWarning = scopeConfigWarningForJob(jobState, config);
      if (scopeWarning !== null) {
        logWarn(scopeWarning);
      }

      let finalState: JobState;
      try {
        const pipeline = buildPipelineForJob(jobState, deps, this.events);
        finalState = await pipeline.run(startStep, jobState, deps);
      } catch (err) {
        // Defensive: if pipeline safety net did not transition state, mark as failed
        const crashCode = err instanceof SpecRunnerError ? err.code : "PIPELINE_UNHANDLED_ERROR";
        const crashMessage = (err as Error).message;
        const crashErrorInfo = { code: crashCode, message: crashMessage, hint: "" };
        let crashState: JobState | null = null;
        try {
          const store = deps.storeFactory(jobState.jobId);
          const diskState = await store.load();
          if (diskState.status === "running") {
            crashState = await store.fail(diskState as JobState, crashErrorInfo, jobState.step);
          } else {
            crashState = diskState as JobState;
          }
        } catch {
          // Disk state unavailable: derive failed state via lifecycle transition (no direct assignment)
          const { state: inMemFailed } = transitionJob(jobState, "failed", {
            trigger: "runner",
            reason: crashMessage,
            patch: { error: crashErrorInfo },
          });
          crashState = inMemFailed;
        }
        outputPipelineThrowError(err, jobState.branch);
        if (json && crashState !== null) {
          stdoutWrite(formatRunResultJson(buildRunResult(crashState, slug)));
        }
        await this.runtime.teardown(handle, "error");
        closeVerboseLog();
        closePipelineLog();
        return 1;
      }

      // Step 6: handleResult (computes exit code)
      const exitCode = await handleResult(finalState, slug, json);

      // Display verbose log path if active
      const logPath = getVerboseLogFilePath();
      if (logPath) {
        logInfo(`Verbose log: ${logPath}`);
      }

      // Step 7: teardown — pass actual final status so LocalRuntime knows whether to clean up
      await this.runtime.teardown(handle, finalState.status);

      closeVerboseLog();
      closePipelineLog();
      return exitCode;
    } finally {
      keepAlive.release();
    }
  }

  /**
   * Subclass-defined preparation: job resolution, config loading, slug derivation, etc.
   * Return PrepareResult or throw to abort execution with exit code 1.
   */
  protected abstract prepare(): Promise<PrepareResult>;
}

// ---------------------------------------------------------------------------
// handleResult (module-level — used by CommandRunner only)
// ---------------------------------------------------------------------------

/**
 * Handle post-pipeline state: check soft-errors, output verdict, compute exit code.
 * Does NOT call teardown — that is always done by execute() after this returns.
 *
 * When json=true, emits a RunResultContract JSON to stdout before human-readable output.
 * SPEC_REVIEW_RESULT_NOT_FOUND is treated as a hard failure for JSON output even though
 * the pipeline may have set state.status to "awaiting-resume".
 */
async function handleResult(finalState: JobState, slug: string, json: boolean): Promise<number> {
  if (json) {
    stdoutWrite(formatRunResultJson(buildRunResult(finalState, slug)));
  }

  if (finalState.error?.code === "SPEC_REVIEW_RESULT_NOT_FOUND") {
    const branch = finalState.branch ?? "unknown";
    logError(`Spec-review result file not found on branch '${branch}'.`);
    if (finalState.error.hint) {
      stderrWrite(`Hint: ${finalState.error.hint}`);
    }
    return 1;
  }

  outputSpecReviewVerdict(finalState, slug);

  if (finalState.status === "awaiting-archive") {
    if (finalState.pullRequest?.url) {
      logInfo(`PR: ${finalState.pullRequest.url}`);
    }
    logInfo(`Pipeline completed; awaiting archive. Branch: ${finalState.branch}`);
    return 0;
  }

  if (finalState.status === "awaiting-resume") {
    const rp = finalState.resumePoint;
    const drift = finalState.mainCheckoutDrift;
    if (drift) {
      logError(`Pipeline halted: main checkout write detected during step '${rp?.step ?? "unknown"}'`);
      logError(`Detected changes to guarded paths in main checkout:`);
      for (const c of drift.changes) {
        logError(`  ${c.kind}: ${c.path}`);
      }
      logError(`This may be a legitimate parallel edit by the operator, or an agent escape-write.`);
      logInfo(`Verify the changes above, then run 'specrunner job resume ${slug}' to continue.`);
    } else {
      logError(`Pipeline halted at step '${rp?.step ?? "unknown"}': ${rp?.reason ?? "escalation"}`);
      logInfo("Run 'specrunner resume' to continue from the halted step.");
    }
    return 1;
  }

  logError(`Pipeline failed: ${finalState.error?.message ?? "unknown error"}`);
  return 1;
}

// ---------------------------------------------------------------------------
// Output helpers (moved from run.ts / resume.ts)
// ---------------------------------------------------------------------------


/**
 * Output spec-review verdict information to stderr (diagnostic info).
 */
function outputSpecReviewVerdict(finalState: JobState, slug: string): void {
  const specReviewResult = getLatestStepResult(finalState, STEP_NAMES.SPEC_REVIEW);
  if (!specReviewResult?.verdict) return;

  const verdict = specReviewResult.verdict;
  stderrWrite(`Spec review verdict: ${verdict}`);

  if (verdict === "needs-fix") {
    stderrWrite(`Review findings at: ${specReviewResult.findingsPath ?? specReviewResultPath(slug, 1)}`);
  } else if (verdict === "escalation") {
    stderrWrite("Spec review requires human judgment. Check the findings file for details.");
    if (specReviewResult.findingsPath) {
      stderrWrite(`Findings at: ${specReviewResult.findingsPath}`);
    }
  }
}

/**
 * Output error from a thrown pipeline exception to stderr.
 * Exported for use in CLI files and tests.
 */
export function outputPipelineThrowError(err: unknown, branch?: string | null): void {
  if (err instanceof SpecRunnerError) {
    if (err.code === "SPEC_REVIEW_RESULT_NOT_FOUND") {
      logError(`Spec-review result file not found on branch '${branch ?? "unknown"}'.`);
      if (err.hint) stderrWrite(`Hint: ${err.hint}`);
    } else {
      logError(err.message);
      if (err.hint) stderrWrite(`Hint: ${err.hint}`);
    }
  } else {
    logError((err as Error).message);
  }
}
