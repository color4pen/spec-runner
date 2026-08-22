/**
 * Tests for origin/<baseBranch> fallback behavior in changed-lines.ts.
 *
 * In git worktree environments where the base branch (e.g. "main") is not
 * available as a local ref, getChangedFilesAndLines and getChangedFileList
 * automatically fall back to origin/<baseBranch>.
 *
 * TC-OFB-01: getChangedFilesAndLines — primary fails, origin fallback succeeds
 * TC-OFB-02: getChangedFilesAndLines — both fail → throws original error (fail-closed)
 * TC-OFB-03: getChangedFileList — primary fails, origin fallback succeeds
 * TC-OFB-04: getChangedFileList — both fail → throws (fail-closed, callers skip)
 * TC-OFB-05: getChangedFilesAndLines — per-file diff uses effectiveBase (origin/) after fallback
 * TC-OFB-06: getChangedFilesAndLines — primary succeeds → no fallback attempted
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import {
  getChangedFilesAndLines,
  getChangedFileList,
} from "../../../../src/core/verification/changed-lines.js";
import type { SpawnFn } from "../../../../src/core/verification/changed-lines.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SpawnResponse {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Build a SpawnFn that returns responses from a sequence (one per call).
 * Excess calls return { exitCode: 0, stdout: "" }.
 * Also records all calls for assertion.
 */
function makeSequentialSpawn(
  responses: SpawnResponse[],
): { spawn: SpawnFn; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  let idx = 0;

  const spawn = ((cmd: string, args: string[], _opts?: object) => {
    calls.push({ cmd, args: [...(args as string[])] });
    const response = responses[idx++] ?? { exitCode: 0, stdout: "" };

    const emitter = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();

    setImmediate(() => {
      if (response.stdout) emitter.stdout.emit("data", Buffer.from(response.stdout));
      if (response.stderr) emitter.stderr.emit("data", Buffer.from(response.stderr));
      emitter.emit("close", response.exitCode);
    });

    return emitter;
  }) as unknown as SpawnFn;

  return { spawn, calls };
}

// ---------------------------------------------------------------------------
// TC-OFB-01: getChangedFilesAndLines — primary fails, origin fallback succeeds
// ---------------------------------------------------------------------------

describe("TC-OFB-01: getChangedFilesAndLines — primary baseBranch fails, origin fallback succeeds", () => {
  it("returns file list from origin/<baseBranch> when <baseBranch>...HEAD is unavailable", async () => {
    const { spawn, calls } = makeSequentialSpawn([
      // Call 0: primary "git diff --name-only main...HEAD" → fails (128)
      { exitCode: 128, stderr: "fatal: ambiguous argument 'main...HEAD': unknown revision" },
      // Call 1: fallback "git diff --name-only origin/main...HEAD" → succeeds
      { exitCode: 0, stdout: "src/core/foo.ts\n" },
      // Call 2: per-file diff for src/core/foo.ts → succeeds
      { exitCode: 0, stdout: "@@ -0,0 +1,5 @@\n" },
    ]);

    const result = await getChangedFilesAndLines({
      cwd: "/fake-repo",
      baseBranch: "main",
      spawn,
    });

    expect(result.size).toBe(1);
    expect(result.has("src/core/foo.ts")).toBe(true);
    // Changed lines from @@ -0,0 +1,5 @@: lines 1..5
    const lines = result.get("src/core/foo.ts")!;
    expect(lines.has(1)).toBe(true);
    expect(lines.has(5)).toBe(true);

    // Verify call sequence
    expect(calls).toHaveLength(3);
    // First call: primary baseBranch
    expect(calls[0]?.args).toContain("main...HEAD");
    // Second call: origin fallback
    expect(calls[1]?.args).toContain("origin/main...HEAD");
  });
});

// ---------------------------------------------------------------------------
// TC-OFB-02: getChangedFilesAndLines — both fail → throws original error
// ---------------------------------------------------------------------------

describe("TC-OFB-02: getChangedFilesAndLines — both primary and origin fallback fail → throws", () => {
  it("throws with error message referencing primary baseBranch when both attempts fail", async () => {
    const { spawn } = makeSequentialSpawn([
      // Call 0: primary fails
      { exitCode: 128, stderr: "fatal: ambiguous argument 'main...HEAD'" },
      // Call 1: fallback also fails
      { exitCode: 128, stderr: "fatal: ambiguous argument 'origin/main...HEAD'" },
    ]);

    await expect(
      getChangedFilesAndLines({ cwd: "/fake-repo", baseBranch: "main", spawn }),
    ).rejects.toThrow("changed-line derivation failed");

    // Error message should reference the primary baseBranch (not origin/)
    await expect(
      getChangedFilesAndLines({ cwd: "/fake-repo", baseBranch: "main", spawn: makeSequentialSpawn([
        { exitCode: 128, stderr: "fatal: bad revision" },
        { exitCode: 128, stderr: "fatal: bad revision" },
      ]).spawn }),
    ).rejects.toThrow("main...HEAD");
  });
});

// ---------------------------------------------------------------------------
// TC-OFB-03: getChangedFileList — primary fails, origin fallback succeeds
// ---------------------------------------------------------------------------

describe("TC-OFB-03: getChangedFileList — primary baseBranch fails, origin fallback succeeds", () => {
  it("returns file list from origin/<baseBranch> when <baseBranch>...HEAD is unavailable", async () => {
    const { spawn, calls } = makeSequentialSpawn([
      // Call 0: primary fails
      { exitCode: 128, stderr: "fatal: ambiguous argument 'main...HEAD'" },
      // Call 1: origin fallback succeeds
      { exitCode: 0, stdout: "src/index.ts\npackage.json\n" },
    ]);

    const result = await getChangedFileList({
      cwd: "/fake-repo",
      baseBranch: "main",
      spawn,
    });

    expect(result).toEqual(["src/index.ts", "package.json"]);

    // Verify call sequence
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toContain("main...HEAD");
    expect(calls[1]?.args).toContain("origin/main...HEAD");
  });
});

// ---------------------------------------------------------------------------
// TC-OFB-04: getChangedFileList — both fail → throws
// ---------------------------------------------------------------------------

describe("TC-OFB-04: getChangedFileList — both primary and origin fallback fail → throws", () => {
  it("throws when both primary and origin fallback fail (callers like lockfile-sync will skip)", async () => {
    const { spawn } = makeSequentialSpawn([
      // Both fail
      { exitCode: 128, stderr: "fatal: ambiguous argument 'main...HEAD'" },
      { exitCode: 128, stderr: "fatal: ambiguous argument 'origin/main...HEAD'" },
    ]);

    await expect(
      getChangedFileList({ cwd: "/fake-repo", baseBranch: "main", spawn }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-OFB-05: getChangedFilesAndLines — per-file diff uses effectiveBase after fallback
// ---------------------------------------------------------------------------

describe("TC-OFB-05: getChangedFilesAndLines — per-file diff uses origin/<baseBranch> after fallback", () => {
  it("per-file git diff uses origin/<baseBranch> as the ref when that was the successful fallback", async () => {
    const { spawn, calls } = makeSequentialSpawn([
      // Call 0: primary name-only fails
      { exitCode: 128, stderr: "fatal: unknown revision" },
      // Call 1: origin name-only succeeds with two files
      { exitCode: 0, stdout: "src/a.ts\nsrc/b.ts\n" },
      // Call 2: per-file diff for src/a.ts
      { exitCode: 0, stdout: "@@ -0,0 +1,2 @@\n" },
      // Call 3: per-file diff for src/b.ts
      { exitCode: 0, stdout: "@@ -0,0 +3,1 @@\n" },
    ]);

    await getChangedFilesAndLines({
      cwd: "/fake-repo",
      baseBranch: "main",
      spawn,
    });

    // calls[2] and calls[3] are per-file diffs — they must use origin/main
    expect(calls[2]?.args).toContain("origin/main...HEAD");
    expect(calls[3]?.args).toContain("origin/main...HEAD");
    // And must NOT use the bare "main" ref
    expect(calls[2]?.args).not.toContain("main...HEAD");
    expect(calls[3]?.args).not.toContain("main...HEAD");
  });
});

// ---------------------------------------------------------------------------
// TC-OFB-06: getChangedFilesAndLines — primary succeeds → no fallback attempted
// ---------------------------------------------------------------------------

describe("TC-OFB-06: getChangedFilesAndLines — primary succeeds → fallback not attempted", () => {
  it("when primary baseBranch succeeds, only one --name-only git call is made", async () => {
    const { spawn, calls } = makeSequentialSpawn([
      // Call 0: primary succeeds
      { exitCode: 0, stdout: "src/foo.ts\n" },
      // Call 1: per-file diff
      { exitCode: 0, stdout: "@@ -0,0 +1,3 @@\n" },
    ]);

    await getChangedFilesAndLines({
      cwd: "/fake-repo",
      baseBranch: "main",
      spawn,
    });

    // Only 2 calls: one name-only and one per-file diff (no origin fallback)
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toContain("main...HEAD");
    // Second call is the per-file diff — no origin fallback call in between
    expect(calls[1]?.args).not.toContain("origin/main...HEAD");
  });
});
