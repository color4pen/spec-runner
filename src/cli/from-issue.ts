/**
 * CLI handler for `job start --from-issue <n>`.
 *
 * Orchestrates: GitHub client setup → issue fetch → request parse →
 * base-branch guard → detach/run.
 */
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { getOriginInfo } from "../git/remote.js";
import { parseRequestMdContent } from "../parser/request-md.js";
import { getCurrentBranch } from "../git/branch.js";
import { baseBranchMismatchError, SpecRunnerError, EXIT_CODE } from "../errors.js";
import { isDetachedChild, detachSelf } from "../core/command/detach.js";
import { materializeDraftAndStart } from "../core/job/start-from-issue.js";
import { logError } from "../logger/stdout.js";
import type { LogLevel } from "../logger/stdout.js";
import type { CommandContext } from "./command-context.js";

export interface FromIssueOptions {
  detach?: boolean;
  logLevel?: LogLevel;
  json?: boolean;
  noWorktree?: boolean;
}

/**
 * Run `job start --from-issue <issueNumber>`.
 * Returns process exit code.
 */
export async function runFromIssue(
  issueNumber: number,
  opts: FromIssueOptions,
  ctx?: CommandContext,
): Promise<number> {
  const repoRoot = ctx?.repoRoot ?? process.cwd();

  try {
    // --- 1. GitHub client setup (same pattern as inbox.ts) ---
    let config;
    try {
      config = await loadConfigWithOverlay(repoRoot, repoRoot);
    } catch (err) {
      logError(`Failed to load config: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    const githubHost = resolveGitHubHost(config.github);
    const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);

    let githubToken: string;
    try {
      const result = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
      githubToken = result.token;
    } catch (err) {
      logError(`Failed to resolve GitHub token: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    let owner: string;
    let repo: string;
    try {
      const origin = await getOriginInfo(repoRoot, githubHost);
      owner = origin.owner;
      repo = origin.name;
    } catch (err) {
      logError(`Failed to resolve git origin: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);

    // --- 2. Fetch issue body ---
    let issueBody: string;
    try {
      const issue = await githubClient.getIssue(owner, repo, issueNumber);
      issueBody = issue.body;
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        logError(err.message);
        return err.exitCode;
      }
      logError(`Failed to fetch issue #${issueNumber}: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    // --- 3. Parse request.md from issue body (副作用ゼロ — parse only) ---
    let slug: string;
    let baseBranch: string;
    try {
      const parsed = parseRequestMdContent(issueBody, `issue#${issueNumber}`);
      slug = parsed.slug;
      baseBranch = parsed.baseBranch;
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        logError(err.message);
        return err.exitCode;
      }
      logError(`Failed to parse issue #${issueNumber} body as request.md: ${(err as Error).message}`);
      return EXIT_CODE.ARG_ERROR;
    }

    // --- 4. Base-branch guard (--from-issue only, before any side effects) ---
    const currentBranch = await getCurrentBranch(repoRoot);
    if (currentBranch !== baseBranch) {
      const err = baseBranchMismatchError(currentBranch, baseBranch);
      logError(err.message);
      return err.exitCode;
    }

    // --- 5. Detach: parent resolves slug/guard here, then spawns child ---
    if (opts.detach && !isDetachedChild(process.env as Record<string, string | undefined>)) {
      return await detachSelf({
        args: process.argv.slice(2),
        repoRoot,
        slug,
        env: process.env as Record<string, string | undefined>,
      });
    }

    // --- 6. Materialize draft + start ---
    return await materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber });
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      return err.exitCode;
    }
    logError(`--from-issue failed: ${(err as Error).message}`);
    return EXIT_CODE.GENERAL_ERROR;
  }
}
