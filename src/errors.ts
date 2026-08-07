
/** CLI exit code constants. */
export const EXIT_CODE = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  ARG_ERROR: 2,
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

/**
 * Declarative mapping from error code to exit code.
 * Error codes not listed here default to GENERAL_ERROR (1).
 *
 * Exit 2 (ARG_ERROR) covers setup/prerequisite failures in addition to
 * strictly syntactic argument errors — these are errors where the user
 * must fix their environment or invocation before re-running.
 */
const EXIT_CODE_MAP: Record<string, ExitCode> = {
  CONFIG_MISSING: EXIT_CODE.ARG_ERROR,
  CONFIG_INCOMPLETE: EXIT_CODE.ARG_ERROR,
  CONFIG_INVALID: EXIT_CODE.ARG_ERROR,
  REQUEST_MD_INVALID: EXIT_CODE.ARG_ERROR,
  NOT_GIT_REPO: EXIT_CODE.ARG_ERROR,
  REMOTE_NOT_GITHUB: EXIT_CODE.ARG_ERROR,
  WORKTREE_GUARD: EXIT_CODE.ARG_ERROR,
  SYMLINK_REJECTED: EXIT_CODE.ARG_ERROR,
  DESIGN_LAYER_CHECK_FAILED: EXIT_CODE.ARG_ERROR,
  SLUG_OCCUPIED: EXIT_CODE.ARG_ERROR,
  SLUG_STATE_UNREADABLE: EXIT_CODE.ARG_ERROR,
};

/**
 * Named error class for specrunner CLI.
 * Each error carries a machine-readable code and a human-readable hint for the user.
 * The exitCode is derived declaratively from EXIT_CODE_MAP unless overridden.
 */
export class SpecRunnerError extends Error {
  public readonly exitCode: ExitCode;

  constructor(
    public readonly code: string,
    public readonly hint: string,
    message: string,
    exitCode?: ExitCode,
  ) {
    super(message);
    this.name = "SpecRunnerError";
    this.exitCode = exitCode ?? EXIT_CODE_MAP[code] ?? EXIT_CODE.GENERAL_ERROR;
  }
}

/**
 * SlugOccupiedError: structured error that exposes the prior occupant's
 * jobId and status as typed fields so callers (inbox, tests) can dedup
 * without parsing the message string.
 */
export class SlugOccupiedError extends SpecRunnerError {
  public readonly priorJobId: string;
  public readonly priorStatus: string;

  constructor(
    code: string,
    hint: string,
    message: string,
    priorJobId: string,
    priorStatus: string,
    exitCode?: ExitCode,
  ) {
    super(code, hint, message, exitCode);
    this.name = "SlugOccupiedError";
    this.priorJobId = priorJobId;
    this.priorStatus = priorStatus;
  }
}

/** Known error codes */
export const ERROR_CODES = {
  CONFIG_MISSING: "CONFIG_MISSING",
  CONFIG_INCOMPLETE: "CONFIG_INCOMPLETE",
  CONFIG_INVALID: "CONFIG_INVALID",
  GITHUB_TOKEN_EXPIRED: "GITHUB_TOKEN_EXPIRED",
  GITHUB_API_ERROR: "GITHUB_API_ERROR",
  NOT_GIT_REPO: "NOT_GIT_REPO",
  REMOTE_NOT_GITHUB: "REMOTE_NOT_GITHUB",
  REQUEST_MD_INVALID: "REQUEST_MD_INVALID",
  SESSION_TERMINATED: "SESSION_TERMINATED",
  BRANCH_NOT_REGISTERED: "BRANCH_NOT_REGISTERED",
  STATE_FILE_INVALID: "STATE_FILE_INVALID",
  CHANGE_FOLDER_NOT_FOUND: "CHANGE_FOLDER_NOT_FOUND",
  SESSION_CREATE_FAILED: "SESSION_CREATE_FAILED",
  SPEC_REVIEW_RESULT_NOT_FOUND: "SPEC_REVIEW_RESULT_NOT_FOUND",
  CODE_REVIEW_RESULT_NOT_FOUND: "CODE_REVIEW_RESULT_NOT_FOUND",
  SPEC_REVIEW_RETRIES_EXHAUSTED: "SPEC_REVIEW_RETRIES_EXHAUSTED",
  BRANCH_NOT_SET: "BRANCH_NOT_SET",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  JOB_NOT_FINISHABLE: "JOB_NOT_FINISHABLE",
  GIT_SUBPROCESS_FAILED: "GIT_SUBPROCESS_FAILED",
  PUSH_FAILED: "PUSH_FAILED",
  WORKTREE_GUARD: "WORKTREE_GUARD",
  AMBIGUOUS_JOB_ID: "AMBIGUOUS_JOB_ID",
  POLL_TIMEOUT: "POLL_TIMEOUT",
  SESSION_RETRIES_EXHAUSTED: "SESSION_RETRIES_EXHAUSTED",
  SESSION_REQUIRES_ACTION: "SESSION_REQUIRES_ACTION",
  SESSION_RESCHEDULING_EXHAUSTED: "SESSION_RESCHEDULING_EXHAUSTED",
  RUNTIME_PREREQ_MISSING: "RUNTIME_PREREQ_MISSING",
  PROVIDER_SDK_MISSING: "PROVIDER_SDK_MISSING",
  GITHUB_TOKEN_MISSING: "GITHUB_TOKEN_MISSING",
  ANTHROPIC_KEY_MISSING: "ANTHROPIC_KEY_MISSING",
  QUERY_ONE_SHOT_FAILED: "QUERY_ONE_SHOT_FAILED",
  QUERY_ONE_SHOT_TIMEOUT: "QUERY_ONE_SHOT_TIMEOUT",
  USER_CANCELED: "USER_CANCELED",
  SYMLINK_REJECTED: "SYMLINK_REJECTED",
  STEP_INPUT_MISSING: "STEP_INPUT_MISSING",
  STEP_OUTPUT_MISSING: "STEP_OUTPUT_MISSING",
  WORKTREE_DIRTY: "WORKTREE_DIRTY",
  ENVIRONMENT_NOT_SET: "ENVIRONMENT_NOT_SET",
  DESIGN_LAYER_CHECK_FAILED: "DESIGN_LAYER_CHECK_FAILED",
  JOURNAL_CORRUPTED: "JOURNAL_CORRUPTED",
  COMMIT_AND_PUSH_FAILED: "COMMIT_AND_PUSH_FAILED",
  CHECKPOINT_NOT_FOUND: "CHECKPOINT_NOT_FOUND",
  CHECKPOINT_NOT_ATTACHABLE: "CHECKPOINT_NOT_ATTACHABLE",
  ATTACH_FETCH_FAILED: "ATTACH_FETCH_FAILED",
  ATTACH_RUNTIME_UNSUPPORTED: "ATTACH_RUNTIME_UNSUPPORTED",
  PROVIDER_NOT_READY: "PROVIDER_NOT_READY",
  WRITE_SCOPE_VIOLATION: "WRITE_SCOPE_VIOLATION",
  STAGING_LIMIT_EXCEEDED: "STAGING_LIMIT_EXCEEDED",
  STAGED_BYTES_LIMIT_EXCEEDED: "STAGED_BYTES_LIMIT_EXCEEDED",
  EGRESS_UNKNOWN_COMMIT: "EGRESS_UNKNOWN_COMMIT",
  ROUND_HEAD_ADVANCED: "ROUND_HEAD_ADVANCED",
  SLUG_OCCUPIED: "SLUG_OCCUPIED",
  SLUG_STATE_UNREADABLE: "SLUG_STATE_UNREADABLE",
  SLUG_OCCUPANCY_AMBIGUOUS: "SLUG_OCCUPANCY_AMBIGUOUS",
  /**
   * Entrance fidelity gate: issue requirements not present in request requirements
   * or scope-out declarations (undeclared drop). Job is halted as awaiting-resume.
   * Operator must restore requirements or add scope-out declarations before resuming.
   */
  ISSUE_FIDELITY_UNDECLARED_DROP: "ISSUE_FIDELITY_UNDECLARED_DROP",
  /**
   * Entrance fidelity gate: failed to fetch the linked GitHub issue
   * (network error / 404 / 401). Gate is fail-closed — halt instead of pass.
   */
  ISSUE_FETCH_FAILED: "ISSUE_FETCH_FAILED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Factory helpers for well-known errors */
export function configMissingError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CONFIG_MISSING,
    "Run specrunner init first.",
    "Config file not found.",
  );
}

export function configIncompleteError(field: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CONFIG_INCOMPLETE,
    "Run specrunner login first.",
    `Missing required config field: ${field}.`,
  );
}

export function githubTokenExpiredError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.GITHUB_TOKEN_EXPIRED,
    "Run specrunner login to refresh.",
    "GitHub token expired.",
  );
}

export function githubApiError(status: number, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.GITHUB_API_ERROR,
    "Retry after a moment; if it persists, check GitHub status.",
    `GitHub API error (status ${status}): ${detail}`,
  );
}

export function notGitRepoError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.NOT_GIT_REPO,
    "cd into a git repository before running specrunner.",
    "Not a git repository.",
  );
}

export function originNotConfiguredError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.NOT_GIT_REPO,
    "Run 'git remote add origin <url>' to configure the origin remote.",
    "Origin remote not configured.",
  );
}

export function remoteNotGitHubError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.REMOTE_NOT_GITHUB,
    "'origin' must point to github.com.",
    "'origin' must point to github.com.",
  );
}

export function requestMdInvalidError(detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.REQUEST_MD_INVALID,
    `Check the YAML front-matter in the request.md file.`,
    detail,
  );
}

export function sessionTerminatedError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SESSION_TERMINATED,
    "The session was terminated by Anthropic.",
    "Session terminated.",
  );
}

export function changeFolderNotFoundError(slug: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CHANGE_FOLDER_NOT_FOUND,
    "Ensure the change folder exists in the repository.",
    `Change folder not found for slug: ${slug}`,
  );
}

export function branchNotSetError(stepName: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.BRANCH_NOT_SET,
    "Verify that design ran successfully and called register_branch before this step.",
    `state.branch is not set when entering '${stepName}'.`,
  );
}

export function environmentNotSetError(stepName: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.ENVIRONMENT_NOT_SET,
    "Run specrunner runtime setup to configure the managed runtime.",
    `Managed environment is not configured when entering '${stepName}'.`,
  );
}

export function pushFailedError(stepName: string, branch: string, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.PUSH_FAILED,
    `Check network connectivity and remote permissions. Retry with specrunner job resume to continue.`,
    `${stepName}: git push origin ${branch} failed after retry: ${detail}`,
  );
}

export function worktreeGuardError(command: string, mainPath: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.WORKTREE_GUARD,
    `Run from the main worktree: cd ${mainPath}`,
    "This command cannot be run from inside a worktree.",
  );
}

export function ambiguousJobIdError(prefix: string, matchingJobIds: string[]): SpecRunnerError {
  const candidates = matchingJobIds.join("\n  ");
  return new SpecRunnerError(
    ERROR_CODES.AMBIGUOUS_JOB_ID,
    `Matching job IDs:\n  ${candidates}`,
    `Ambiguous job ID prefix '${prefix}' matches ${matchingJobIds.length} jobs. Use a longer prefix or the full UUID.`,
  );
}

/**
 * Generic factory for result-file-not-found errors.
 * Derives the error code from stepName:
 *   "spec-review" → SPEC_REVIEW_RESULT_NOT_FOUND
 *   "code-review" → CODE_REVIEW_RESULT_NOT_FOUND
 *   (any step)    → <STEP_UPPER>_RESULT_NOT_FOUND
 *
 * resultPath is the already-computed path from step.resultFilePath().
 */
export function resultFileNotFoundError(
  stepName: string,
  resultPath: string,
  branch: string,
): SpecRunnerError {
  const code = `${stepName.toUpperCase().replace(/-/g, "_")}_RESULT_NOT_FOUND`;
  return new SpecRunnerError(
    code,
    `Ensure the ${stepName} agent wrote the result file to ${resultPath} on branch '${branch}'. ` +
    `If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors.`,
    `${stepName} result file not found on branch '${branch}'.`,
  );
}

export function pollTimeoutError(sessionId: string, elapsedMs: number): SpecRunnerError {
  const elapsedSec = Math.round(elapsedMs / 1000);
  return new SpecRunnerError(
    ERROR_CODES.POLL_TIMEOUT,
    "Session may still be running on Anthropic side. Use specrunner job resume to retry or 'specrunner job cancel <jobId>' to abort.",
    `Session '${sessionId}' did not complete within ${elapsedSec}s (${elapsedMs}ms).`,
  );
}

export function sessionRetriesExhaustedError(sessionId: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SESSION_RETRIES_EXHAUSTED,
    "The SDK exhausted its retry budget. Check session logs on the Anthropic dashboard.",
    `Session ${sessionId} ended with retries_exhausted.`,
  );
}

export function sessionRequiresActionError(sessionId: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SESSION_REQUIRES_ACTION,
    "The session requires user action that spec-runner does not support. Check session logs on the Anthropic dashboard.",
    `Session ${sessionId} is idle with requires_action (unexpected in spec-runner).`,
  );
}

export function sessionReschedulingExhaustedError(sessionId: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SESSION_RESCHEDULING_EXHAUSTED,
    "The session has been rescheduling too many times. This indicates a persistent infrastructure issue.",
    `Session ${sessionId} exceeded rescheduling limit.`,
  );
}

export function worktreeDirtyError(detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.WORKTREE_DIRTY,
    "--no-worktree requires a clean working tree. Commit or stash your changes, then retry.",
    `Working tree is dirty: ${detail}`,
  );
}

export function journalCorruptedError(eventsPath: string, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.JOURNAL_CORRUPTED,
    `The event journal (events.jsonl) is the append-only source of truth and must not be ` +
    `hand-edited or truncated. Restore it from git history (e.g. ` +
    `\`git restore --source=<good-ref> -- ${eventsPath}\`) before re-running.`,
    `Event journal integrity check failed at ${eventsPath}: ${detail}`,
  );
}

export function checkpointNotFoundError(branch: string, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CHECKPOINT_NOT_FOUND,
    `Verify that '${branch}' has exactly one active change folder with state.json (not archived or canceled).`,
    `Checkpoint not found on branch '${branch}': ${detail}`,
  );
}

export function checkpointNotAttachableError(reason: string, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE,
    `Reason: ${reason}. Ensure the remote checkpoint is quiescent (awaiting-resume), self-consistent, and matches this repository.`,
    `Checkpoint is not attachable: ${detail}`,
  );
}

export function attachFetchFailedError(branch: string, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.ATTACH_FETCH_FAILED,
    `Check network connectivity, authentication, and that branch '${branch}' exists on origin.`,
    `git fetch origin ${branch} failed: ${detail}`,
  );
}

export function attachRuntimeUnsupportedError(runtime: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.ATTACH_RUNTIME_UNSUPPORTED,
    `'job attach' is only supported for local runtime. Switch to local runtime or use the managed-specific attach workflow.`,
    `'job attach' is not supported for runtime '${runtime}'.`,
  );
}

export function repoRequiredError(command: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.NOT_GIT_REPO,
    "Run 'git init' to initialize a repository, or cd into an existing git repository, then re-run.",
    `'${command}' requires a git repository.`,
  );
}

export function commitEffectFailedError(
  label: string,
  branch: string,
  operation: "stage" | "diff" | "commit" | "restore",
  detail: string,
): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.COMMIT_AND_PUSH_FAILED,
    `Check for index.lock conflicts, disk issues, or worktree corruption. Retry with specrunner job resume to continue.`,
    `${label}: git ${operation} failed on branch '${branch}': ${detail}`,
  );
}

/**
 * Returns the three operator-facing resolution options for an egress ledger mismatch.
 *
 * @param slugLabel - Job slug label to embed in the adopt command. Defaults to `"<slug>"`.
 * @returns Multi-line text listing the three resolution options.
 */
export function egressResolutionOptions(slugLabel: string = "<slug>"): string {
  return [
    "To resolve, choose one of:",
    `  1. Adopt the commit(s) into the egress ledger:`,
    `       specrunner job resume ${slugLabel} --adopt-commits`,
    `     (records the commit(s) in the ledger to allow the push)`,
    `  2. Push the commit(s) to origin so they leave the publish range.`,
    `  3. Remove or revert the commit(s) (git reset / git revert) so they leave the publish range.`,
  ].join("\n");
}

/**
 * Error thrown when the egress backstop detects a commit OID in the push range that is not
 * recorded in the synthesizedCommits ledger. This means the commit was not created by the
 * pipeline — an agent self-commit or external commit slipped through.
 *
 * git push is NOT called when this error is thrown (fail-closed).
 */
export function egressUnknownCommitError(oid: string, branch: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.EGRESS_UNKNOWN_COMMIT,
    `A commit not created by the pipeline was found in the push range. Investigate and resolve before retrying.\n${egressResolutionOptions()}`,
    `Egress backstop: unknown commit ${oid} in publish range for branch '${branch}'.`,
  );
}

/** Minimal shape of an occupant ref used in slugOccupiedError. */
interface OccupantLike {
  jobId: string;
  status: string;
  updatedAt?: string;
  pid?: number | null;
  worktreePath?: string | null;
}

/**
 * Factory for SLUG_OCCUPIED: a prior non-terminal job is occupying the slug.
 * Returns a SlugOccupiedError with structured priorJobId / priorStatus fields.
 */
export function slugOccupiedError(slug: string, prior: OccupantLike): SlugOccupiedError {
  const { jobId, status } = prior;
  const hint = status === "awaiting-archive"
    ? `Run 'specrunner job archive ${slug}' or 'specrunner job cancel ${jobId}' to free the slug.`
    : `Run 'specrunner job resume ${slug}' or 'specrunner job cancel ${jobId}' to free the slug.`;
  return new SlugOccupiedError(
    ERROR_CODES.SLUG_OCCUPIED,
    hint,
    `Slug '${slug}' is occupied by a non-terminal job (${jobId}, status: ${status}).`,
    jobId,
    status,
  );
}

/**
 * Factory for SLUG_STATE_UNREADABLE: state cannot be parsed/composed — fail closed.
 */
export function slugStateUnreadableError(slug: string, reason: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SLUG_STATE_UNREADABLE,
    `Inspect the state file under specrunner/changes/${slug}/ and repair or delete it.`,
    `Slug '${slug}' state is unreadable: ${reason}`,
  );
}

/**
 * Factory for SLUG_OCCUPANCY_AMBIGUOUS: multiple non-terminal jobs for the same slug.
 * Enumerates candidates and points to specrunner doctor for resolution.
 */
export function slugOccupancyAmbiguousError(
  slug: string,
  candidates: Array<{ jobId: string; status: string; updatedAt?: string }>,
): SpecRunnerError {
  const list = candidates
    .map((c) => `  ${c.jobId} (status: ${c.status}${c.updatedAt ? ", updatedAt: " + c.updatedAt : ""})`)
    .join("\n");
  return new SpecRunnerError(
    ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS,
    `Run 'specrunner doctor' to inspect the breach and cancel the unwanted job(s) manually.`,
    `Slug '${slug}' has multiple non-terminal jobs:\n${list}\nRun specrunner doctor to diagnose.`,
  );
}

/**
 * Error thrown when the post-exclusion staged file count in a guarded step exceeds
 * `pipeline.maxStagedFiles`. Halts before commit so a giant pack never reaches push.
 *
 * Not added to EXIT_CODE_MAP — it halts via the pipeline escalation path, not a CLI exit override.
 */
export function stagingLimitExceededError(
  stepName: string,
  branch: string,
  total: number,
  limit: number,
  topDirs: Array<{ dir: string; count: number }>,
): SpecRunnerError {
  const dirList = topDirs.map((d) => `  - ${d.dir}: ${d.count}`).join("\n");
  const hint =
    "既知の一時資材なら pipeline.stagingExcludePatterns か対象 repo の .gitignore に追加。" +
    "正当な大変更なら pipeline.maxStagedFiles を引き上げてください。";
  return new SpecRunnerError(
    ERROR_CODES.STAGING_LIMIT_EXCEEDED,
    hint,
    `Step '${stepName}' on branch '${branch}': staging limit exceeded. ` +
    `${total} files exceed the limit of ${limit}.\n` +
    `Top directories by file count:\n${dirList}`,
  );
}

/**
 * Error thrown when the post-exclusion staged byte size in a guarded step exceeds
 * `pipeline.maxStagedBytes`. Halts before commit so a giant pack never reaches push.
 *
 * Not added to EXIT_CODE_MAP — it halts via the pipeline escalation path, not a CLI exit override.
 */
export function stagedBytesLimitExceededError(
  stepName: string,
  branch: string,
  totalBytes: number,
  limitBytes: number,
  topDirs: Array<{ dir: string; bytes: number }>,
): SpecRunnerError {
  const dirList = topDirs.map((d) => `  - ${d.dir}: ${d.bytes}`).join("\n");
  const hint =
    "既知の一時資材なら pipeline.stagingExcludePatterns か対象 repo の .gitignore に追加。" +
    "正当な大変更なら pipeline.maxStagedBytes を引き上げてください。";
  return new SpecRunnerError(
    ERROR_CODES.STAGED_BYTES_LIMIT_EXCEEDED,
    hint,
    `Step '${stepName}' on branch '${branch}': staged byte size limit exceeded. ` +
    `${totalBytes} bytes exceed the limit of ${limitBytes}.\n` +
    `Top directories by size:\n${dirList}`,
  );
}

/**
 * Error thrown when a guarded step's worktree changes include paths outside its write-scope.
 * commit-push.ts throws this before staging to prevent boundary violations from being committed.
 */
export function writeScopeViolationError(
  stepName: string,
  branch: string,
  violatedPaths: string[],
  quarantinePath?: string | null,
): SpecRunnerError {
  const pathList = violatedPaths.map((p) => `  - ${p}`).join("\n");
  const quarantineNote = quarantinePath
    ? `\n違反内容の退避先（machine-local、commit されない）: ${quarantinePath}`
    : "";
  return new SpecRunnerError(
    ERROR_CODES.WRITE_SCOPE_VIOLATION,
    `境界外への変更を検出したため commit を中止した。違反変更は worktree から復元済み（checkpoint commit への混入防止）。\nViolating paths:\n${pathList}${quarantineNote}`,
    `Step '${stepName}' on branch '${branch}' attempted to write outside its declared scope.\nForbidden paths changed:\n${pathList}${quarantineNote}`,
  );
}
