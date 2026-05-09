/**
 * Named error class for specrunner CLI.
 * Each error carries a machine-readable code and a human-readable hint for the user.
 */
export class SpecRunnerError extends Error {
  constructor(
    public readonly code: string,
    public readonly hint: string,
    message: string,
  ) {
    super(message);
    this.name = "SpecRunnerError";
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
  GITHUB_CLIENT_ID_MISSING: "GITHUB_CLIENT_ID_MISSING",
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
  WORKTREE_GUARD: "WORKTREE_GUARD",
  AMBIGUOUS_JOB_ID: "AMBIGUOUS_JOB_ID",
  POLL_TIMEOUT: "POLL_TIMEOUT",
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
    "Run 'specrunner init' first.",
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
    "Check the agent's propose output for errors.",
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
    "Verify that propose ran successfully and called register_branch before this step.",
    `state.branch is not set when entering '${stepName}'.`,
  );
}

export function noCommitDetectedError(stepName: string, branch: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.NO_COMMIT_DETECTED,
    `The agent likely forgot to commit + push, or completed without changes. Re-run the step or inspect the agent session log on Anthropic side. If the step legitimately produced no changes, this is a misconfiguration — set requiresCommit: false on the step.`,
    `${stepName} session ended without advancing branch '${branch}': HEAD SHA was unchanged before and after the session.`,
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

export function specReviewResultNotFoundError(slug: string, branch: string, iteration: number): SpecRunnerError {
  const nnn = String(iteration).padStart(3, "0");
  const filename = `spec-review-result-${nnn}.md`;
  return new SpecRunnerError(
    ERROR_CODES.SPEC_REVIEW_RESULT_NOT_FOUND,
    `Ensure the spec-review agent wrote the result file to openspec/changes/${slug}/${filename} on branch '${branch}'. If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors.`,
    `Spec-review result file not found on branch '${branch}'.`,
  );
}

export function pollTimeoutError(sessionId: string, elapsedMs: number): SpecRunnerError {
  const elapsedSec = Math.round(elapsedMs / 1000);
  return new SpecRunnerError(
    ERROR_CODES.POLL_TIMEOUT,
    "Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner cancel' to abort.",
    `Session '${sessionId}' did not complete within ${elapsedSec}s (${elapsedMs}ms).`,
  );
}

export function codeReviewResultNotFoundError(slug: string, branch: string, iteration: number): SpecRunnerError {
  const nnn = String(iteration).padStart(3, "0");
  const filename = `review-feedback-${nnn}.md`;
  return new SpecRunnerError(
    ERROR_CODES.CODE_REVIEW_RESULT_NOT_FOUND,
    `Ensure the code-review agent wrote the result file to openspec/changes/${slug}/${filename} on branch '${branch}'. If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors.`,
    `Code-review result file not found on branch '${branch}'.`,
  );
}
