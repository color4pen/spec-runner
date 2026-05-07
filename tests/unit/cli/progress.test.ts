/**
 * Unit tests for ProgressDisplay.
 * TC-6.1: EventBus に emit して stdout 出力を検証
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { ProgressDisplay } from "../../../src/cli/progress.js";
import type { JobState } from "../../../src/state/schema.js";

/** Minimal JobState stub for tests */
function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
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
    ...overrides,
  } as JobState;
}

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let bus: EventBus;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  bus = new EventBus();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TC-6.1: ProgressDisplay — EventBus emit → stdout 出力", () => {
  it("step:start イベントで '[step] running...' を出力する", () => {
    new ProgressDisplay(bus, { verbose: false, slug: "my-slug" });
    bus.emit("step:start", { step: "propose", state: makeState() });
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(output).toContain("[propose] running...");
  });

  it("step:complete イベントで '[step] ✓ (Ns)' を出力する", () => {
    new ProgressDisplay(bus, { verbose: false, slug: "my-slug" });
    // Emit start first to register start time
    bus.emit("step:start", { step: "propose", state: makeState() });
    stdoutSpy.mockClear();
    bus.emit("step:complete", { step: "propose", state: makeState() });
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(output).toContain("[propose] ✓");
    expect(output).toMatch(/\d+s/);
  });

  it("step:error イベントで '[step] ✗ error (Ns)' を出力する", () => {
    new ProgressDisplay(bus, { verbose: false, slug: "my-slug" });
    bus.emit("step:start", { step: "implementer", state: makeState() });
    stdoutSpy.mockClear();
    bus.emit("step:error", { step: "implementer", error: new Error("oops"), state: makeState() });
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(output).toContain("[implementer] ✗");
    expect(output).toContain("error");
    expect(output).toMatch(/\d+s/);
  });

  it("verdict:parsed イベントで verdict 値を出力する", () => {
    new ProgressDisplay(bus, { verbose: false, slug: "my-slug" });
    bus.emit("verdict:parsed", { step: "spec-review", outcome: { verdict: "approved" } });
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(output).toContain("[spec-review]");
    expect(output).toContain("approved");
  });

  it("verdict:parsed で verdict が null の場合は出力しない", () => {
    new ProgressDisplay(bus, { verbose: false, slug: "my-slug" });
    bus.emit("verdict:parsed", { step: "spec-review", outcome: { verdict: null } });
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(output).toBe("");
  });

  it("pipeline:complete イベントで 'Next: bun ./bin/specrunner.ts finish <slug>' を出力する", () => {
    new ProgressDisplay(bus, { verbose: false, slug: "my-slug" });
    bus.emit("pipeline:complete", { state: makeState({ status: "awaiting-merge" }) });
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(output).toContain("Next: bun ./bin/specrunner.ts finish my-slug");
  });

  it("pipeline:fail イベントで failure reason を出力する", () => {
    new ProgressDisplay(bus, { verbose: false, slug: "my-slug" });
    bus.emit("pipeline:fail", { state: makeState({ status: "failed" }), reason: "test failure" });
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(output).toContain("test failure");
  });
});
