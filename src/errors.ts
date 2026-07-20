
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
  DUPLICATE_LIVE_JOB: EXIT_CODE.ARG_ERROR,
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
  SPEC_FIXER_NO_FINDINGS: "SPEC_FIXER_NO_FINDINGS",
  BRANCH_NOT_SET: "BRANCH_NOT_SET",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  JOB_NOT_FINISHABLE: "JOB_NOT_FINISHABLE",
  OPENSPEC_ARCHIVE_FAILED: "OPENSPEC_ARCHIVE_FAILED",
  AUTO_MERGE_UNAVAILABLE: "AUTO_MERGE_UNAVAILABLE",
  GH_SUBPROCESS_FAILED: "GH_SUBPROCESS_FAILED",
  GIT_SUBPROCESS_FAILED: "GIT_SUBPROCESS_FAILED",
  NO_COMMIT_DETECTED: "NO_COMMIT_DETECTED",
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
  AUTHORITY_SPEC_EDIT_VIOLATION: "AUTHORITY_SPEC_EDIT_VIOLATION",
  ANTHROPIC_KEY_MISSING: "ANTHROPIC_KEY_MISSING",
  QUERY_ONE_SHOT_FAILED: "QUERY_ONE_SHOT_FAILED",
  QUERY_ONE_SHOT_TIMEOUT: "QUERY_ONE_SHOT_TIMEOUT",
  USER_CANCELED: "USER_CANCELED",
  SYMLINK_REJECTED: "SYMLINK_REJECTED",
  STEP_HALTED_NO_TOOL_CALL: "STEP_HALTED_NO_TOOL_CALL",
  STEP_INPUT_MISSING: "STEP_INPUT_MISSING",
  STEP_OUTPUT_MISSING: "STEP_OUTPUT_MISSING",
  WORKTREE_DIRTY: "WORKTREE_DIRTY",
  ENVIRONMENT_NOT_SET: "ENVIRONMENT_NOT_SET",
  DESIGN_LAYER_CHECK_FAILED: "DESIGN_LAYER_CHECK_FAILED",
  DUPLICATE_LIVE_JOB: "DUPLICATE_LIVE_JOB",
  JOURNAL_CORRUPTED: "JOURNAL_CORRUPTED",
  COMMIT_AND_PUSH_FAILED: "COMMIT_AND_PUSH_FAILED",
  CHECKPOINT_NOT_FOUND: "CHECKPOINT_NOT_FOUND",
  CHECKPOINT_NOT_ATTACHABLE: "CHECKPOINT_NOT_ATTACHABLE",
  ATTACH_FETCH_FAILED: "ATTACH_FETCH_FAILED",
  ATTACH_RUNTIME_UNSUPPORTED: "ATTACH_RUNTIME_UNSUPPORTED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Factory helpers for well-known errors */
export function configMissingError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CONFIG_MISSING,
    "Run 'specrunner init' first.",
    "Config file not found.",
  );
}

export function configIncompleteError(field: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CONFIG_INCOMPLETE,
    "Run 'specrunner login' first.",
    `Missing required config field: ${field}.`,
  );
}

export function githubTokenExpiredError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.GITHUB_TOKEN_EXPIRED,
    "Run 'specrunner login' to refresh.",
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

export function branchNotRegisteredError(): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.BRANCH_NOT_REGISTERED,
    "Check the agent's design output for errors.",
    "Branch was not registered by the agent.",
  );
}

export function stateFileInvalidError(path: string, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.STATE_FILE_INVALID,
    "Delete the corrupted file and re-run specrunner.",
    `State file invalid at ${path}: ${detail}`,
  );
}

export function changeFolderNotFoundError(slug: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.CHANGE_FOLDER_NOT_FOUND,
    "Ensure the change folder exists in the repository.",
    `Change folder not found for slug: ${slug}`,
  );
}

export function sessionCreateFailedError(detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SESSION_CREATE_FAILED,
    "Check your API key and try again.",
    `Failed to create session: ${detail}`,
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
    "Run 'specrunner managed setup'.",
    `Managed environment is not configured when entering '${stepName}'.`,
  );
}

export function noCommitDetectedError(stepName: string, branch: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.NO_COMMIT_DETECTED,
    `The agent produced no staged changes. Re-run the step or inspect the agent session log.`,
    `${stepName} completed with no staged changes on branch '${branch}'.`,
  );
}

export function pushFailedError(stepName: string, branch: string, detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.PUSH_FAILED,
    `Check network connectivity and remote permissions. Retry with 'specrunner job resume'.`,
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
    "Session may still be running on Anthropic side. Use 'specrunner job resume' to retry or 'specrunner job cancel <jobId>' to abort.",
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

export function stepHaltedNoToolCallError(stepName: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.STEP_HALTED_NO_TOOL_CALL,
    "The agent did not call report_result after the maximum number of retries. Resume the job to retry, or check the agent session log for why the agent failed to call the tool.",
    `Step '${stepName}' halted: agent did not call report_result tool after maximum retry attempts.`,
  );
}

export function worktreeDirtyError(detail: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.WORKTREE_DIRTY,
    "--no-worktree requires a clean working tree. Commit or stash your changes, then retry.",
    `Working tree is dirty: ${detail}`,
  );
}

export function stepInputMissingError(missingPaths: string[], branch: string | null): SpecRunnerError {
  const pathList = missingPaths.map(p => `  - ${p}`).join("\n");
  const branchNote = branch ? ` on branch '${branch}'` : "";
  return new SpecRunnerError(
    ERROR_CODES.STEP_INPUT_MISSING,
    `Required step input(s) not found${branchNote}. Ensure prior steps have completed successfully.\nMissing:\n${pathList}`,
    `Required step input(s) not found: ${missingPaths.join(", ")}`,
  );
}

export function authoritySpecEditViolationError(
  stepName: string,
  violatedPaths: string[],
): SpecRunnerError {
  const pathList = violatedPaths.map(p => `  - ${p}`).join("\n");
  return new SpecRunnerError(
    ERROR_CODES.AUTHORITY_SPEC_EDIT_VIOLATION,
    `Authority spec files must not be edited directly. Use specrunner/changes/<slug>/spec.md to describe spec changes.\nViolating paths:\n${pathList}`,
    `Agent step '${stepName}' attempted to edit authority spec files directly.`,
  );
}

export function duplicateLiveJobError(slug: string, priorJobId: string | null): SpecRunnerError {
  if (priorJobId !== null) {
    return new SpecRunnerError(
      ERROR_CODES.DUPLICATE_LIVE_JOB,
      `A live job (${priorJobId}) is already running for slug '${slug}'. Cancel it with 'specrunner job cancel ${priorJobId}', or wait for it to finish before re-running.`,
      `Refusing to start a duplicate run: slug '${slug}' already has a live job (${priorJobId}).`,
    );
  }
  return new SpecRunnerError(
    ERROR_CODES.DUPLICATE_LIVE_JOB,
    `A live job is already running for slug '${slug}'. Cancel it with 'specrunner job cancel <jobId>' (see 'specrunner job list'), or wait for it to finish before re-running.`,
    `Refusing to start a duplicate run: slug '${slug}' already has a live job.`,
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
  operation: "stage" | "diff" | "commit",
  detail: string,
): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.COMMIT_AND_PUSH_FAILED,
    `Check for index.lock conflicts, disk issues, or worktree corruption. Retry with 'specrunner job resume'.`,
    `${label}: git ${operation} failed on branch '${branch}': ${detail}`,
  );
}
