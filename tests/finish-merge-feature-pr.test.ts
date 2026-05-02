/**
 * Tests for finish command: feature PR merge step.
 *
 * TC-015: OPEN_MERGEABLE → gh pr merge --squash --delete-branch
 * TC-016: OPEN_CHECKS_FAILING + --force → gh pr merge --squash --delete-branch --admin
 * TC-017: MERGED → skip
 * TC-018: --cleanup-only → skip
 * TC-019: OPEN_BEHIND → escalation
 * TC-020: OPEN_CONFLICTS → escalation
 * TC-021: OPEN_CHECKS_FAILING no --force → escalation with --force hint
 * TC-042: gh non-zero exit → escalation
 * TC-059: --force on OPEN_BEHIND/OPEN_CONFLICTS → still escalation
 */
import { describe, it, expect, vi } from "vitest";
import { mergeFeaturePr } from "../src/core/finish/merge-feature-pr.js";
import type { SpawnFn } from "../src/util/spawn.js";

function makeSpawn(exitCode: number, stdout = "", stderr = ""): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr });
}

const BASE = {
  prNumber: 42,
  cwd: "/repo",
  jobId: "test-job-id",
};

// TC-015
describe("TC-015: OPEN_MERGEABLE → gh pr merge --squash --delete-branch", () => {
  it("calls gh pr merge with correct args for OPEN_MERGEABLE", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_MERGEABLE",
      force: false,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[0]).toBe("gh");
    expect(callArgs[1]).toContain("merge");
    expect(callArgs[1]).toContain("42");
    expect(callArgs[1]).toContain("--squash");
    expect(callArgs[1]).toContain("--delete-branch");
    expect(callArgs[1]).not.toContain("--admin");
  });
});

// TC-016
describe("TC-016: OPEN_CHECKS_FAILING + --force → admin merge", () => {
  it("calls gh pr merge with --admin when --force and OPEN_CHECKS_FAILING", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_CHECKS_FAILING",
      force: true,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[1]).toContain("--admin");
  });
});

// TC-017
describe("TC-017: MERGED → skip with message", () => {
  it("skips merge when PR is already MERGED", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "MERGED",
      force: false,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("already merged");
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// TC-018
describe("TC-018: --cleanup-only → skip merge", () => {
  it("skips merge when --cleanup-only is set", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_MERGEABLE",
      force: false,
      cleanupOnly: true,
      spawn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("cleanup-only");
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// TC-019
describe("TC-019: OPEN_BEHIND → escalation with rebase hint", () => {
  it("returns escalation with OPEN_BEHIND state", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_BEHIND",
      force: false,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("OPEN_BEHIND");
    expect(result.escalation).toContain("merge-feature-pr");
    expect(result.escalation).toContain("rebase");
  });
});

// TC-020
describe("TC-020: OPEN_CONFLICTS → escalation", () => {
  it("returns escalation with OPEN_CONFLICTS state", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_CONFLICTS",
      force: false,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("OPEN_CONFLICTS");
    expect(result.escalation).toContain("conflict");
  });
});

// TC-021
describe("TC-021: OPEN_CHECKS_FAILING no --force → escalation with --force hint", () => {
  it("returns escalation including --force hint", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_CHECKS_FAILING",
      force: false,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation).toContain("OPEN_CHECKS_FAILING");
    expect(result.escalation).toContain("--force");
  });
});

// TC-042
describe("TC-042: gh non-zero exit → escalation", () => {
  it("returns escalation when gh pr merge exits non-zero", async () => {
    const spawn = makeSpawn(1, "", "merge failed: protected branch");

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_MERGEABLE",
      force: false,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("merge-feature-pr");
  });
});

// TC-059: --force on OPEN_BEHIND/OPEN_CONFLICTS → still escalation
describe("TC-059: --force on OPEN_BEHIND/OPEN_CONFLICTS still escalates", () => {
  it("escalates OPEN_BEHIND even with --force", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_BEHIND",
      force: true,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation).toContain("OPEN_BEHIND");
  });

  it("escalates OPEN_CONFLICTS even with --force", async () => {
    const spawn = makeSpawn(0);

    const result = await mergeFeaturePr({
      ...BASE,
      prState: "OPEN_CONFLICTS",
      force: true,
      cleanupOnly: false,
      spawn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation).toContain("OPEN_CONFLICTS");
  });
});
