/**
 * CLI entry point for `specrunner job reopen`.
 *
 * Transitions an awaiting-archive job back to running from a specified step.
 * Requires --from (step name) and --reason (operator rationale).
 *
 * Design: mirrors resume.ts — bootstrap runtime, wire progress display, run ReopenCommand.
 * PR-state gate: constructs a GitHubClient from resolved credentials (fail-closed when absent).
 */
import { SpecRunnerError } from "../errors.js";
import { setLogLevel, logError, stderrWrite, type LogLevel } from "../logger/stdout.js";
import { resolveJobStateBySlug } from "../core/resume/resolve-job.js";
import { bootstrap } from "./bootstrap.js";
import { ReopenCommand } from "../core/command/reopen.js";
import { EventBus } from "../core/event/event-bus.js";
import { wireProgressDisplay } from "./progress.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import type { GitHubClient } from "../core/port/github-client.js";
import type { SpecRunnerConfig } from "../config/schema.js";

/**
 * Resolve the heartbeat interval from config → env → TTY-aware default.
 * Returns 0 to disable the heartbeat.
 */
function resolveHeartbeatInterval(config: SpecRunnerConfig): number {
  const cfgVal = config.progress?.heartbeatIntervalSec;
  if (cfgVal === null || cfgVal === 0) return 0;
  if (cfgVal !== undefined && cfgVal > 0) return cfgVal;

  const envVal = process.env["SPECRUNNER_HEARTBEAT_INTERVAL"];
  if (envVal === "0" || envVal === "off") return 0;
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }

  return process.stdout.isTTY ? 30 : 60;
}

export interface ReopenOptions {
  from: string;
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
  const cwd = options.cwd ?? process.cwd();

  const state = await resolveJobStateBySlug(slug, cwd);
  const repo = state
    ? { owner: state.repository.owner, name: state.repository.name }
    : { owner: "", name: "" };

  let runtime: Awaited<ReturnType<typeof bootstrap>>["runtime"];
  let config: Awaited<ReturnType<typeof bootstrap>>["config"];
  try {
    ({ runtime, config } = await bootstrap(cwd, repo, options.repoRoot ?? null));
  } catch (err) {
    const e = err as Error & { hint?: string };
    logError(e.message);
    if (err instanceof SpecRunnerError && e.hint) stderrWrite(`Hint: ${e.hint}`);
    return 1;
  }

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
    // No token available — PR gate will fail-closed in ReopenCommand.prepare()
  }

  const events = new EventBus();
  const logLevel = options.logLevel ?? "default";
  const progress = wireProgressDisplay(events, {
    logLevel,
    slug,
    heartbeatIntervalSec: resolveHeartbeatInterval(config),
  });
  try {
    return await new ReopenCommand(runtime, events, slug, {
      from: options.from,
      reason: options.reason,
      githubClient,
      logLevel,
      cwd,
      json: options.json,
      noWorktree: options.noWorktree,
      repoRoot: options.repoRoot,
    }).execute();
  } catch (err) {
    logError((err as Error).message);
    return 1;
  } finally {
    progress.dispose();
  }
}

export async function runReopen(slug: string, options: ReopenOptions): Promise<void> {
  process.exit(await runReopenCore(slug, options));
}
