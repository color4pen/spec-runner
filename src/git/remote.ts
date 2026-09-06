import { createHash } from "node:crypto";
import { notGitRepoError, remoteNotGitHubError, originNotConfiguredError } from "../errors.js";
import { SpecRunnerError } from "../errors.js";
import { runSubprocess, gitExecExitCode, defaultSpawnFn } from "../util/git-exec.js";
import type { RepositoryOrigin } from "../state/schema/types.js";

export interface OriginInfo {
  owner: string;
  name: string;
}

/**
 * Get the raw remote URL for "origin" without any GitHub-specific validation.
 *
 * Throws NOT_GIT_REPO if not a git repository.
 * Throws ORIGIN_NOT_CONFIGURED if no origin remote exists.
 *
 * @param cwd Working directory for git commands.
 */
export async function getOriginUrl(cwd: string): Promise<string> {
  let remoteUrl: string;
  try {
    const { stdout, exitCode } = await runSubprocess(
      defaultSpawnFn, "git", ["remote", "get-url", "origin"], { cwd },
    );
    if (exitCode !== 0) {
      const gitDirCode = await gitExecExitCode(defaultSpawnFn, cwd, ["rev-parse", "--git-dir"]);
      if (gitDirCode === 0) {
        throw originNotConfiguredError();
      }
      throw notGitRepoError();
    }
    remoteUrl = stdout.trim();
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) throw err;
    throw notGitRepoError();
  }

  if (!remoteUrl || remoteUrl.length === 0) {
    throw originNotConfiguredError();
  }

  return remoteUrl;
}

/**
 * Normalize a git remote URL to a forge-agnostic canonical identity.
 *
 * Canonical form: `host/path` (for URL-based remotes) or just `path` (for local file:// paths).
 * - userinfo (user:password@) is stripped
 * - scheme and port are stripped
 * - trailing `.git` and trailing slashes are stripped
 * - host is lowercased
 *
 * Returns a RepositoryOrigin with:
 *   - url:    The input URL with userinfo stripped (no credentials exposed)
 *   - digest: SHA-256 hex of the canonical form
 *
 * Examples (all produce the same digest):
 *   https://user:secret@example.com/team/repo.git
 *   git@example.com:team/repo.git
 *   https://example.com/team/repo
 *
 * @param remoteUrl The git remote URL to normalize.
 */
export function normalizeOriginIdentity(remoteUrl: string): RepositoryOrigin {
  let canonical: string;
  let cleanUrl: string;

  // SSH SCP format: git@host:path/to/repo.git
  const sshMatch = /^([^@]+@)?([^:]+):(.+)$/.exec(remoteUrl);
  if (sshMatch && !remoteUrl.startsWith("http") && !remoteUrl.startsWith("file:")) {
    const host = (sshMatch[2] ?? "").toLowerCase();
    let path = sshMatch[3] ?? "";
    path = path.replace(/\.git$/, "").replace(/\/$/, "");
    canonical = host ? `${host}/${path}` : path;
    cleanUrl = `git@${host}:${sshMatch[3] ?? ""}`;
  } else {
    let url: URL;
    try {
      url = new URL(remoteUrl);
    } catch {
      // Treat as a local path
      canonical = remoteUrl.replace(/\.git$/, "").replace(/\/$/, "");
      cleanUrl = remoteUrl;
      const digest = createHash("sha256").update(canonical).digest("hex");
      return { url: cleanUrl, digest };
    }

    // Strip userinfo from the clean URL
    const cleanedUrl = new URL(url.toString());
    cleanedUrl.username = "";
    cleanedUrl.password = "";
    cleanUrl = cleanedUrl.toString();

    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\.git$/, "").replace(/\/$/, "").replace(/^\//, "");

    if (url.protocol === "file:") {
      // file:///tmp/x/bare.git → just use the path
      canonical = path || "/";
    } else {
      canonical = host ? `${host}/${path}` : path;
    }
  }

  const digest = createHash("sha256").update(canonical).digest("hex");
  return { url: cleanUrl, digest };
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
  const remoteUrl = await getOriginUrl(cwd);
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
