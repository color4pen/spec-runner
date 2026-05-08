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
 *   5. runPipeline (via createStandardPipeline + pipeline.run)
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
import { logInfo, logError } from "../../logger/stdout.js";
import { SpecRunnerError } from "../../errors.js";
import type { JobState, StepName } from "../../state/schema.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { EventBus } from "../event/event-bus.js";
import { ProgressDisplay } from "../../cli/progress.js";
import { createStandardPipeline } from "../pipeline/index.js";
import type { CleanupHandle, RuntimeStrategy, WorkspaceOptions } from "../runtime/strategy.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { OriginInfo } from "../../git/remote.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import type { PipelineDeps } from "../types.js";
import { collectDynamicContext } from "../../git/dynamic-context.js";

// ---------------------------------------------------------------------------
// PrepareResult
// ---------------------------------------------------------------------------

/**
 * Result returned by prepare() — encapsulates all context needed for the
 * remaining execute() steps. verbose is used to configure ProgressDisplay.
 */
export interface PrepareResult {
  jobState: JobState;
  startStep: StepName;
  request: ParsedRequest;
  config: SpecRunnerConfig;
  repo: OriginInfo;
  slug: string;
  verbose: boolean;
  workspaceOpts: WorkspaceOptions;
}

// ---------------------------------------------------------------------------
// CommandRunner
// ---------------------------------------------------------------------------

/**
 * Abstract base class implementing the pipeline execution Template Method.
 * Concrete commands (PipelineRunCommand, ResumeCommand) override prepare() only.
 */
export abstract class CommandRunner {
  constructor(protected readonly runtime: RuntimeStrategy) {}

  /**
   * Execute the pipeline command.
   * Returns exit code (0 = success, 1 = failure).
   */
  async execute(): Promise<number> {
    // Step 1: prepare — subclass override
    // Note: re-throw any error so callers (e.g. ResumeCommand.execute) can inspect it
    const prepared = await this.prepare();

    const { jobState, startStep, request, config, repo, slug, verbose, workspaceOpts } = prepared;

    // Set up EventBus and ProgressDisplay
    const events = new EventBus();
    new ProgressDisplay(events, { verbose, slug });

    // Step 2: setupWorkspace
    let workspace;
    try {
      workspace = await this.runtime.setupWorkspace(slug, jobState.jobId, workspaceOpts);
    } catch (err) {
      process.stderr.write(`Error: Failed to set up workspace: ${(err as Error).message}\n`);
      return 1;
    }

    // Reflect worktreePath into in-memory jobState so pipeline persist does not overwrite it.
    // setupWorkspace() persists to the state store, but the in-memory object passed to
    // pipeline.run() must also carry the value — otherwise step-level persist() reverts it.
    if (workspace.worktreePath !== undefined) {
      jobState.worktreePath = workspace.worktreePath;
    }

    // Reflect branch set by setupWorkspace() into in-memory jobState (D3).
    // setupWorkspace() already persisted branch to the state store; mirror it in-memory
    // so pipeline steps see the pre-set branch and setsBranch fallback is not triggered.
    if (workspace.branch !== undefined && !jobState.branch) {
      jobState.branch = workspace.branch;
    }

    // Step 3: buildDeps
    const deps: PipelineDeps = this.runtime.buildDeps(config, repo, request, slug, workspace);

    // Step 3b: collect dynamic context and attach to deps (once per run, not per-step)
    // collectDynamicContext never throws — failures return empty fields.
    try {
      deps.dynamicContext = await collectDynamicContext(
        workspace.cwd,
        jobState.branch ?? "main",
      );
    } catch {
      // Swallow any unexpected error — pipeline must not be blocked
    }

    // Step 4: registerCleanup
    const handle: CleanupHandle = this.runtime.registerCleanup(jobState.jobId, startStep);

    // Step 5: runPipeline
    let finalState: JobState;
    try {
      const pipeline = createStandardPipeline(deps, events);
      finalState = await pipeline.run(startStep, jobState, deps);
    } catch (err) {
      outputPipelineThrowError(err, jobState.branch);
      await this.runtime.teardown(handle, "error");
      return 1;
    }

    // Step 6: handleResult (computes exit code)
    const exitCode = await handleResult(finalState, slug);

    // Step 7: teardown — pass actual final status so LocalRuntime knows whether to clean up
    await this.runtime.teardown(handle, finalState.status);

    return exitCode;
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
 */
async function handleResult(finalState: JobState, slug: string): Promise<number> {
  if (finalState.error?.code === "SPEC_REVIEW_RESULT_NOT_FOUND") {
    const branch = finalState.branch ?? "unknown";
    process.stderr.write(
      `Error: Spec-review result file not found on branch '${branch}'.\n`,
    );
    if (finalState.error.hint) {
      process.stderr.write(`Hint: ${finalState.error.hint}\n`);
    }
    return 1;
  }

  outputSpecReviewVerdict(finalState, slug);

  if (finalState.status === "awaiting-merge") {
    logInfo(`Pipeline completed; awaiting merge. Branch: ${finalState.branch}`);
    return 0;
  }

  if (finalState.status === "awaiting-resume") {
    const rp = finalState.resumePoint;
    logError(`Pipeline halted at step '${rp?.step ?? "unknown"}': ${rp?.reason ?? "escalation"}`);
    logInfo("Run 'specrunner resume' to continue from the halted step.");
    return 1;
  }

  logError(`Pipeline failed: ${finalState.error?.message ?? "unknown error"}`);
  return 1;
}

// ---------------------------------------------------------------------------
// Output helpers (moved from run.ts / resume.ts)
// ---------------------------------------------------------------------------

/**
 * Parse spec-review findings summary from spec-review-result.md content.
 * Returns findings summary or null if not available. Best-effort — never throws.
 */
export function parseSpecReviewFindingsSummary(
  content: string | undefined,
): { count: number; topFindings: string[] } | null {
  if (!content) return null;
  try {
    const tableMatch = /\| #.*\n\|[-| ]+\n((?:\|.*\n?)*)/m.exec(content);
    if (!tableMatch || !tableMatch[1]) return null;

    const rows = tableMatch[1]
      .split("\n")
      .filter((line) => line.trim().startsWith("|") && line.trim() !== "|");

    const findings = rows
      .map((row) => {
        const cells = row.split("|").filter(Boolean).map((c) => c.trim());
        return cells[4] ?? ""; // Description column
      })
      .filter(Boolean);

    return {
      count: findings.length,
      topFindings: findings.slice(0, 3),
    };
  } catch {
    return null;
  }
}

/**
 * Output spec-review verdict information to stdout.
 */
function outputSpecReviewVerdict(finalState: JobState, slug: string): void {
  const specReviewResult = getLatestStepResult(finalState, "spec-review");
  if (!specReviewResult?.verdict) return;

  const verdict = specReviewResult.verdict;
  process.stdout.write(`Spec review verdict: ${verdict}\n`);

  if (verdict === "needs-fix") {
    const findingsSummary = parseSpecReviewFindingsSummary(specReviewResult.fileContent ?? undefined);
    if (findingsSummary && findingsSummary.count > 0) {
      process.stdout.write(`Findings: ${findingsSummary.count} issue(s) found.\n`);
      for (const finding of findingsSummary.topFindings) {
        process.stdout.write(`  - ${finding}\n`);
      }
    }
    process.stdout.write(
      `Review findings at: ${specReviewResult.findingsPath ?? "openspec/changes/" + slug + "/spec-review-result.md"}\n`,
    );
  } else if (verdict === "escalation") {
    process.stdout.write(
      "Spec review requires human judgment. Check the findings file for details.\n",
    );
    if (specReviewResult.findingsPath) {
      process.stdout.write(`Findings at: ${specReviewResult.findingsPath}\n`);
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
      process.stderr.write(
        `Error: Spec-review result file not found on branch '${branch ?? "unknown"}'.\n`,
      );
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    }
  } else {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
  }
}
