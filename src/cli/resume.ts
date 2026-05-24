import { SpecRunnerError } from "../errors.js";
import { setVerbose, resolveVerboseFlag } from "../logger/stdout.js";
import { resolveJobStateBySlug } from "../core/resume/resolve-job.js";
import { bootstrap } from "./bootstrap.js";
import { ResumeCommand } from "../core/command/resume.js";
import { EventBus } from "../core/event/event-bus.js";
import { wireProgressDisplay } from "./progress.js";
import { setJobsLocation } from "../util/xdg.js";
import { loadConfig } from "../config/store.js";
import type { SpecRunnerConfig } from "../config/schema.js";

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
  verbose?: boolean;
  cwd?: string;
}

export async function runResumeCore(slug: string, options: ResumeOptions): Promise<number> {
  setVerbose(resolveVerboseFlag(options.verbose ?? false));
  const cwd = options.cwd ?? process.cwd();

  // Resolve jobs storage location before any state reads; fall back to XDG on error
  try {
    const earlyConfig = await loadConfig();
    setJobsLocation(earlyConfig.jobs?.location ?? "project", cwd);
  } catch {
    setJobsLocation("xdg");
  }

  const state = await resolveJobStateBySlug(slug);
  const repo = state
    ? { owner: state.repository.owner, name: state.repository.name }
    : { owner: "", name: "" };

  let runtime: Awaited<ReturnType<typeof bootstrap>>["runtime"];
  let config: Awaited<ReturnType<typeof bootstrap>>["config"];
  try {
    ({ runtime, config } = await bootstrap(cwd, repo));
  } catch (err) {
    const e = err as Error & { hint?: string };
    process.stderr.write(`Error: ${e.message}\n`);
    if (err instanceof SpecRunnerError && e.hint) process.stderr.write(`Hint: ${e.hint}\n`);
    return 1;
  }

  const events = new EventBus();
  const verbose = options.verbose ?? false;
  const progress = wireProgressDisplay(events, {
    verbose,
    slug,
    heartbeatIntervalSec: resolveHeartbeatInterval(config),
  });
  try {
    return await new ResumeCommand(runtime, events, slug, options).execute();
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  } finally {
    progress.dispose();
  }
}

export async function runResume(slug: string, options: ResumeOptions): Promise<void> {
  process.exit(await runResumeCore(slug, options));
}
