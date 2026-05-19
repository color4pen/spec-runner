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
 * Resolve XDG_DATA_HOME or fallback to ~/.local/share
 */
export function resolveXdgDataDir(): string {
  const xdgDataHome = process.env["XDG_DATA_HOME"];
  if (xdgDataHome && xdgDataHome.length > 0) {
    return xdgDataHome;
  }
  return path.join(os.homedir(), ".local", "share");
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
 * Get the path to the specrunner jobs directory.
 */
export function getJobsDir(): string {
  return path.join(resolveXdgDataDir(), "specrunner", "jobs");
}

/**
 * Get the path to a specific job state file.
 */
export function getJobStatePath(jobId: string): string {
  return path.join(getJobsDir(), `${jobId}.json`);
}

/**
 * Resolve XDG_STATE_HOME or fallback to ~/.local/state
 */
export function resolveXdgStateDir(): string {
  const xdgStateHome = process.env["XDG_STATE_HOME"];
  if (xdgStateHome && xdgStateHome.length > 0) {
    return xdgStateHome;
  }
  return path.join(os.homedir(), ".local", "state");
}

/**
 * Get the path to the specrunner verbose log directory.
 */
export function getVerboseLogDir(): string {
  return path.join(resolveXdgStateDir(), "specrunner", "logs");
}

/**
 * Get the path to a specific job's verbose log file.
 */
export function getVerboseLogPath(jobId: string): string {
  return path.join(getVerboseLogDir(), `${jobId}.log`);
}
