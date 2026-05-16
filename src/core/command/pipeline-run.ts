/**
 * PipelineRunCommand: CommandRunner for the `specrunner run` command.
 *
 * Design D6: prepare() creates job state and derives slug.
 * Preflight is NOT called here — CLI (run.ts) calls runPreflight() and passes
 * the result to the constructor, per spec-review finding #1.
 */
import * as path from "node:path";
import type { PreflightResult } from "../preflight.js";
import { createJobState } from "../../state/store.js";
import { logInfo, setVerbose } from "../../logger/stdout.js";
import { CommandRunner, type PrepareResult } from "./runner.js";
import type { RuntimeStrategy } from "../runtime/strategy.js";
import { getBranchPrefix } from "../../config/type-config.js";
import { STEP_NAMES } from "../step/step-names.js";

export interface PipelineRunOptions {
  cwd?: string;
  verbose?: boolean;
}

// Canonical path pattern: specrunner/requests/active/<slug>/request.md
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\/[^/]+\.md$/;

/**
 * CommandRunner for `specrunner run`.
 * prepare() creates job state and returns PrepareResult.
 * Preflight must be done by the caller before constructing this class.
 */
export class PipelineRunCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    private readonly absolutePath: string,
    private readonly preflightResult: PreflightResult,
    private readonly options: PipelineRunOptions = {},
  ) {
    super(runtime);
  }

  protected async prepare(): Promise<PrepareResult> {
    const verbose = this.options.verbose ?? false;
    setVerbose(verbose);

    const { config, request } = this.preflightResult;
    const slug = request.slug;

    logInfo(`Starting design pipeline for: ${request.title}`);

    // Derive canonical slug for state: use canonical path detection.
    // Canonical pattern: specrunner/requests/active/<slug>/request.md
    // Non-canonical (e.g. /tmp/...) → null
    const canonicalMatch = CANONICAL_PATTERN.exec(this.absolutePath);
    const requestSlug: string | null = canonicalMatch ? (canonicalMatch[1] ?? null) : null;

    // Create job state
    const cwd = this.options.cwd ?? process.cwd();
    const jobState = await createJobState({
      request: {
        path: this.absolutePath,
        title: request.title,
        type: request.type,
        slug: requestSlug,
      },
      repository: { owner: this.preflightResult.repo.owner, name: this.preflightResult.repo.name },
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
      verbose,
      workspaceOpts: {
        requestFilePath: this.absolutePath,
        branchName,
        requestType: request.type,
        baseBranch: request.baseBranch,
      },
    };
  }
}
