/**
 * Tests for runtime exports in src/core/port/agent-runner.ts.
 *
 * The port module is otherwise type-only (interfaces erased at compile time),
 * so this file serves as the coverage anchor that ensures the module is
 * loaded by the test suite.  Added in reduce-added-agent-turns.
 */
import { describe, it, expect } from "vitest";
import { ADDED_TURNS_ZERO } from "../agent-runner.js";

describe("ADDED_TURNS_ZERO", () => {
  it("has all three counter fields initialised to zero", () => {
    expect(ADDED_TURNS_ZERO.reportRetry).toBe(0);
    expect(ADDED_TURNS_ZERO.postWork).toBe(0);
    expect(ADDED_TURNS_ZERO.outputRepair).toBe(0);
  });

  it("is frozen (immutable reference)", () => {
    expect(Object.isFrozen(ADDED_TURNS_ZERO)).toBe(true);
  });

  it("satisfies the invariant: reportRetry + outputRepair starts at 0 === followUpAttempts 0", () => {
    expect(ADDED_TURNS_ZERO.reportRetry + ADDED_TURNS_ZERO.outputRepair).toBe(0);
  });
});
