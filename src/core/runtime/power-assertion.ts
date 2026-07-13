/**
 * Power assertion: suppress OS idle sleep while a job is running.
 *
 * On macOS, spawns `caffeinate -i -w <parentPid>` via the util/spawn seam.
 * On other platforms, returns a no-op assertion (fail-open).
 *
 * Designed to be called once at registerCleanup() and released at teardown().
 * All code paths are fail-open: errors warn and the job continues normally.
 */
import { spawnBackground } from "../../util/spawn.js";
import type { SpawnBackgroundFn } from "../../util/spawn.js";
import { logWarn } from "../../logger/stdout.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Represents an active power assertion that can be released.
 * release() is idempotent and never throws.
 */
export interface PowerAssertion {
  release(): void;
}

/**
 * Options for acquirePowerAssertion.
 */
export interface AcquirePowerAssertionOptions {
  cwd: string;
  parentPid?: number;
  platform?: NodeJS.Platform;
  spawnBackgroundFn?: SpawnBackgroundFn;
  warn?: (msg: string) => void;
}

// ─── No-op singleton ──────────────────────────────────────────────────────────

const NO_OP_ASSERTION: PowerAssertion = { release() {} };

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Acquire a power assertion to suppress OS idle sleep.
 *
 * - On macOS: spawns `caffeinate -i -w <parentPid>` via the seam.
 *   `-i` suppresses idle sleep; `-w <pid>` ensures caffeinate exits when the
 *   parent process exits (orphan prevention backstop).
 * - On other platforms: returns a no-op assertion (fail-open).
 *
 * Never throws for any platform or spawn outcome.
 */
export function acquirePowerAssertion(opts: AcquirePowerAssertionOptions): PowerAssertion {
  const platform = opts.platform ?? process.platform;
  const warn = opts.warn ?? logWarn;

  // Non-darwin: no-op fail-open
  if (platform !== "darwin") {
    return NO_OP_ASSERTION;
  }

  // macOS: spawn caffeinate
  const parentPid = opts.parentPid ?? process.pid;
  const spawnBg = opts.spawnBackgroundFn ?? spawnBackground;

  const handle = spawnBg("caffeinate", ["-i", "-w", String(parentPid)], {
    cwd: opts.cwd,
    onError(err: Error) {
      warn(
        `idle-sleep suppression unavailable (caffeinate: ${err.message}); job will continue without it.`,
      );
    },
  });

  return {
    release() {
      handle.kill();
    },
  };
}
