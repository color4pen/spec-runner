import { SpecRunnerError } from "../errors.js";
import { setLogLevel, logError, stderrWrite, type LogLevel } from "../logger/stdout.js";
import { resolveJobStateBySlug } from "../core/resume/resolve-job.js";
import { bootstrap } from "./bootstrap.js";
import { getGitHubIntegration } from "../state/github-integration.js";
import { ResumeCommand } from "../core/command/resume.js";
import { EventBus } from "../core/event/event-bus.js";
import { wireProgressDisplay } from "./progress.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import { createIssueFidelityComparator } from "../adapter/claude-code/issue-fidelity-comparator.js";

/**
 * Resolve the heartbeat interval (seconds) from config → env → TTY-aware default.
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

export interface ResumeOptions {
  from?: string;
  force?: boolean;
  logLevel?: LogLevel;
  cwd?: string;
  /** Dispatch-resolved repo root (null = outside a repo). Forwarded to bootstrap for config load. */
  repoRoot?: string | null;
  prompt?: string;
  json?: boolean;
  noWorktree?: boolean;
  /** When true, commit dirty protected canon paths as an operator-apply commit before resuming. */
  applyCanon?: boolean;
  /** When true, adopt publish-range commits not in the ledger into synthesizedCommits before resuming. */
  adoptCommits?: boolean;
  /** Comma-separated 1-based indices of regression-gate findings to mark as wontfix. */
  wontfix?: string;
  /** Mandatory reason text when --wontfix is specified. */
  wontfixReason?: string;
}

export async function runResumeCore(slug: string, options: ResumeOptions): Promise<number> {
  setLogLevel(options.logLevel ?? "default");
  const cwd = options.cwd ?? process.cwd();

  let state: Awaited<ReturnType<typeof resolveJobStateBySlug>>;
  try {
    state = await resolveJobStateBySlug(slug, cwd);
  } catch (err) {
    logError((err as Error).message);
    return 1;
  }
  const stateOwner = state?.repository.owner;
  const stateName = state?.repository.name;
  const repo = stateOwner && stateName ? { owner: stateOwner, name: stateName } : null;
  // D1: use the job's stored githubIntegration.enabled as the authoritative value so that
  // a config change after job start does not switch the resume path to a different mode.
  // When state is null (terminal or not found), ResumeCommand.prepare() handles the error
  // path with appropriate messaging; default to enabled for backward compatibility.
  const githubEnabledOverride = state !== null ? getGitHubIntegration(state).enabled : true;

  let runtime: Awaited<ReturnType<typeof bootstrap>>["runtime"];
  let config: Awaited<ReturnType<typeof bootstrap>>["config"];
  try {
    ({ runtime, config } = await bootstrap(cwd, repo, options.repoRoot ?? null, githubEnabledOverride));
  } catch (err) {
    const e = err as Error & { hint?: string };
    logError(e.message);
    if (err instanceof SpecRunnerError && e.hint) stderrWrite(`Hint: ${e.hint}`);
    return 1;
  }

  const events = new EventBus();
  const logLevel = options.logLevel ?? "default";
  const progress = wireProgressDisplay(events, {
    logLevel,
    slug,
    heartbeatIntervalSec: resolveHeartbeatInterval(config),
  });
  try {
    return await new ResumeCommand(
      runtime,
      events,
      slug,
      {
        ...options,
        noWorktree: options.noWorktree,
        applyCanon: options.applyCanon,
        adoptCommits: options.adoptCommits,
        wontfix: options.wontfix,
        wontfixReason: options.wontfixReason,
      },
      (config) => createIssueFidelityComparator(config),
    ).execute();
  } catch (err) {
    logError((err as Error).message);
    return 1;
  } finally {
    progress.dispose();
  }
}


