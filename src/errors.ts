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
  SESSION_TIMEOUT: "SESSION_TIMEOUT",
  SESSION_TERMINATED: "SESSION_TERMINATED",
  BRANCH_NOT_REGISTERED: "BRANCH_NOT_REGISTERED",
  STATE_FILE_INVALID: "STATE_FILE_INVALID",
  CHANGE_FOLDER_NOT_FOUND: "CHANGE_FOLDER_NOT_FOUND",
  GITHUB_CLIENT_ID_MISSING: "GITHUB_CLIENT_ID_MISSING",
  SESSION_CREATE_FAILED: "SESSION_CREATE_FAILED",
  SPEC_REVIEW_RESULT_NOT_FOUND: "SPEC_REVIEW_RESULT_NOT_FOUND",
  SPEC_REVIEW_RETRIES_EXHAUSTED: "SPEC_REVIEW_RETRIES_EXHAUSTED",
  SPEC_FIXER_NO_FINDINGS: "SPEC_FIXER_NO_FINDINGS",
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

export function sessionTimeoutError(minutes: number): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SESSION_TIMEOUT,
    `Session exceeded ${minutes}m. Inspect with 'specrunner ps'.`,
    `Session timed out after ${minutes}m.`,
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

export function specReviewResultNotFoundError(slug: string, branch: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.SPEC_REVIEW_RESULT_NOT_FOUND,
    `Ensure the spec-review agent wrote the result file to openspec/changes/${slug}/spec-review-result.md on branch '${branch}'.`,
    `Spec-review result file not found on branch '${branch}'.`,
  );
}
