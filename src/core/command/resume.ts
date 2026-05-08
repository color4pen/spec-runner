/**
 * ResumeCommand: CommandRunner for the `specrunner resume` command.
 *
 * Design D7: prepare() resolves job state, checks safety gates, determines
 * start step, and transitions job to "running" status.
 */
import { loadConfig } from "../../config/store.js";
import { updateJobState } from "../../state/store.js";
import { logInfo, setVerbose } from "../../logger/stdout.js";
import { SpecRunnerError } from "../../errors.js";
import type { JobState, StepName } from "../../state/schema.js";
import { parseRequestMd } from "../../parser/request-md.js";
import { resolveJobStateBySlug } from "../resume/resolve-job.js";
import { resolveResumeStep } from "../resume/resolve-step.js";
import { checkConsecutiveEscalations, checkStaleState } from "../resume/safety.js";
import { CommandRunner, type PrepareResult } from "./runner.js";
import type { RuntimeStrategy } from "../runtime/strategy.js";

export interface ResumeOptions {
  from?: string;
  force?: boolean;
  verbose?: boolean;
  cwd?: string;
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
    private readonly slug: string,
    private readonly options: ResumeOptions = {},
  ) {
    super(runtime);
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
    const verbose = this.options.verbose ?? false;
    setVerbose(verbose);
    const cwd = this.options.cwd ?? process.cwd();

    // Resolve job state by slug
    let state: JobState;
    try {
      const resolved = await resolveJobStateBySlug(this.slug);
      if (resolved === null) {
        process.stderr.write(
          `Error: No job found with slug '${this.slug}'. Run 'specrunner ps' to see available jobs.\n`,
        );
        throw new PrepareError(2, "Job not found");
      }
      state = resolved;
    } catch (err) {
      if (err instanceof PrepareError) throw err;
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      throw new PrepareError(2, "Failed to resolve job");
    }

    // Status gate: "running" is always rejected (double-execution prevention)
    if (state.status === "running") {
      process.stderr.write(
        `Error: Job '${this.slug}' is currently running. Cannot resume a running job.\n`,
      );
      throw new PrepareError(1, "Job is running");
    }

    if (state.status !== "awaiting-resume") {
      if (!this.options.force) {
        process.stderr.write(
          `Error: Job '${this.slug}' has status '${state.status}', not 'awaiting-resume'. Use --force to override.\n`,
        );
        throw new PrepareError(1, "Job not awaiting-resume");
      }
    }

    // Safety checks
    const resumePoint = state.resumePoint ?? null;
    const startStepForCheck = resumePoint?.step ?? (state.step as StepName | undefined);

    if (startStepForCheck) {
      const hasConsecutiveEscalations = checkConsecutiveEscalations(state, startStepForCheck);
      if (hasConsecutiveEscalations && !this.options.force) {
        process.stderr.write(
          `Error: Step '${startStepForCheck}' has escalated 3 consecutive times. Use --force to override.\n`,
        );
        throw new PrepareError(1, "Consecutive escalations");
      }
    }

    if (checkStaleState(state)) {
      process.stderr.write(
        `Warning: Job '${this.slug}' was last updated more than 24 hours ago. The branch may have drifted.\n`,
      );
    }

    // resumePoint guard + resume step resolution
    if (resumePoint === null && this.options.from === undefined) {
      process.stderr.write(
        `Error: 再開位置が不明です。\`--from\` で再開 step を指定してください\n`,
      );
      throw new PrepareError(1, "No resume point");
    }

    const fallbackStep = resumePoint === null ? state.step : undefined;

    let startStep: StepName;
    try {
      startStep = resolveResumeStep(this.options.from, resumePoint, fallbackStep);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      throw new PrepareError(1, "Failed to resolve resume step");
    }

    logInfo(`Resuming job '${this.slug}' from step '${startStep}'`);

    // Parse request.md before committing to "running" state
    let request;
    try {
      request = await parseRequestMd(state.request.path);
    } catch (err) {
      process.stderr.write(
        `Error: Failed to read request.md at '${state.request.path}': ${(err as Error).message}\n`,
      );
      throw new PrepareError(1, "Failed to parse request.md");
    }

    // State preparation: transition to "running"
    let updatedState: JobState = {
      ...state,
      status: "running",
      error: null,
      resumePoint: null,
      updatedAt: new Date().toISOString(),
    };

    try {
      updatedState = await updateJobState(state.jobId, () => updatedState);
    } catch (err) {
      process.stderr.write(`Error: Failed to update job state: ${(err as Error).message}\n`);
      throw new PrepareError(1, "Failed to update state");
    }

    // Load config
    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        process.stderr.write(`Error: ${err.message}\n`);
        if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
      } else {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
      }
      throw new PrepareError(1, "Failed to load config");
    }

    // repo is taken from state.repository (no git remote re-detection needed)
    const repo = {
      owner: state.repository.owner,
      name: state.repository.name,
    };

    return {
      jobState: updatedState,
      startStep,
      request,
      config,
      repo,
      slug: this.slug,
      verbose,
      workspaceOpts: {
        existingWorktreePath: updatedState.worktreePath ?? null,
        baseBranch: request.baseBranch,
      },
    };
  }
}
