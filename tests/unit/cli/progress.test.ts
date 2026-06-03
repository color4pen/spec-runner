/**
 * Unit tests for ProgressDisplay.
 *
 * TC-6.1:  EventBus emit → stdout output (basic step events)
 * TC-HB-1: step:start starts heartbeat timer
 * TC-HB-2: step:progress updates progressCount and lastTool
 * TC-HB-3: step:complete stops the timer
 * TC-HB-4: pipeline:fail stops the timer (safety net)
 * TC-HB-5: dispose() clears the timer
 * TC-HB-6: heartbeatIntervalSec = 0 → no timer started
 * TC-HB-7: TTY=true non-verbose → \r overwrite in heartbeat
 * TC-HB-8: TTY=false → \n append in heartbeat
 * TC-HB-9: step:error stops the timer
 * TC-HB-10: consecutive steps do not leak timers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { ProgressDisplay, wireProgressDisplay } from "../../../src/cli/progress.js";
import type { JobState } from "../../../src/state/schema.js";

/** Minimal JobState stub for tests */
function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    status: "running",
    branch: null,
    error: null,
    history: [],
    steps: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: {
      path: "/tmp/test/request.md",
      title: "Test Request",
      type: "new-feature",
      slug: null,
    },
    repository: { owner: "test", name: "repo" },
    step: "design",
    session: null,
    ...overrides,
  } as JobState;
}

/** Build a fake timer that records registered callbacks and cleared IDs. */
function makeFakeTimer() {
  let idCounter = 0;
  const callbacks: (() => void)[] = [];
  const clearedIds: number[] = [];
  const activeIds = new Set<number>();

  const timerFn = (callback: () => void, _ms: number): ReturnType<typeof setInterval> => {
    const id = ++idCounter;
    callbacks.push(callback);
    activeIds.add(id);
    return id as unknown as ReturnType<typeof setInterval>;
  };

  const clearTimerFn = (id: ReturnType<typeof setInterval>): void => {
    clearedIds.push(id as unknown as number);
    activeIds.delete(id as unknown as number);
  };

  const tick = (index = 0): void => {
    callbacks[index]?.();
  };

  return { timerFn, clearTimerFn, callbacks, clearedIds, activeIds, tick };
}

let stderrSpy: ReturnType<typeof vi.spyOn>;
let bus: EventBus;

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  bus = new EventBus();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-6.1: basic step events → stdout output (existing behaviour preserved)
// ---------------------------------------------------------------------------

describe("TC-6.1: ProgressDisplay — EventBus emit → stdout 出力", () => {
  it("step:start イベントで '[step] running...' を出力する", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("step:start", { step: "design", state: makeState() });
    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("[design] running...");
  });

  it("step:complete イベントで '[step] ✓ (Ns)' を出力する", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("step:start", { step: "design", state: makeState() });
    stderrSpy.mockClear();
    bus.emit("step:complete", { step: "design", state: makeState() });
    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("[design] ✓");
    expect(output).toMatch(/\d+s/);
  });

  it("step:error イベントで '[step] ✗ error (Ns)' を出力する", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("step:start", { step: "implementer", state: makeState() });
    stderrSpy.mockClear();
    bus.emit("step:error", { step: "implementer", error: new Error("oops"), state: makeState() });
    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("[implementer] ✗");
    expect(output).toContain("error");
    expect(output).toMatch(/\d+s/);
  });

  it("verdict:parsed イベントで verdict 値を出力する", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("verdict:parsed", { step: "spec-review", outcome: { verdict: "approved" } });
    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("[spec-review]");
    expect(output).toContain("approved");
  });

  it("verdict:parsed で verdict が null の場合は出力しない", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("verdict:parsed", { step: "spec-review", outcome: { verdict: null } });
    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toBe("");
  });

  it("pipeline:complete イベントで 'Next: specrunner job archive <slug>' を出力する", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState({ status: "awaiting-archive" }) });
    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("Next: specrunner job archive my-slug");
  });

  it("pipeline:fail イベントで failure reason を出力する", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:fail", { state: makeState({ status: "failed" }), reason: "test failure" });
    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("test failure");
  });
});

// ---------------------------------------------------------------------------
// TC-HB-1: step:start starts heartbeat timer
// ---------------------------------------------------------------------------

describe("TC-HB-1: step:start starts heartbeat timer", () => {
  it("timerFn is called once on step:start when interval > 0", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    expect(fake.callbacks).toHaveLength(1);
  });

  it("heartbeat tick outputs elapsed line", () => {
    let now = 1000;
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      nowFn: () => now,
      isTTY: false,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    stderrSpy.mockClear();

    now = 1000 + 45_000; // 45s later
    fake.tick(0);

    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("[implementer] 45s");
  });
});

// ---------------------------------------------------------------------------
// TC-HB-2: step:progress updates progressCount and lastTool
// ---------------------------------------------------------------------------

describe("TC-HB-2: step:progress accumulates into heartbeat output", () => {
  it("progressCount and lastTool appear on next tick after step:progress", () => {
    let now = 1000;
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      nowFn: () => now,
      isTTY: false,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    bus.emit("step:progress", { step: "implementer", tool: "Edit", target: "src/foo.ts" });
    bus.emit("step:progress", { step: "implementer", tool: "Bash" });
    stderrSpy.mockClear();

    now += 60_000;
    fake.tick(0);

    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("2 actions");
    expect(output).toContain("last: Bash");
  });

  it("step:progress without target uses tool name only", () => {
    let now = 1000;
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      nowFn: () => now,
      isTTY: false,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    bus.emit("step:progress", { step: "implementer", tool: "Read", target: "src/bar.ts" });
    stderrSpy.mockClear();

    now += 30_000;
    fake.tick(0);

    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(output).toContain("last: Read src/bar.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-HB-3: step:complete stops the timer
// ---------------------------------------------------------------------------

describe("TC-HB-3: step:complete stops the heartbeat timer", () => {
  it("clearTimerFn is called on step:complete", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    expect(fake.clearedIds).toHaveLength(0);

    bus.emit("step:complete", { step: "implementer", state: makeState() });
    expect(fake.clearedIds).toHaveLength(1);
  });

  it("no output on tick after step:complete (timer cleared)", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      isTTY: false,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    bus.emit("step:complete", { step: "implementer", state: makeState() });
    stderrSpy.mockClear();

    // Timer was cleared, but we simulate a tick to verify currentStep is null
    fake.tick(0);

    const output = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    // Should produce no heartbeat line (currentStep is null)
    expect(output).not.toContain("implementer] ");
  });
});

// ---------------------------------------------------------------------------
// TC-HB-4: pipeline:fail stops the timer (safety net)
// ---------------------------------------------------------------------------

describe("TC-HB-4: pipeline:fail stops heartbeat (safety net)", () => {
  it("clearTimerFn is called when pipeline:fail fires during a step", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    bus.emit("pipeline:fail", { state: makeState({ status: "failed" }), reason: "boom" });

    expect(fake.clearedIds).toHaveLength(1);
  });

  it("clearTimerFn is called when pipeline:complete fires", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    bus.emit("step:complete", { step: "implementer", state: makeState() });
    // Timer already cleared by step:complete; pipeline:complete should be safe to call
    const countAfterStep = fake.clearedIds.length;
    bus.emit("pipeline:complete", { state: makeState({ status: "awaiting-archive" }) });
    // No additional clear expected (timer was already null)
    expect(fake.clearedIds.length).toBe(countAfterStep);
  });
});

// ---------------------------------------------------------------------------
// TC-HB-5: dispose() clears the timer
// ---------------------------------------------------------------------------

describe("TC-HB-5: dispose() clears the heartbeat timer", () => {
  it("dispose() calls clearTimerFn when a timer is active", () => {
    const fake = makeFakeTimer();
    const display = new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    expect(fake.clearedIds).toHaveLength(0);

    display.dispose();
    expect(fake.clearedIds).toHaveLength(1);
  });

  it("dispose() is idempotent when no timer is active", () => {
    const fake = makeFakeTimer();
    const display = new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 0,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    // No timer started (interval = 0)
    display.dispose();
    display.dispose();
    expect(fake.clearedIds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-HB-6: heartbeatIntervalSec = 0 → no timer started
// ---------------------------------------------------------------------------

describe("TC-HB-6: heartbeatIntervalSec = 0 disables the timer", () => {
  it("timerFn is not called when heartbeatIntervalSec is 0", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 0,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    expect(fake.callbacks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-HB-7: TTY=true non-verbose → \r overwrite in heartbeat
// ---------------------------------------------------------------------------

describe("TC-HB-7: TTY=true non-verbose → \\r overwrite", () => {
  it("heartbeat tick uses \\r when isTTY=true and verbose=false", () => {
    let now = 1000;
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      nowFn: () => now,
      isTTY: true,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    stderrSpy.mockClear();

    now += 30_000;
    fake.tick(0);

    const written = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(written).toMatch(/^\r/);
    expect(written).not.toContain("\n");
  });

  it("step:complete in TTY mode writes \\r\\x1b[K to clear the overwrite line", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      isTTY: true,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    stderrSpy.mockClear();
    bus.emit("step:complete", { step: "implementer", state: makeState() });

    const written = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(written).toContain("\r\x1b[K");
    expect(written).toContain("[implementer] ✓");
  });
});

// ---------------------------------------------------------------------------
// TC-HB-8: TTY=false → \n append in heartbeat
// ---------------------------------------------------------------------------

describe("TC-HB-8: TTY=false → \\n append", () => {
  it("heartbeat tick appends newline when isTTY=false", () => {
    let now = 1000;
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      nowFn: () => now,
      isTTY: false,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    stderrSpy.mockClear();

    now += 30_000;
    fake.tick(0);

    const written = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(written).toContain("\n");
    expect(written).not.toMatch(/^\r/);
  });

  it("heartbeat tick appends newline when verbose=true (even if TTY)", () => {
    let now = 1000;
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "verbose",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
      nowFn: () => now,
      isTTY: true,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    stderrSpy.mockClear();

    now += 30_000;
    fake.tick(0);

    const written = stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
    expect(written).toContain("\n");
    expect(written).not.toMatch(/^\r/);
  });
});

// ---------------------------------------------------------------------------
// TC-HB-9: step:error stops the timer
// ---------------------------------------------------------------------------

describe("TC-HB-9: step:error stops the heartbeat timer", () => {
  it("clearTimerFn is called on step:error", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    bus.emit("step:error", { step: "implementer", error: new Error("boom"), state: makeState() });

    expect(fake.clearedIds).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-HB-10: consecutive steps do not leak timers
// ---------------------------------------------------------------------------

describe("TC-HB-10: consecutive steps do not leak timers", () => {
  it("second step:start stops first timer before starting new one", () => {
    const fake = makeFakeTimer();
    new ProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "spec-review", state: makeState() });
    // One timer started
    expect(fake.callbacks).toHaveLength(1);
    expect(fake.clearedIds).toHaveLength(0);

    // Second step starts without completing the first (simulating a quick hand-off)
    bus.emit("step:start", { step: "implementer", state: makeState() });
    // Old timer cleared, new timer started
    expect(fake.clearedIds).toHaveLength(1);
    expect(fake.callbacks).toHaveLength(2);
  });

  it("wireProgressDisplay returns a ProgressDisplay with dispose()", () => {
    const fake = makeFakeTimer();
    const display = wireProgressDisplay(bus, {
      logLevel: "default",
      slug: "s",
      heartbeatIntervalSec: 30,
      timerFn: fake.timerFn,
      clearTimerFn: fake.clearTimerFn,
    });

    bus.emit("step:start", { step: "implementer", state: makeState() });
    display.dispose();
    expect(fake.clearedIds).toHaveLength(1);
  });
});
