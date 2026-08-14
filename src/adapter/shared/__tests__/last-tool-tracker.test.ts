/**
 * Unit tests for the last-tool tracker (TC-001 through TC-004, TC-016).
 *
 * TC-001: tool in-flight at timeout — hint contains tool, target, elapsed, in-flight marker
 * TC-002: tool completed before timeout — hint contains completed marker, not in-flight
 * TC-003: no tool observed in the session — hint contains "no tool observed"
 * TC-004: non-matching completion does not clear in-flight state
 * TC-016: best-effort id match when either id is undefined
 */
import { describe, it, expect } from "vitest";
import { createLastToolTracker } from "../last-tool-tracker.js";

// ---------------------------------------------------------------------------
// TC-001: tool in-flight at timeout
// ---------------------------------------------------------------------------

describe("TC-001: tool observed and still in-flight — hint contains tool, target, elapsed, in-flight marker", () => {
  it("hint contains tool name, target, elapsed ms, and in-flight marker", () => {
    let now = 0;
    const tracker = createLastToolTracker(() => now);
    tracker.onToolStart("Bash", "bun test", "tu-1");
    now = 5000;
    const hint = tracker.timeoutHint();
    expect(hint).toContain("Bash");
    expect(hint).toContain("bun test");
    expect(hint).toContain("5000");
    expect(hint).toContain("in-flight");
    expect(hint).not.toContain("completed before timeout");
  });

  it("hint excludes target text when target is undefined", () => {
    let now = 0;
    const tracker = createLastToolTracker(() => now);
    tracker.onToolStart("Read", undefined, "tu-2");
    now = 1000;
    const hint = tracker.timeoutHint();
    expect(hint).toContain("Read");
    expect(hint).toContain("1000");
    expect(hint).toContain("in-flight");
    // No stray space before tool name when no target
    expect(hint).not.toMatch(/Read\s{2,}/);
  });
});

// ---------------------------------------------------------------------------
// TC-002: tool completed before timeout
// ---------------------------------------------------------------------------

describe("TC-002: tool observed then completed — hint contains completed marker, not in-flight", () => {
  it("matching onToolEnd marks tool as done; hint says completed, not in-flight", () => {
    let now = 0;
    const tracker = createLastToolTracker(() => now);
    tracker.onToolStart("Bash", "bun test", "tu-1");
    tracker.onToolEnd("tu-1");
    now = 3000;
    const hint = tracker.timeoutHint();
    expect(hint).toContain("Bash");
    expect(hint).toContain("bun test");
    expect(hint).toContain("completed before timeout");
    expect(hint).not.toContain("in-flight");
  });
});

// ---------------------------------------------------------------------------
// TC-003: no tool observed in the session
// ---------------------------------------------------------------------------

describe("TC-003: no tool observed — hint contains 'no tool observed'", () => {
  it("fresh tracker returns no-tool-observed hint", () => {
    const tracker = createLastToolTracker();
    const hint = tracker.timeoutHint();
    expect(hint).toContain("no tool observed");
  });
});

// ---------------------------------------------------------------------------
// TC-004: non-matching completion does not clear in-flight state
// ---------------------------------------------------------------------------

describe("TC-004: non-matching onToolEnd leaves last tool in-flight", () => {
  it("onToolEnd with different id does not mark last tool done", () => {
    let now = 0;
    const tracker = createLastToolTracker(() => now);
    tracker.onToolStart("Bash", "cmd", "id-A");
    tracker.onToolEnd("id-B"); // different id — must NOT clear
    now = 1000;
    const hint = tracker.timeoutHint();
    expect(hint).toContain("Bash");
    expect(hint).toContain("in-flight");
    expect(hint).not.toContain("completed before timeout");
  });

  it("subsequent start replaces previous tool", () => {
    let now = 0;
    const tracker = createLastToolTracker(() => now);
    tracker.onToolStart("Read", "file.ts", "id-1");
    tracker.onToolStart("Bash", "bun test", "id-2");
    tracker.onToolEnd("id-1"); // matches previous tool, not the last
    now = 500;
    const hint = tracker.timeoutHint();
    // Last tool is Bash id-2, which is still in-flight
    expect(hint).toContain("Bash");
    expect(hint).toContain("in-flight");
  });
});

// ---------------------------------------------------------------------------
// TC-016: best-effort id match when either id is undefined (should priority)
// ---------------------------------------------------------------------------

describe("TC-016: best-effort id match when either id is undefined", () => {
  it("onToolEnd(undefined) matches tool started with an id — best-effort", () => {
    const tracker = createLastToolTracker();
    tracker.onToolStart("Bash", "cmd", "id-A");
    tracker.onToolEnd(undefined); // undefined correlates with anything
    const hint = tracker.timeoutHint();
    expect(hint).toContain("completed before timeout");
    expect(hint).not.toContain("in-flight");
  });

  it("onToolEnd(someId) matches tool started with undefined id — best-effort", () => {
    const tracker = createLastToolTracker();
    tracker.onToolStart("Bash", "cmd", undefined); // no id at start
    tracker.onToolEnd("any-id");
    const hint = tracker.timeoutHint();
    expect(hint).toContain("completed before timeout");
    expect(hint).not.toContain("in-flight");
  });
});
