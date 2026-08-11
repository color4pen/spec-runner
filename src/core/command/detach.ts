/**
 * Detach support for the specrunner CLI.
 *
 * Provides the primitives used by the --detach flag:
 *   - DETACH_MARKER_ENV / isDetachedChild  — recursion guard
 *   - stripDetachFlag                       — arg sanitisation before re-spawn
 *   - buildDetachGuidance                  — human-readable parent output (success path)
 *   - buildDetachStartFailure              — single-source failure message (failure path)
 *   - detachSelf                            — async self-respawn with ack loop
 *
 * Design: D1 / D2 / D3 / D4 / D5 / D7 in design.md.
 */

import * as process from "node:process";
import { getDetachLogPath, readDetachLogTail, readSidecarPid } from "../../util/xdg.js";
import { spawnBackground } from "../../util/spawn.js";
import type { SpawnBackgroundFn } from "../../util/spawn.js";
import { stdoutWrite } from "../../logger/stdout.js";
import { EXIT_CODE } from "../../errors.js";

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
// Guidance text (D7)
// ---------------------------------------------------------------------------

/**
 * Build the guidance string printed by the parent process after the child
 * has registered (success path).  Includes slug, `job wait`, and `job show`.
 */
export function buildDetachGuidance(slug: string): string {
  return [
    `Detached pipeline started for: ${slug}`,
    `  Monitor: specrunner job wait ${slug}`,
    `  Details: specrunner job show ${slug}`,
  ].join("\n");
}

/**
 * Build the failure message emitted to stderr when the detach child dies
 * before registering.  Single exported definition so output-contract tests
 * can pin it by substring (design D7).
 *
 * Must include: slug, full detach-log path, transcribed log tail.
 */
export function buildDetachStartFailure(slug: string, logPath: string, logTail: string): string {
  return [
    `Error: Detached pipeline for '${slug}' failed to start.`,
    `Detach log: ${logPath}`,
    logTail ? `--- log tail ---\n${logTail}` : "(detach log is empty)",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// DetachSelfDeps — dependency-injection seam (D5)
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for `detachSelf` (mirrors JobWaitDeps style).
 * Production defaults are supplied internally; tests inject stubs.
 */
export interface DetachSelfDeps {
  /** Spawn function — defaults to real `spawnBackground`. */
  spawnFn: SpawnBackgroundFn;
  /**
   * Read the pid from the liveness sidecar for this (repoRoot, slug) pair.
   * The closure captures repoRoot and slug.
   * Returns null when the sidecar is absent, unreadable, or has no pid field.
   */
  readSidecarPid: () => number | null;
  /**
   * Read the last `lines` lines of the detach log at `logPath`.
   * Called only on the failure path.
   */
  readDetachLogTail: (logPath: string, lines: number) => string;
  /** Async sleep (injected so tests run without real delays). */
  sleep: (ms: number) => Promise<void>;
  /**
   * Polling interval in ms between registration checks.
   * Design: 200 ms (operator-confirmed).
   */
  pollIntervalMs: number;
}

// ---------------------------------------------------------------------------
// detachSelf — async self-respawn with ack loop (D5)
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
 * Self-respawn: spawn a copy of the current CLI process with `detached: true`,
 * redirect its stdio to a slug-keyed log file, then wait (process-death-gated)
 * until the child registers its liveness sidecar OR dies before doing so.
 *
 * Exit 0 contract: "pipeline process is alive and job is discoverable by
 * `job wait <slug>` / `job ls`".
 *
 * @param opts  Detach configuration.
 * @param deps  Injected dependencies (for tests). Production defaults are used
 *              when omitted.
 * @returns Exit code for the **parent** process: 0 on registration, 1 on failure.
 */
export async function detachSelf(
  opts: DetachSelfOptions,
  deps?: DetachSelfDeps,
): Promise<number> {
  const childArgs = stripDetachFlag(opts.args);
  const logFilePath = getDetachLogPath(opts.repoRoot, opts.slug);

  // Build child env: full passthrough + recursion marker.
  const rawEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.env)) {
    if (v !== undefined) rawEnv[k] = v;
  }
  rawEnv[DETACH_MARKER_ENV] = "1";

  // Resolve deps (use production defaults when not injected).
  const spawnFn = deps?.spawnFn ?? spawnBackground;
  const readSidecarPidFn = deps?.readSidecarPid ?? (() => readSidecarPid(opts.repoRoot, opts.slug));
  const readDetachLogTailFn = deps?.readDetachLogTail ?? readDetachLogTail;
  const sleep = deps?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = deps?.pollIntervalMs ?? 200;

  // Death-gate flag — set by onExit or onError.
  let childEnded = false;

  // Spawn the child synchronously up-front (shape assertions can be made immediately).
  const handle = spawnFn(process.execPath, [process.argv[1]!, ...childArgs], {
    cwd: opts.repoRoot,
    detached: true,
    logFilePath,
    rawEnv,
    onExit: (code, signal) => {
      void code; void signal;
      childEnded = true;
    },
    onError: (_err) => {
      childEnded = true;
    },
  });

  // Treat missing pid as an immediate failure (D2).
  const childPid = handle.pid;
  if (childPid === undefined) {
    childEnded = true;
  }

  // Ack loop: registration-first ordering (D3).
  for (;;) {
    // 1. Registration check (first).
    if (childPid !== undefined && readSidecarPidFn() === childPid) {
      stdoutWrite(buildDetachGuidance(opts.slug) + "\n");
      return EXIT_CODE.SUCCESS;
    }

    // 2. Death check.
    if (childEnded) {
      const tail = readDetachLogTailFn(logFilePath, 40);
      const msg = buildDetachStartFailure(opts.slug, logFilePath, tail);
      process.stderr.write(msg + "\n");
      return EXIT_CODE.GENERAL_ERROR;
    }

    // 3. Not yet registered and child is alive — wait.
    await sleep(pollIntervalMs);
  }
}
