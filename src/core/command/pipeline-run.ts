/**
 * PipelineRunCommand: CommandRunner for the `specrunner run` command.
 *
 * Design D6: prepare() creates job state and derives slug.
 * Preflight is NOT called here — CLI (run.ts) calls runPreflight() and passes
 * the result to the constructor, per spec-review finding #1.
 */
import type { PreflightResult } from "../preflight.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { logInfo, setLogLevel, type LogLevel } from "../../logger/stdout.js";
import { CommandRunner, type PrepareResult } from "./runner.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { EventBus } from "../event/event-bus.js";
import { getBranchPrefix } from "../../config/type-config.js";
import { STEP_NAMES } from "../step/step-names.js";
import { STANDARD_PIPELINE_ID } from "../../kernel/pipeline-ids.js";

export interface PipelineRunOptions {
  cwd?: string;
  logLevel?: LogLevel;
}

// Canonical path pattern: specrunner/drafts/<slug>/request.md
const CANONICAL_PATTERN = /^.*\/specrunner\/drafts\/([^/]+)\/request\.md$/;
// Legacy pattern: specrunner/drafts/<slug>.md (backward compatibility)
const CANONICAL_PATTERN_LEGACY = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;

/**
 * CommandRunner for `specrunner run`.
 * prepare() creates job state and returns PrepareResult.
 * Preflight must be done by the caller before constructing this class.
 */
export class PipelineRunCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    events: EventBus,
    private readonly absolutePath: string,
    private readonly preflightResult: PreflightResult,
    private readonly options: PipelineRunOptions = {},
  ) {
    super(runtime, events);
  }

  protected async prepare(): Promise<PrepareResult> {
    const logLevel = this.options.logLevel ?? "default";
    setLogLevel(logLevel);

    const { config, request } = this.preflightResult;
    const slug = request.slug;

    logInfo(`Starting design pipeline for: ${request.title}`);

    // Derive canonical slug for state: use canonical path detection.
    // New pattern: specrunner/drafts/<slug>/request.md
    // Legacy pattern: specrunner/drafts/<slug>.md
    // Non-canonical (e.g. /tmp/...) → null
    const canonicalMatch =
      CANONICAL_PATTERN.exec(this.absolutePath) ??
      CANONICAL_PATTERN_LEGACY.exec(this.absolutePath);
    const requestSlug: string | null = canonicalMatch ? (canonicalMatch[1] ?? null) : null;

    // Create job state
    const cwd = this.options.cwd ?? process.cwd();
    const jobState = await JobStateStore.create(cwd, {
      request: {
        path: this.absolutePath,
        title: request.title,
        type: request.type,
        slug: requestSlug,
      },
      repository: { owner: this.preflightResult.repo.owner, name: this.preflightResult.repo.name },
      pipelineId: STANDARD_PIPELINE_ID,
    });

    logInfo(`Job ID: ${jobState.jobId}`);

    // Compute branchName: CLI creates the branch before the agent runs
    const branchPrefix = getBranchPrefix(request.type);
    const branchName = `${branchPrefix}${slug}-${jobState.jobId.slice(0, 8)}`;

    return {
      jobState,
      startStep: STEP_NAMES.DESIGN,
      request,
      config,
      slug,
      logLevel,
      repoRoot: cwd,
      workspaceOpts: {
        requestFilePath: this.absolutePath,
        branchName,
        requestType: request.type,
        baseBranch: request.baseBranch,
      },
    };
  }
}
