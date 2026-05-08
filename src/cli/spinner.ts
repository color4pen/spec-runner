/**
 * Minimal TTY spinner for stderr.
 *
 * createSpinner() returns a { start, stop } object.
 * - start(): Begin animating on stderr. No-op if non-TTY or already running.
 * - stop(): Clear the spinner line. No-op if not running.
 *
 * Note: uses `!process.stderr.isTTY` to guard against both `false` and `undefined`
 * (Node.js sets isTTY to `true` for TTY streams and `undefined` for non-TTY; never `false`).
 * This prevents ANSI escape sequences from appearing in piped output.
 */

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export function createSpinner(): { start(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;

  function start(): void {
    // Disable in non-TTY environments to prevent ANSI garbage in pipes/redirects
    if (!process.stderr.isTTY) return;
    // Already running — no-op
    if (timer !== null) return;
    frameIndex = 0;
    timer = setInterval(() => {
      const frame = FRAMES[frameIndex % FRAMES.length]!;
      process.stderr.write(`\r${frame}`);
      frameIndex++;
    }, INTERVAL_MS);
  }

  function stop(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    process.stderr.write("\r\x1b[K");
  }

  return { start, stop };
}
