/**
 * PipelineRunCommand: CommandRunner for the `specrunner run` command.
 *
 * Design D6: prepare() creates job state and derives slug.
 * Preflight is NOT called here — CLI (run.ts) calls runPreflight() and passes
 * the result to the constructor, per spec-review finding #1.
 */
import type { PreflightResult } from "../preflight.js";
import { logInfo, setLogLevel, type LogLevel } from "../../logger/stdout.js";
import { CommandRunner, type PrepareResult } from "./runner.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { EventBus } from "../event/event-bus.js";
import { getBranchPrefix } from "../../config/type-config.js";
import { STEP_NAMES } from "../step/step-names.js";
import { STANDARD_PIPELINE_ID } from "../../kernel/pipeline-ids.js";
import { getPipelineDescriptor } from "../pipeline/registry.js";
import { assertRuntimeSupportsScope } from "../pipeline/runtime-capability-gate.js";
import { composeReviewerDescriptor } from "../pipeline/compose-reviewers.js";
import {
  validateDescriptorInputCompleteness,
  DescriptorInputCompletenessError,
  VALIDATOR_PROBE_SLUG,
} from "../pipeline/descriptor-input-completeness.js";
import { descriptorHasReviewerInsertionPoint } from "../pipeline/reviewer-capability.js";
import { loadReviewerDefinitions } from "../reviewers/load.js";
import { validateReviewerDefinitions } from "../reviewers/validate.js";
import type { ReviewerSnapshot } from "../reviewers/types.js";
import { requestMdPath } from "../../util/paths.js";
import * as fsPromises from "node:fs/promises";

export interface PipelineRunOptions {
  cwd?: string;
  logLevel?: LogLevel;
  json?: boolean;
  noWorktree?: boolean;
  /** GitHub issue number to link this job to. When set, terminal transitions write a comment. */
  issue?: number;
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

    const cwd = this.options.cwd ?? process.cwd();

    // Load and validate custom reviewer definitions BEFORE bootstrapping job.
    // Validation errors halt the pipeline before any state is created.
    const fsAdapter = {
      readdir: (dir: string) => fsPromises.readdir(dir),
      readFile: (filePath: string, encoding: string) =>
        fsPromises.readFile(filePath, encoding as "utf-8"),
    };
    const reviewerDefs = await loadReviewerDefinitions(cwd, fsAdapter);
    validateReviewerDefinitions(reviewerDefs); // throws ReviewerValidationError on violation
    const reviewers: ReviewerSnapshot[] = reviewerDefs.map(({ filename: _f, ...rest }) => rest);

    // Resolve pipeline id and run preflight capability gate BEFORE bootstrapping job.
    // Unknown id throws via getPipelineDescriptor (existing registry error).
    // Scope-declaring descriptor + incapable runtime throws UnsupportedRuntimeCapabilityError.
    // Both halt before any state is created (same position as validateReviewerDefinitions above).
    const pipelineId = request.pipeline ?? STANDARD_PIPELINE_ID;
    const descriptor = getPipelineDescriptor(pipelineId);
    assertRuntimeSupportsScope(descriptor, this.runtime);

    // Compose the actual runtime descriptor (base + custom reviewers) and validate
    // input-completeness BEFORE bootstrapping the job. This catches authoring errors
    // (e.g. producer removed from a slim pipeline while consumer still requires the output)
    // before any job state is created. Runs in the same preflight slot as
    // validateReviewerDefinitions / assertRuntimeSupportsScope.
    const composedDescriptor = composeReviewerDescriptor(descriptor, reviewers);
    // Ambient inputs must use VALIDATOR_PROBE_SLUG because the validator calls
    // step.reads/writes with internal probe deps (slug = VALIDATOR_PROBE_SLUG).
    // Using the real slug would produce path mismatches (request.md path components differ).
    const ambientInputs = [requestMdPath(VALIDATOR_PROBE_SLUG)];
    const inputViolations = validateDescriptorInputCompleteness(composedDescriptor, ambientInputs);
    if (inputViolations.length > 0) {
      const details = inputViolations
        .map((v) => `  [${v.step}] ${v.path}`)
        .join("\n");
      throw new DescriptorInputCompletenessError(
        `Pipeline "${pipelineId}" descriptor has unsatisfied required inputs:\n${details}`,
        inputViolations,
      );
    }

    // Bootstrap job state (no I/O; persistence is deferred to setupWorkspace)
    const jobState = await this.runtime.bootstrapJob(cwd, {
      request: {
        path: this.absolutePath,
        title: request.title,
        type: request.type,
        slug: requestSlug,
        baseBranch: request.baseBranch,
      },
      repository: { owner: this.preflightResult.repo.owner, name: this.preflightResult.repo.name },
      pipelineId,
    });

    // Snapshot reviewer definitions into job state only when the resolved descriptor
    // has a reviewer stage. design-only (no CONFORMANCE anchor) never reaches the reviewer
    // chain, so snapshotting there would leave a never-executed reviewer in state (INV-8).
    if (reviewers.length > 0 && descriptorHasReviewerInsertionPoint(descriptor)) {
      jobState.reviewers = reviewers;
    }

    logInfo(`Job ID: ${jobState.jobId}`);

    // Set noWorktree flag on initial state (portable — written to state.json for archive to read)
    if (this.options.noWorktree === true) {
      jobState.noWorktree = true;
    }

    // Set issueNumber on initial state so terminal notifications reach the linked issue.
    if (this.options.issue !== undefined) {
      jobState.issueNumber = this.options.issue;
    }

    // Compute branchName: CLI creates the branch before the agent runs
    const branchPrefix = getBranchPrefix(request.type);
    const branchName = `${branchPrefix}${slug}-${jobState.jobId.slice(0, 8)}`;

    return {
      jobState,
      startStep: STEP_NAMES.REQUEST_REVIEW,
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
        bootstrapState: jobState,
        noWorktree: this.options.noWorktree,
      },
      json: this.options.json ?? false,
    };
  }
}
