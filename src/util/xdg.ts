import * as os from "node:os";
import * as path from "node:path";

/**
 * Resolve XDG_CONFIG_HOME or fallback to ~/.config
 */
export function resolveXdgConfigDir(): string {
  const xdgConfigHome = process.env["XDG_CONFIG_HOME"];
  if (xdgConfigHome && xdgConfigHome.length > 0) {
    return xdgConfigHome;
  }
  return path.join(os.homedir(), ".config");
}

/**
 * Get the path to the specrunner config file.
 */
export function getConfigPath(): string {
  return path.join(resolveXdgConfigDir(), "specrunner", "config.json");
}

/**
 * Get the path to the specrunner credentials file.
 */
export function getCredentialsPath(): string {
  return path.join(resolveXdgConfigDir(), "specrunner", "credentials.json");
}


/**
 * Get the path to the specrunner verbose log directory.
 * Always returns <repoRoot>/.specrunner/logs/
 */
export function getVerboseLogDir(repoRoot: string): string {
  return path.join(repoRoot, ".specrunner", "logs");
}

/**
 * Get the path to a specific job's verbose log file.
 */
export function getVerboseLogPath(repoRoot: string, jobId: string): string {
  return path.join(getVerboseLogDir(repoRoot), `${jobId}.log`);
}

/**
 * Get the path to a specific job's agent session log directory.
 * Agent session logs for a job are stored under <repoRoot>/.specrunner/logs/<jobId>/
 * Each step/attempt produces a separate file: <stepName>-<attempt>.jsonl
 */
export function getAgentLogDir(repoRoot: string, jobId: string): string {
  return path.join(getVerboseLogDir(repoRoot), jobId);
}

/**
 * Get the path to the detach log file for a slug.
 * Detach logs capture stdout/stderr of the detach child process before pipeline
 * logger initialisation. Keyed by slug (not jobId) because jobId is unknown at
 * spawn time.
 *
 * Returns a path under .specrunner/logs/ (same dir as verbose logs) so that
 * the existing log-dir observability path (job show) naturally covers it.
 *
 * Example: getDetachLogPath("/repo", "my-feature")
 *          → "/repo/.specrunner/logs/my-feature.detach.log"
 */
export function getDetachLogPath(repoRoot: string, slug: string): string {
  return path.join(getVerboseLogDir(repoRoot), `${slug}.detach.log`);
}
