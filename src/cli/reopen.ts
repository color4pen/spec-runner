/**
 * CLI entry point for `specrunner job reopen`.
 *
 * Transitions an awaiting-archive job to awaiting-resume (lifecycle only).
 * Requires --reason (operator rationale). Pipeline execution is handled by
 * `specrunner job resume` after reopen completes.
 *
 * Design: lightweight wrapper — resolves GitHub client when needed, creates ReopenCommand, calls execute().
 * PR-state gate: constructs a GitHubClient only when the job's contract is enabled.
 *
 * B-19: GitHub token resolution and client construction are confined to
 * src/cli/github-composition.ts. reopen.ts delegates to composeGitHubIntegrationForJob.
 */
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { setLogLevel, logError, resolveLogLevel, type LogLevel } from "../logger/stdout.js";
import { EXIT_CODE } from "../errors.js";
import { ReopenCommand } from "../core/command/reopen.js";
import { composeGitHubIntegrationForJob } from "./github-composition.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { getGitHubIntegration } from "../state/github-integration.js";
import { JobStateStore } from "../store/job-state-store.js";
import { getJobSlug } from "../state/job-slug.js";
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

  // Resolve GitHub client for PR-state gate.
  // For disabled jobs: skip token resolution entirely (B-19, T-08).
  // For enabled jobs: fail-closed when no token.
  let githubClient: GitHubClient | null = null;
  try {
    // Read the job's integration contract from stored state.
    let jobGithubEnabled = true; // default: enabled (backward compat)
    try {
      const cwd = options.repoRoot ?? options.cwd;
      if (cwd) {
        // includeArchived: same search scope as ReopenCommand (core), so a job whose change
        // folder was moved to changes/archive/ by a partial archive still resolves its contract.
        const allStates = await JobStateStore.list(cwd, { includeArchived: true });
        const matching = allStates.filter((s) => getJobSlug(s) === slug);
        matching.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        const matchingState = matching[0];
        if (matchingState) {
          jobGithubEnabled = getGitHubIntegration(matchingState).enabled;
        }
      }
    } catch {
      // Could not read job state — assume enabled (fail-safe for PR gate)
    }

    if (jobGithubEnabled) {
      // Only resolve token and create client for GitHub-enabled jobs.
      let config;
      try {
        config = await loadConfigWithOverlay();
      } catch {
        config = undefined;
      }
      if (config) {
        const { githubClient: client } = await composeGitHubIntegrationForJob({
          enabled: true,
          config,
          env: process.env as Record<string, string | undefined>,
        });
        githubClient = client;
      }
    }
    // For disabled jobs: githubClient stays null. ReopenCommand skips the PR gate.
  } catch {
    // No token available — PR gate will fail-closed in ReopenCommand.execute() (for enabled jobs)
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
