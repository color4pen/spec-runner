/**
 * Tests for step:retry event handling in ProgressDisplay.
 *
 * T-06 acceptance criteria:
 *   - step:retry event → stderr line "[<step>] transient error — retrying (<N>/<M>)…"
 *   - quiet mode suppresses the output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EventBus } from "../../core/event/event-bus.js";
import { ProgressDisplay } from "../progress.js";

// ---------------------------------------------------------------------------
// Minimal EventBus stub
// ---------------------------------------------------------------------------

type Listener = (payload: Record<string, unknown>) => void;

function makeEventBus(): EventBus & { trigger: (event: string, payload: Record<string, unknown>) => void } {
  const handlers = new Map<string, Listener[]>();
  return {
    on(event: string, listener: Listener) {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    },
    emit(event: string, payload: Record<string, unknown>) {
      handlers.get(event)?.forEach((l) => l(payload));
    },
    off() {},
    once() {},
    trigger(event: string, payload: Record<string, unknown>) {
      handlers.get(event)?.forEach((l) => l(payload));
    },
  } as unknown as EventBus & { trigger: (event: string, payload: Record<string, unknown>) => void };
}

describe("ProgressDisplay — step:retry event (T-06)", () => {
  let stderrLines: string[];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    stderrLines = [];
    originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = vi.fn((chunk: string) => {
      stderrLines.push(chunk);
      return true;
    }) as unknown as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it("step:retry event writes retry line to stderr", () => {
    const events = makeEventBus();
    new ProgressDisplay(events, {
      logLevel: "default",
      slug: "test-slug",
      heartbeatIntervalSec: 0,
      isTTY: false,
    });

    events.trigger("step:retry", {
      step: "implementer",
      attempt: 1,
      maxRetries: 3,
      delayMs: 1000,
    });

    const output = stderrLines.join("");
    expect(output).toContain("[implementer] transient error — retrying (1/3)");
  });

  it("step:retry includes attempt and maxRetries in output", () => {
    const events = makeEventBus();
    new ProgressDisplay(events, {
      logLevel: "default",
      slug: "test-slug",
      heartbeatIntervalSec: 0,
      isTTY: false,
    });

    events.trigger("step:retry", {
      step: "design",
      attempt: 2,
      maxRetries: 3,
      delayMs: 2000,
    });

    const output = stderrLines.join("");
    expect(output).toContain("[design] transient error — retrying (2/3)");
  });

  it("quiet mode suppresses step:retry output", () => {
    const events = makeEventBus();
    new ProgressDisplay(events, {
      logLevel: "quiet",
      slug: "test-slug",
      heartbeatIntervalSec: 0,
      isTTY: false,
    });

    events.trigger("step:retry", {
      step: "implementer",
      attempt: 1,
      maxRetries: 3,
      delayMs: 1000,
    });

    const output = stderrLines.join("");
    expect(output).not.toContain("retrying");
  });
});
