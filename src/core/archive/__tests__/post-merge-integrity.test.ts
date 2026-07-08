/**
 * Unit tests for runPostMergeIntegrityCheck.
 *
 * All tests use an injected SpawnFn fake — no real git or shell involved.
 *
 * TC-PMI-01: all commands exit 0 → { ok: true }; worktree add + remove + prune spawned;
 *             commands run via "sh" ["-c", cmd] in the worktree path in order.
 * TC-PMI-02: a command exits non-zero → { ok: false }; escalation contains PR number,
 *             merge SHA, failing command output, and remediation text; no revert/rollback
 *             git command spawned; merge fact stated as MERGED.
 * TC-PMI-03: fail-fast — after the first failing command, later commands are not spawned.
 * TC-PMI-04: git fetch failure → { ok: true } with a warning; no escalation; no worktree.
 * TC-PMI-05: worktree removal failure after a passing run → still { ok: true } (best-effort).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SpawnFn, SpawnResult } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Mock transport-auth so createTransportAuth.wrapSpawn is a passthrough
// (avoids real git remote get-url subprocess in unit tests)
// ---------------------------------------------------------------------------
vi.mock("../../../git/transport-auth.js", () => ({
  createTransportAuth: () => ({
    wrapSpawn: (base: SpawnFn) => base,
  }),
}));

// Mock logger to suppress stderr output in tests
vi.mock("../../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
}));

import { runPostMergeIntegrityCheck } from "../post-merge-integrity.js";
import { stderrWrite } from "../../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const FAKE_SLUG = "my-job";
const FAKE_PR = 99;
const FAKE_BASE = "main";
const FAKE_SHA = "abc1234567890def";
const FAKE_SHA7 = FAKE_SHA.slice(0, 7);
const FAKE_SHA8 = FAKE_SHA.slice(0, 8);

/** Build a SpawnFn that dispatches on cmd+args[0]+args[1]. */
function makeSpawnFn(overrides: Partial<Record<string, SpawnResult>> = {}): SpawnFn {
  const defaultOk: SpawnResult = { exitCode: 0, stdout: "", stderr: "" };

  const impl = vi.fn().mockImplementation(
    async (cmd: string, args: string[], _opts: { cwd: string }) => {
      const key = `${cmd} ${args.slice(0, 3).join(" ")}`.trim();
      for (const [pattern, result] of Object.entries(overrides)) {
        if (key.startsWith(pattern)) return result;
      }
      return defaultOk;
    },
  );
  return impl;
}

/** Extract all spawn calls as `cmd args...` strings. */
function spawnKeys(spawnFn: SpawnFn): string[] {
  const mock = spawnFn as ReturnType<typeof vi.fn>;
  return (mock.mock.calls as [string, string[], unknown][]).map(
    ([cmd, args]) => `${cmd} ${args.join(" ")}`,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runPostMergeIntegrityCheck", () => {
  beforeEach(() => {
    vi.mocked(stderrWrite).mockClear();
  });

  it("TC-PMI-01: all commands exit 0 → { ok: true }; worktree add/remove/prune issued; commands ran in order via sh -c", async () => {
    const spawnFn = makeSpawnFn({
      // git rev-parse returns the fake SHA
      "git rev-parse": { exitCode: 0, stdout: `${FAKE_SHA}\n`, stderr: "" },
    });

    const result = await runPostMergeIntegrityCheck({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      baseBranch: FAKE_BASE,
      commands: ["bun install --frozen-lockfile", { name: "typecheck", run: "bun run typecheck" }],
      spawn: spawnFn,
      prNumber: FAKE_PR,
    });

    expect(result).toEqual({ ok: true });

    const keys = spawnKeys(spawnFn);
    // fetch issued
    expect(keys).toContain(`git fetch origin ${FAKE_BASE}`);
    // rev-parse issued
    expect(keys).toContain(`git rev-parse origin/${FAKE_BASE}`);
    // worktree add issued with --detach
    const worktreeAddKey = keys.find((k) => k.startsWith("git worktree add --detach"));
    expect(worktreeAddKey).toBeDefined();
    // worktree path contains the slug and sha8
    expect(worktreeAddKey).toContain(FAKE_SLUG);
    expect(worktreeAddKey).toContain(FAKE_SHA8);
    // commands ran via sh -c inside the worktree
    const shCalls = (spawnFn as ReturnType<typeof vi.fn>).mock.calls as [string, string[], { cwd: string }][];
    const shInWorktree = shCalls.filter(([cmd, args, opts]) => {
      return cmd === "sh" && args[0] === "-c" && opts.cwd.includes(FAKE_SLUG);
    });
    expect(shInWorktree).toHaveLength(2);
    expect(shInWorktree[0]![1][1]).toBe("bun install --frozen-lockfile");
    expect(shInWorktree[1]![1][1]).toBe("bun run typecheck");
    // worktree remove issued
    const removeKey = keys.find((k) => k.startsWith("git worktree remove --force"));
    expect(removeKey).toBeDefined();
    // worktree prune issued
    expect(keys).toContain("git worktree prune");
  });

  it("TC-PMI-02: command exits non-zero → { ok: false }; escalation contains PR, SHA, output, remediation; no rollback; MERGED stated", async () => {
    const failOutput = "error: lockfiles conflict";
    const spawnFn = makeSpawnFn({
      "git rev-parse": { exitCode: 0, stdout: `${FAKE_SHA}\n`, stderr: "" },
      // The failing install command
      "sh -c bun install": { exitCode: 1, stdout: failOutput, stderr: "stderr detail" },
    });

    const result = await runPostMergeIntegrityCheck({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      baseBranch: FAKE_BASE,
      commands: ["bun install --frozen-lockfile"],
      spawn: spawnFn,
      prNumber: FAKE_PR,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return; // narrow type

    const { escalation } = result;

    // PR number attributed
    expect(escalation).toContain(`#${FAKE_PR}`);
    // Merge SHA attributed (7-char)
    expect(escalation).toContain(FAKE_SHA7);
    // Failing command output
    expect(escalation).toContain(failOutput);
    expect(escalation).toContain("stderr detail");
    // Merge fact stated (MERGED)
    expect(escalation).toContain("MERGED");
    // Remediation: not rolled back
    expect(escalation).toContain("NOT rolled back");
    // Remediation: fix steps mention the base branch
    expect(escalation).toContain(FAKE_BASE);

    // No revert / rollback git command
    const keys = spawnKeys(spawnFn);
    expect(keys.some((k) => k.includes("revert"))).toBe(false);
    expect(keys.some((k) => k.includes("rollback"))).toBe(false);
    expect(keys.some((k) => k.includes("reset"))).toBe(false);
  });

  it("TC-PMI-03: fail-fast — first failing command stops execution; later commands not spawned", async () => {
    const spawnFn = makeSpawnFn({
      "git rev-parse": { exitCode: 0, stdout: `${FAKE_SHA}\n`, stderr: "" },
      "sh -c bun install": { exitCode: 1, stdout: "install failed", stderr: "" },
    });

    const result = await runPostMergeIntegrityCheck({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      baseBranch: FAKE_BASE,
      commands: ["bun install --frozen-lockfile", "bun run test", "bun run typecheck"],
      spawn: spawnFn,
      prNumber: FAKE_PR,
    });

    expect(result.ok).toBe(false);

    // Only the first command should have been called via sh -c; the rest are skipped
    const shCalls = (spawnFn as ReturnType<typeof vi.fn>).mock.calls as [string, string[], unknown][];
    const shCmds = shCalls
      .filter(([cmd, args]) => cmd === "sh" && args[0] === "-c")
      .map(([, args]) => (args as string[])[1]);
    expect(shCmds).toHaveLength(1);
    expect(shCmds[0]).toBe("bun install --frozen-lockfile");
  });

  it("TC-PMI-04: git fetch failure → { ok: true } with a warning; no escalation; no worktree created", async () => {
    const spawnFn = makeSpawnFn({
      "git fetch": { exitCode: 128, stdout: "", stderr: "fatal: unable to connect" },
    });

    const result = await runPostMergeIntegrityCheck({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      baseBranch: FAKE_BASE,
      commands: ["bun install --frozen-lockfile"],
      spawn: spawnFn,
      prNumber: FAKE_PR,
    });

    expect(result).toEqual({ ok: true });

    // Warning emitted
    expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(
      expect.stringContaining("NOT verified"),
    );

    // No worktree add spawned
    const keys = spawnKeys(spawnFn);
    expect(keys.some((k) => k.startsWith("git worktree add"))).toBe(false);
  });

  it("TC-PMI-05: worktree removal failure after passing run → still { ok: true } (best-effort)", async () => {
    const spawnFn = makeSpawnFn({
      "git rev-parse": { exitCode: 0, stdout: `${FAKE_SHA}\n`, stderr: "" },
      // worktree remove fails
      "git worktree remove": { exitCode: 1, stdout: "", stderr: "fatal: cannot remove" },
    });

    const result = await runPostMergeIntegrityCheck({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      baseBranch: FAKE_BASE,
      commands: ["bun install --frozen-lockfile"],
      spawn: spawnFn,
      prNumber: FAKE_PR,
    });

    // Still ok: true — worktree cleanup is best-effort
    expect(result).toEqual({ ok: true });

    // A warning about the cleanup failure is emitted
    expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(
      expect.stringContaining("integrity worktree"),
    );
  });
});
