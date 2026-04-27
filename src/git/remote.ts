import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { notGitRepoError, remoteNotGitHubError } from "../errors.js";
import { SpecRunnerError } from "../errors.js";

const execFileAsync = promisify(execFile);

export interface OriginInfo {
  owner: string;
  name: string;
}

/**
 * Get the GitHub owner and repository name from git origin remote.
 * Supports both HTTPS and SSH remote URL formats.
 * Strips credentials from HTTPS URLs.
 *
 * Throws NOT_GIT_REPO if not a git repository.
 * Throws REMOTE_NOT_GITHUB if remote is not github.com.
 */
export async function getOriginInfo(cwd: string): Promise<OriginInfo> {
  let remoteUrl: string;
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd },
    );
    remoteUrl = stdout.trim();
  } catch (err: unknown) {
    const message = (err as Error).message ?? "";
    if (
      message.includes("not a git repository") ||
      message.includes("fatal: not a git") ||
      message.includes("128")
    ) {
      // Could be not a git repo
      // Try to differentiate between "not a git repo" and "no remote"
      try {
        await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd });
        // Is a git repo but no origin
        throw new SpecRunnerError(
          "NOT_GIT_REPO",
          "cd into a git repository before running specrunner.",
          "Origin remote not configured.",
        );
      } catch (innerErr: unknown) {
        if (innerErr instanceof SpecRunnerError) throw innerErr;
        throw notGitRepoError();
      }
    }
    if (
      message.includes("No such remote") ||
      message.includes("not a remote")
    ) {
      throw new SpecRunnerError(
        "NOT_GIT_REPO",
        "cd into a git repository before running specrunner.",
        "Origin remote not configured.",
      );
    }
    throw notGitRepoError();
  }

  if (!remoteUrl || remoteUrl.length === 0) {
    throw new SpecRunnerError(
      "NOT_GIT_REPO",
      "cd into a git repository before running specrunner.",
      "Origin remote not configured.",
    );
  }

  return parseRemoteUrl(remoteUrl);
}

/**
 * Parse a git remote URL into owner/name.
 * Exported for testing.
 */
export function parseRemoteUrl(remoteUrl: string): OriginInfo {
  // SSH format: git@github.com:owner/repo.git
  const sshPattern = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/;
  const sshMatch = sshPattern.exec(remoteUrl);
  if (sshMatch?.[1] && sshMatch?.[2]) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  // HTTPS format: https://[user:token@]github.com/owner/repo[.git]
  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    throw remoteNotGitHubError();
  }

  if (url.hostname !== "github.com") {
    throw remoteNotGitHubError();
  }

  // Strip leading slash and trailing .git
  const pathParts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
  if (pathParts.length < 2 || !pathParts[0] || !pathParts[1]) {
    throw remoteNotGitHubError();
  }

  return { owner: pathParts[0], name: pathParts[1] };
}
