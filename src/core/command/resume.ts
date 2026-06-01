/**
 * ResumeCommand: CommandRunner for the `specrunner resume` command.
 *
 * Design D7: prepare() resolves job state, checks safety gates, determines
 * start step, and transitions job to "running" status.
 */
import { loadConfig } from "../../config/store.js";
import { resolveRepoRoot } from "../../util/repo-root.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { logInfo, setLogLevel, logError, stderrWrite, type LogLevel } from "../../logger/stdout.js";
import { SpecRunnerError } from "../../errors.js";
import type { JobState, StepName } from "../../state/schema.js";
import { parseRequestMd } from "../../parser/request-md.js";
import { resolveJobStateBySlug } from "../resume/resolve-job.js";
import { resolveRequestPath } from "../resume/resolve-request-path.js";
import { getJobSlug } from "../../state/job-slug.js";
import { resolveResumeStep } from "../resume/resolve-step.js";
import { checkConsecutiveEscalations, checkStaleState, isStaleRunning } from "../resume/safety.js";
import { canTransition, transitionJob } from "../../state/lifecycle.js";
import { CommandRunner, type PrepareResult } from "./runner.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { EventBus } from "../event/event-bus.js";

export interface ResumeOptions {
  from?: string;
  force?: boolean;
  logLevel?: LogLevel;
  cwd?: string;
  prompt?: string;
}

/**
 * Prepare result with additional exit code info for failure cases.
 * The exitCode field is only used when prepare() "fails" in a controlled way —
 * in which case it throws with an error containing the code.
 */
class PrepareError extends Error {
  constructor(public readonly exitCode: 1 | 2, message: string) {
    super(message);
  }
}

/**
 * CommandRunner for `specrunner resume`.
 * prepare() performs all validation and state transition before the pipeline runs.
 */
export class ResumeCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    events: EventBus,
    private readonly slug: string,
    private readonly options: ResumeOptions = {},
  ) {
    super(runtime, events);
  }

  async execute(): Promise<number> {
    // Override execute() to support exit code 2 (argument error) from prepare()
    try {
      return await super.execute();
    } catch (err) {
      if (err instanceof PrepareError) {
        return err.exitCode;
      }
      throw err;
    }
  }

  protected async prepare(): Promise<PrepareResult> {
    const logLevel = this.options.logLevel ?? "default";
    setLogLevel(logLevel);
    const cwd = this.options.cwd ?? process.cwd();

    // Resolve job state by slug, with short Job ID fallback
    let state: JobState;
    try {
      const resolved = await resolveJobStateBySlug(this.slug, cwd);
      if (resolved === null) {
        // Slug not found — try resolving as short Job ID prefix
        let fullId: string;
        try {
          fullId = await JobStateStore.resolveId(cwd, this.slug);
        } catch (err) {
          if (err instanceof SpecRunnerError) {
            logError(err.message);
            if (err.hint) stderrWrite(`Hint: ${err.hint}`);
          } else {
            logError((err as Error).message);
          }
          throw new PrepareError(1, "Job not found");
        }
        state = (await new JobStateStore(fullId, cwd).load()) as JobState;
      } else {
        state = resolved;
      }
    } catch (err) {
      if (err instanceof PrepareError) throw err;
      logError((err as Error).message);
      throw new PrepareError(2, "Failed to resolve job");
    }

    // Status gate: stale detection for "running" state
    if (state.status === "running") {
      if (isStaleRunning(state)) {
        // Orphaned running state — transition to awaiting-resume and continue
        const { state: recovered } = transitionJob(state, "awaiting-resume", {
          trigger: "stale-detection",
          reason: "Process not running",
          patch: { pid: null },
        });
        await new JobStateStore(state.jobId, cwd).persist(recovered);
        state = recovered;
        stderrWrite(`Warning: Job '${this.slug}' was running but the process is no longer alive. Recovering.`);
      } else {
        logError(`Job '${this.slug}' is currently running. Cannot resume a running job.`);
        throw new PrepareError(1, "Job is running");
      }
    }

    // Status gate: reject if transition to "running" is not allowed
    if (!canTransition(state.status, "running")) {
      logError(`Job '${this.slug}' has status '${state.status}', cannot transition to 'running'.`);
      throw new PrepareError(1, `Cannot resume from status '${state.status}'`);
    }

    // Safety checks
    const resumePoint = state.resumePoint ?? null;
    const startStepForCheck = resumePoint?.step ?? (state.step as StepName | undefined);

    if (startStepForCheck) {
      const hasConsecutiveEscalations = checkConsecutiveEscalations(state, startStepForCheck);
      if (hasConsecutiveEscalations && !this.options.force) {
        logError(`Step '${startStepForCheck}' has escalated 3 consecutive times. Use --force to override.`);
        throw new PrepareError(1, "Consecutive escalations");
      }
    }

    if (checkStaleState(state)) {
      stderrWrite(`Warning: Job '${this.slug}' was last updated more than 24 hours ago. The branch may have drifted.`);
    }

    // resumePoint guard + resume step resolution
    if (resumePoint === null && this.options.from === undefined) {
      logError("再開位置が不明です。`--from` で再開 step を指定してください");
      throw new PrepareError(1, "No resume point");
    }

    const fallbackStep = resumePoint === null ? state.step : undefined;

    let startStep: StepName;
    try {
      startStep = resolveResumeStep(this.options.from, resumePoint, fallbackStep, state.steps);
    } catch (err) {
      logError((err as Error).message);
      throw new PrepareError(1, "Failed to resolve resume step");
    }

    logInfo(`Resuming job '${this.slug}' from step '${startStep}'`);

    // Parse request.md before committing to "running" state
    // resolveRequestPath handles legacy state files where request.path points to a deleted draft
    const resolvedSlug = getJobSlug(state);
    const resolvedPath = resolveRequestPath(state.request.path, resolvedSlug, state.worktreePath, cwd);
    let request;
    try {
      request = await parseRequestMd(resolvedPath);
    } catch (err) {
      logError(`Failed to read request.md at '${resolvedPath}': ${(err as Error).message}`);
      throw new PrepareError(1, "Failed to parse request.md");
    }

    // State preparation: transition to "running"
    let updatedState: JobState;
    try {
      const { state: transitioned } = transitionJob(state, "running", {
        trigger: "resume",
        reason: `Resuming from step '${startStep}'`,
        patch: { error: null, resumePoint: null, pid: process.pid },
      });
      await new JobStateStore(state.jobId, cwd).persist(transitioned);
      updatedState = transitioned;
    } catch (err) {
      logError(`Failed to update job state: ${(err as Error).message}`);
      throw new PrepareError(1, "Failed to update state");
    }

    // Load config with project local overlay (resolve repo root from cwd first)
    let config;
    try {
      const repoRoot = await resolveRepoRoot(cwd);
      config = await loadConfig(repoRoot ?? undefined);
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        logError(err.message);
        if (err.hint) stderrWrite(`Hint: ${err.hint}`);
      } else {
        logError((err as Error).message);
      }
      throw new PrepareError(1, "Failed to load config");
    }

    return {
      jobState: updatedState,
      startStep,
      request,
      config,
      slug: this.slug,
      logLevel,
      repoRoot: cwd,
      workspaceOpts: {
        existingWorktreePath: updatedState.worktreePath ?? null,
        baseBranch: request.baseBranch,
      },
      resumePrompt: this.options.prompt,
    };
  }
}
