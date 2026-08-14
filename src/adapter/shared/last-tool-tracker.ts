/**
 * Last-tool tracker: records the most recent tool start and whether its
 * matching completion was observed. Used by agent runners to enrich
 * STEP_TIMEOUT halt records so operators can distinguish a hung command
 * from an API/generation stall without inspecting the process tree.
 *
 * Design D2 (design.md): shared factory so both claude-code and codex
 * adapters reuse identical logic from a single, independently-testable surface.
 */

export interface LastToolTracker {
  /** Record a tool start. Replaces any previous last-tool state. */
  onToolStart(tool: string, target: string | undefined, id?: string): void;
  /**
   * Record a tool completion. Sets last.done = true when ids correlate.
   * Ids correlate when id === last.id, or when either id is undefined
   * (best-effort match for streams without ids).
   */
  onToolEnd(id?: string): void;
  /** Build the timeout hint string for the current state (three cases per D4). */
  timeoutHint(): string;
}

/**
 * Create a last-tool tracker.
 *
 * @param now - Clock source. Defaults to Date.now (vitest fake timers mock Date too).
 */
export function createLastToolTracker(now: () => number = Date.now): LastToolTracker {
  let last: {
    tool: string;
    target?: string;
    startedAt: number;
    id?: string;
    done: boolean;
  } | null = null;

  return {
    onToolStart(tool, target, id) {
      last = { tool, target, startedAt: now(), id, done: false };
    },

    onToolEnd(id) {
      if (!last || last.done) return;
      // ponytail: id-correlated; interleaved parallel tools w/o ids fall back to best-effort, require ids if that matters
      const correlates = id === last.id || id === undefined || last.id === undefined;
      if (correlates) last.done = true;
    },

    timeoutHint() {
      if (last === null) {
        return "no tool observed before timeout (no tool activity in session)";
      }
      const elapsed = now() - last.startedAt;
      const targetStr = last.target !== undefined ? ` ${last.target}` : "";
      if (!last.done) {
        return `last tool: ${last.tool}${targetStr} started ${elapsed}ms ago; in-flight (no completion observed before timeout)`;
      }
      return `last tool: ${last.tool}${targetStr} started ${elapsed}ms ago; completed before timeout`;
    },
  };
}
