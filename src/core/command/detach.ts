/**
 * Detach support for the specrunner CLI.
 *
 * Provides the primitives used by the --detach flag:
 *   - DETACH_MARKER_ENV / isDetachedChild  — recursion guard
 *   - stripDetachFlag                       — arg sanitisation before re-spawn
 *   - buildDetachGuidance                  — human-readable parent output
 *   - detachSelf                            — the actual self-respawn logic
 *
 * Design: D1 / D2 / D3 / D4 in design.md.
 * The function is kept dependency-free (no auth / config / network) so the
 * parent process can exit quickly after spawning the child.
 */

import * as process from "node:process";
import { getDetachLogPath } from "../../util/xdg.js";
import { spawnBackground } from "../../util/spawn.js";
import type { SpawnBackgroundFn } from "../../util/spawn.js";
import { stdoutWrite } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Re-export SpawnBackgroundFn so tests can import it from here
// ---------------------------------------------------------------------------

export type { SpawnBackgroundFn };

// ---------------------------------------------------------------------------
// Marker env var — used for recursion prevention (D2)
// ---------------------------------------------------------------------------

/**
 * Environment variable name used to mark a detach child process.
 * When set to any truthy value the CLI skips the --detach branch and runs
 * foreground instead, preventing infinite re-spawn.
 */
export const DETACH_MARKER_ENV = "SPECRUNNER_DETACHED";

/**
 * Return true if the current process was started as a detach child
 * (i.e. the DETACH_MARKER_ENV variable is set to a truthy string).
 */
export function isDetachedChild(env: Record<string, string | undefined>): boolean {
  const val = env[DETACH_MARKER_ENV];
  return val !== undefined && val !== "" && val !== "0" && val !== "false";
}

// ---------------------------------------------------------------------------
// Arg sanitisation
// ---------------------------------------------------------------------------

/**
 * Remove every --detach and --detach=<value> token from an argument list.
 * All other tokens are left unchanged.
 */
export function stripDetachFlag(args: string[]): string[] {
  return args.filter((arg) => arg !== "--detach" && !arg.startsWith("--detach="));
}

// ---------------------------------------------------------------------------
// Guidance text (D8 / D1)
// ---------------------------------------------------------------------------

/**
 * Build the guidance string printed by the parent process after spawning
 * the child.  The string includes the slug, the `job wait` command, and
 * the `job show` command so that the caller (human or LLM agent) knows
 * how to track progress.
 */
export function buildDetachGuidance(slug: string): string {
  return [
    `Detached pipeline started for: ${slug}`,
    `  Monitor: specrunner job wait ${slug}`,
    `  Details: specrunner job show ${slug}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// detachSelf — self-respawn (D1)
// ---------------------------------------------------------------------------

export interface DetachSelfOptions {
  /** Raw CLI arguments (typically process.argv.slice(2)). */
  args: string[];
  /** Absolute path to the git repository root — used for log file location. */
  repoRoot: string;
  /** Slug of the request — used for the log file name and guidance output. */
  slug: string;
  /**
   * Full environment to pass to the child (credentials must be preserved).
   * The DETACH_MARKER_ENV variable will be added automatically.
   */
  env: Record<string, string | undefined>;
}

/**
 * Self-respawn: spawn a copy of the current CLI process with `detached: true`
 * and redirect its stdio to a slug-keyed log file.  The parent writes the
 * detach guidance to stdout and returns 0 (exit code for the parent).
 *
 * @param opts  Detach configuration.
 * @param spawnFn  Inject a different spawn implementation (for tests).
 *                 Defaults to the real `spawnBackground`.
 * @returns Exit code for the **parent** process (always 0).
 */
export function detachSelf(
  opts: DetachSelfOptions,
  spawnFn: SpawnBackgroundFn = spawnBackground,
): number {
  const childArgs = stripDetachFlag(opts.args);
  const logFilePath = getDetachLogPath(opts.repoRoot, opts.slug);

  // Build child env: full passthrough + recursion marker.
  const rawEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.env)) {
    if (v !== undefined) rawEnv[k] = v;
  }
  rawEnv[DETACH_MARKER_ENV] = "1";

  spawnFn(process.execPath, [process.argv[1]!, ...childArgs], {
    cwd: opts.repoRoot,
    detached: true,
    logFilePath,
    rawEnv,
  });

  // Output guidance to stdout so the caller (human / LLM agent) can track progress.
  stdoutWrite(buildDetachGuidance(opts.slug) + "\n");

  return 0;
}
