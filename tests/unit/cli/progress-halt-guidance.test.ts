/**
 * Unit tests for ProgressDisplay pipeline:complete Next guidance branching.
 *
 * TC-045: halt (awaiting-resume) completion advises resume
 *   (spec.md > Requirement: pipeline-complete Next guidance branches on the final state >
 *    Scenario: halt completion advises resume)
 * TC-046: normal (awaiting-archive) completion advises archive
 *   (spec.md > Requirement: pipeline-complete Next guidance branches on the final state >
 *    Scenario: normal completion advises archive)
 * TC-047: other terminal status → no Next guidance printed (tasks.md > T-09, should)
 *
 * Source: spec.md, tasks.md > T-09
 *
 * NOTE: TC-046 overlaps with the existing TC-6.1 pipeline:complete test in progress.test.ts.
 * This file tests the NEW branching behaviour introduced by T-09. With the current
 * unconditional implementation, TC-045 and TC-047 will be RED until onPipelineComplete is
 * updated to branch on state.status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { ProgressDisplay } from "../../../src/cli/progress.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(status: string, slug?: string): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    status: status as JobState["status"],
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
      slug: slug ?? "my-slug",
    },
    repository: { owner: "test", name: "repo" },
    step: "design",
    session: null,
  } as JobState;
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

function getOutput(): string {
  return stderrSpy.mock.calls.map((c: [string | Uint8Array, ...unknown[]]) => String(c[0])).join("");
}

// ---------------------------------------------------------------------------
// TC-045: halt (awaiting-resume) completion advises resume
// ---------------------------------------------------------------------------

describe("TC-045: pipeline:complete with awaiting-resume state advises resume", () => {
  it("prints 'Next: specrunner job resume <slug>' when status is awaiting-resume", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("awaiting-resume") });

    const output = getOutput();
    expect(output).toContain("Next: specrunner job resume my-slug");
  });

  it("does NOT print the archive hint when status is awaiting-resume", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("awaiting-resume") });

    const output = getOutput();
    expect(output).not.toContain("specrunner job archive");
  });

  it("includes the correct slug in the resume hint", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "feature-x", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("awaiting-resume", "feature-x") });

    const output = getOutput();
    expect(output).toContain("Next: specrunner job resume feature-x");
  });
});

// ---------------------------------------------------------------------------
// TC-046: normal (awaiting-archive) completion advises archive
// ---------------------------------------------------------------------------

describe("TC-046: pipeline:complete with awaiting-archive state advises archive", () => {
  it("prints 'Next: specrunner job archive <slug>' when status is awaiting-archive", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("awaiting-archive") });

    const output = getOutput();
    expect(output).toContain("Next: specrunner job archive my-slug");
  });

  it("does NOT print the resume hint when status is awaiting-archive", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("awaiting-archive") });

    const output = getOutput();
    expect(output).not.toContain("specrunner job resume");
  });
});

// ---------------------------------------------------------------------------
// TC-047: other terminal status → no Next guidance printed (should)
// ---------------------------------------------------------------------------

describe("TC-047: pipeline:complete with non-awaiting status prints no Next guidance", () => {
  it("prints no 'Next:' line when status is canceled", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("canceled") });

    const output = getOutput();
    expect(output).not.toContain("Next:");
  });

  it("prints no 'Next:' line when status is archived", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("archived") });

    const output = getOutput();
    expect(output).not.toContain("Next:");
  });

  it("prints no 'Next: specrunner job archive' for canceled status", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("canceled") });

    const output = getOutput();
    expect(output).not.toContain("specrunner job archive");
  });

  it("prints no 'Next: specrunner job resume' for archived status", () => {
    new ProgressDisplay(bus, { logLevel: "default", slug: "my-slug", heartbeatIntervalSec: 0 });
    bus.emit("pipeline:complete", { state: makeState("archived") });

    const output = getOutput();
    expect(output).not.toContain("specrunner job resume");
  });
});
