/**
 * Tests for updated PRUNE_USAGE and help line in command-registry.ts.
 *
 * TC-023: PRUNE_USAGE and top-level help line mention both worktrees and sidecars
 */
import { describe, it, expect } from "vitest";
import { PRUNE_USAGE, USAGE } from "../../../src/cli/command-registry.js";

// ---------------------------------------------------------------------------
// TC-023: PRUNE_USAGE and top-level help line mention both worktrees and sidecars
// ---------------------------------------------------------------------------

describe("TC-023: PRUNE_USAGE describes both orphan worktrees and orphan sidecars", () => {
  it("PRUNE_USAGE mentions orphan worktrees", () => {
    expect(PRUNE_USAGE.toLowerCase()).toContain("worktree");
  });

  it("PRUNE_USAGE mentions orphan sidecars", () => {
    expect(PRUNE_USAGE.toLowerCase()).toContain("sidecar");
  });

  it("PRUNE_USAGE mentions --force flag behavior for both resource kinds", () => {
    expect(PRUNE_USAGE).toContain("--force");
  });

  it("PRUNE_USAGE describes dry-run behavior", () => {
    // dry-run is the default — should be described
    expect(PRUNE_USAGE.toLowerCase()).toMatch(/dry-?run|without deleting|lists/);
  });
});

describe("TC-023: top-level USAGE help line for job prune mentions both resource kinds", () => {
  it("the job prune line in USAGE mentions sidecars", () => {
    // The help line currently says "orphan worktree を列挙（--force で削除）"
    // After the change, it should mention sidecars too
    const pruneLine = USAGE
      .split("\n")
      .find((line) => line.includes("job prune"));

    expect(pruneLine).toBeDefined();
    expect(pruneLine!.toLowerCase()).toContain("sidecar");
  });

  it("the job prune line in USAGE still mentions worktrees", () => {
    const pruneLine = USAGE
      .split("\n")
      .find((line) => line.includes("job prune"));

    expect(pruneLine).toBeDefined();
    expect(pruneLine!.toLowerCase()).toMatch(/worktree|孤立/);
  });
});
