import { notGitRepoError, remoteNotGitHubError } from "../errors.js";
import { SpecRunnerError } from "../errors.js";
import { runSubprocess, gitExecExitCode, defaultSpawnFn } from "../util/git-exec.js";

export interface OriginInfo {
  owner: string;
  name: string;
}

/**
 * Get the GitHub owner and repository name from git origin remote.
 * Supports both HTTPS and SSH remote URL formats.
 * Strips credentials from HTTPS URLs.
 *
 * All subprocess calls are routed through the git-exec.ts strip seam so
 * secrets are never inherited by the child process.
 *
 * Throws NOT_GIT_REPO if not a git repository.
 * Throws REMOTE_NOT_GITHUB if remote does not match the configured host.
 *
 * @param cwd   Working directory for git commands.
 * @param host  Expected GitHub host (default: "github.com").
 */
export async function getOriginInfo(cwd: string, host: string = "github.com"): Promise<OriginInfo> {
  let remoteUrl: string;
  try {
    const { stdout, exitCode } = await runSubprocess(
      defaultSpawnFn, "git", ["remote", "get-url", "origin"], { cwd },
    );
    if (exitCode !== 0) {
      // Distinguish "not a git repo" from "git repo but no origin".
      const gitDirCode = await gitExecExitCode(defaultSpawnFn, cwd, ["rev-parse", "--git-dir"]);
      if (gitDirCode === 0) {
        throw new SpecRunnerError(
          "NOT_GIT_REPO",
          "cd into a git repository before running specrunner.",
          "Origin remote not configured.",
        );
      }
      throw notGitRepoError();
    }
    remoteUrl = stdout.trim();
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) throw err;
    throw notGitRepoError(); // spawn-level failure (e.g. git binary missing)
  }

  if (!remoteUrl || remoteUrl.length === 0) {
    throw new SpecRunnerError(
      "NOT_GIT_REPO",
      "cd into a git repository before running specrunner.",
      "Origin remote not configured.",
    );
  }

  return parseRemoteUrl(remoteUrl, host);
}

/**
 * Parse a git remote URL into owner/name.
 * Exported for testing.
 *
 * @param remoteUrl  The git remote URL (HTTPS or SSH format).
 * @param host       Expected GitHub host (default: "github.com").
 */
export function parseRemoteUrl(remoteUrl: string, host: string = "github.com"): OriginInfo {
  // SSH format: git@{host}:owner/repo.git
  const escapedHost = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sshPattern = new RegExp(`^git@${escapedHost}:([^/]+)/(.+?)(?:\\.git)?$`);
  const sshMatch = sshPattern.exec(remoteUrl);
  if (sshMatch?.[1] && sshMatch?.[2]) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  // HTTPS format: https://[user:token@]{host}/owner/repo[.git]
  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    throw remoteNotGitHubError();
  }

  if (url.hostname !== host) {
    throw remoteNotGitHubError();
  }

  // Strip leading slash and trailing .git
  const pathParts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
  if (pathParts.length < 2 || !pathParts[0] || !pathParts[1]) {
    throw remoteNotGitHubError();
  }

  return { owner: pathParts[0], name: pathParts[1] };
}
