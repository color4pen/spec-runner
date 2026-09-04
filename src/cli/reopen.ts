/**
 * CLI entry point for `specrunner job reopen`.
 *
 * Transitions an awaiting-archive job to awaiting-resume (lifecycle only).
 * Requires --reason (operator rationale). Pipeline execution is handled by
 * `specrunner job resume` after reopen completes.
 *
 * Design: lightweight wrapper — resolves GitHub client, creates ReopenCommand, calls execute().
 * PR-state gate: constructs a GitHubClient from resolved credentials (fail-closed when absent).
 */
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { setLogLevel, logError, resolveLogLevel, type LogLevel } from "../logger/stdout.js";
import { EXIT_CODE } from "../errors.js";
import { ReopenCommand } from "../core/command/reopen.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import type { GitHubClient } from "../core/port/github-client.js";

export interface ReopenOptions {
  reason: string;
  logLevel?: LogLevel;
  cwd?: string;
  /** Dispatch-resolved repo root (null = outside a repo). */
  repoRoot?: string | null;
  json?: boolean;
  noWorktree?: boolean;
}

export async function runReopenCore(slug: string, options: ReopenOptions): Promise<number> {
  setLogLevel(options.logLevel ?? "default");

  // Resolve GitHub client for PR-state gate (fail-closed when no token)
  let githubClient: GitHubClient | null = null;
  try {
    let githubHost = "github.com";
    let githubApiBaseUrl = "https://api.github.com";
    try {
      const cfg = await loadConfigWithOverlay();
      githubHost = resolveGitHubHost(cfg.github);
      githubApiBaseUrl = resolveGitHubApiBaseUrl(cfg.github);
    } catch {
      // Config not available — use defaults
    }
    const { token } = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
    githubClient = createGitHubClient(fetch, token, githubApiBaseUrl);
  } catch {
    // No token available — PR gate will fail-closed in ReopenCommand.execute()
  }

  try {
    return await new ReopenCommand(slug, {
      reason: options.reason,
      githubClient,
      logLevel: options.logLevel,
      cwd: options.cwd,
      json: options.json,
      noWorktree: options.noWorktree,
      repoRoot: options.repoRoot,
    }).execute();
  } catch (err) {
    logError((err as Error).message);
    return 1;
  }
}

/**
 * CLI handler for `specrunner job reopen`.
 * Returns the exit code; process termination is owned by the dispatch boundary.
 */
export async function handleJobReopen(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  const reason = parsed.flags["reason"] as string | undefined;

  if (!reason) {
    logError("--reason <text> is required for 'job reopen'.");
    return EXIT_CODE.ARG_ERROR;
  }

  const logLevel = resolveLogLevel({
    quiet: !!parsed.flags["quiet"],
    verbose: !!parsed.flags["verbose"],
    debug: !!parsed.flags["debug"],
  });

  return await runReopenCore(parsed.positional!, {
    reason,
    logLevel,
    cwd: ctx!.invokerCwd,
    repoRoot: ctx?.repoRoot,
    json: !!parsed.flags["json"],
    noWorktree: !!parsed.flags["no-worktree"],
  });
}
