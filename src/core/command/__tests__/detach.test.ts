/**
 * Tests for src/core/command/detach.ts
 *
 * TC-001 (old): `--detach` 指定で detached spawn が正しい形で行われる
 *               Updated: now injects ack seams and awaits async detachSelf
 * TC-002 (old): detach 親は pipeline を実行せず登録後に案内して exit 0 する
 *               Updated: simulates registration via readSidecarPid seam
 * TC-003 (old): 破壊確認 — detached / マーカーを外すとテストが落ちる
 *               Updated: spawn-shape assertions remain valid in async context
 * TC-011 (new): マーカー付き子は foreground を実行し spawn しない
 *               (isDetachedChild gate — unchanged behavior)
 *
 * Note: The ack-loop specific TCs (TC-001 through TC-014 in test-cases.md)
 *       are in detach-ack.test.ts. This file focuses on spawn-shape,
 *       guidance output, and the isDetachedChild gate.
 */
import { describe, it, expect, vi } from "vitest";
import type { BackgroundProcessHandle, SpawnBackgroundFn, SpawnBackgroundOptions } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  DETACH_MARKER_ENV,
  isDetachedChild,
  stripDetachFlag,
  buildDetachGuidance,
  detachSelf,
  type DetachSelfDeps,
} from "../detach.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHILD_PID = 9999;

interface SpawnCapture {
  spawnFn: SpawnBackgroundFn;
  calls: Array<{ cmd: string; args: string[]; opts: SpawnBackgroundOptions }>;
  triggerExit: (code: number | null) => void;
  triggerError: (err: Error) => void;
}

/** Create a spy SpawnBackgroundFn that records calls and exposes event triggers. */
function makeSpawnSpy(pid: number = CHILD_PID): SpawnCapture {
  const calls: Array<{ cmd: string; args: string[]; opts: SpawnBackgroundOptions }> = [];
  let capturedOnExit: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  let capturedOnError: ((err: Error) => void) | undefined;

  const spawnFn: SpawnBackgroundFn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    capturedOnExit = opts.onExit;
    capturedOnError = opts.onError;
    return {
      pid,
      kill() {},
    } satisfies BackgroundProcessHandle;
  };

  return {
    spawnFn,
    calls,
    triggerExit: (code) => capturedOnExit?.(code, null),
    triggerError: (err) => capturedOnError?.(err),
  };
}

/**
 * Minimal ack deps that immediately resolves SUCCESS (immediate registration).
 * Injects the provided spawnFn and resolves on the first poll.
 */
function makeImmediateAckDeps(spawnFn: SpawnBackgroundFn): DetachSelfDeps {
  return {
    spawnFn,
    readSidecarPid: () => CHILD_PID, // immediate registration
    readDetachLogTail: () => "",
    sleep: async () => {},
    pollIntervalMs: 0,
  };
}

// ---------------------------------------------------------------------------
// DETACH_MARKER_ENV constant
// ---------------------------------------------------------------------------

describe("DETACH_MARKER_ENV", () => {
  it("is the string 'SPECRUNNER_DETACHED'", () => {
    expect(DETACH_MARKER_ENV).toBe("SPECRUNNER_DETACHED");
  });
});

// ---------------------------------------------------------------------------
// isDetachedChild
// ---------------------------------------------------------------------------

describe("isDetachedChild", () => {
  it("returns true when marker env is set to '1'", () => {
    expect(isDetachedChild({ [DETACH_MARKER_ENV]: "1" })).toBe(true);
  });

  it("returns true when marker env is set to any truthy string", () => {
    expect(isDetachedChild({ [DETACH_MARKER_ENV]: "true" })).toBe(true);
  });

  it("returns false when marker env is absent", () => {
    expect(isDetachedChild({})).toBe(false);
  });

  it("returns false when marker env is undefined", () => {
    expect(isDetachedChild({ [DETACH_MARKER_ENV]: undefined })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripDetachFlag
// ---------------------------------------------------------------------------

describe("stripDetachFlag", () => {
  it("removes --detach from args, leaving others intact", () => {
    expect(stripDetachFlag(["run", "foo", "--detach", "--no-worktree"])).toEqual([
      "run",
      "foo",
      "--no-worktree",
    ]);
  });

  it("removes --detach=<value> variant", () => {
    expect(stripDetachFlag(["run", "foo", "--detach=true"])).toEqual(["run", "foo"]);
  });

  it("removes multiple --detach occurrences", () => {
    expect(stripDetachFlag(["--detach", "run", "--detach", "foo"])).toEqual(["run", "foo"]);
  });

  it("returns unchanged args when --detach is absent", () => {
    expect(stripDetachFlag(["run", "foo", "--no-worktree"])).toEqual([
      "run",
      "foo",
      "--no-worktree",
    ]);
  });

  it("does not remove flags that only contain 'detach' as substring (e.g. --no-detach)", () => {
    // Only exact --detach and --detach=... are stripped
    const result = stripDetachFlag(["run", "--no-detach", "foo"]);
    expect(result).toContain("--no-detach");
  });
});

// ---------------------------------------------------------------------------
// buildDetachGuidance
// ---------------------------------------------------------------------------

describe("buildDetachGuidance", () => {
  it("includes the slug in the output", () => {
    const guidance = buildDetachGuidance("my-feature");
    expect(guidance).toContain("my-feature");
  });

  it("includes 'job wait' command with slug", () => {
    const guidance = buildDetachGuidance("my-feature");
    expect(guidance).toContain("job wait");
    expect(guidance).toContain("my-feature");
  });

  it("includes 'job show' command with slug", () => {
    const guidance = buildDetachGuidance("my-feature");
    expect(guidance).toContain("job show");
    expect(guidance).toContain("my-feature");
  });
});

// ---------------------------------------------------------------------------
// TC-001 (old): `--detach` 指定で detached spawn が正しい形で行われる
// Updated: now uses async detachSelf with injected ack seams
// ---------------------------------------------------------------------------

describe("TC-001: detachSelf — detached spawn が正しい形で行われる (async)", () => {
  it("TC-001: spawns child with detached: true", async () => {
    const { spawnFn, calls } = makeSpawnSpy();

    await detachSelf(
      {
        args: ["run", "my-slug", "--detach"],
        repoRoot: "/repo",
        slug: "my-slug",
        env: { PATH: "/usr/bin" },
      },
      makeImmediateAckDeps(spawnFn),
    );

    expect(calls).toHaveLength(1);
    const opts = calls[0]!.opts as unknown as Record<string, unknown>;
    expect(opts["detached"]).toBe(true);
  });

  it("TC-001: spawn args have --detach removed", async () => {
    const { spawnFn, calls } = makeSpawnSpy();

    await detachSelf(
      {
        args: ["run", "my-slug", "--detach", "--no-worktree"],
        repoRoot: "/repo",
        slug: "my-slug",
        env: { PATH: "/usr/bin" },
      },
      makeImmediateAckDeps(spawnFn),
    );

    const spawnedArgs = calls[0]!.args;
    expect(spawnedArgs).not.toContain("--detach");
    expect(spawnedArgs).toContain("--no-worktree");
  });

  it("TC-001: spawn opts include logFilePath (stdio log redirect)", async () => {
    const { spawnFn, calls } = makeSpawnSpy();

    await detachSelf(
      {
        args: ["run", "my-slug", "--detach"],
        repoRoot: "/repo",
        slug: "my-slug",
        env: { PATH: "/usr/bin" },
      },
      makeImmediateAckDeps(spawnFn),
    );

    const opts = calls[0]!.opts as unknown as Record<string, unknown>;
    // logFilePath must be set (the detach log path for slug "my-slug")
    expect(opts["logFilePath"]).toBeDefined();
    expect(typeof opts["logFilePath"]).toBe("string");
    expect((opts["logFilePath"] as string)).toContain("my-slug");
  });

  it("TC-001: child env includes the internal marker", async () => {
    const { spawnFn, calls } = makeSpawnSpy();

    await detachSelf(
      {
        args: ["run", "my-slug", "--detach"],
        repoRoot: "/repo",
        slug: "my-slug",
        env: { PATH: "/usr/bin", GITHUB_TOKEN: "gh-token" },
      },
      makeImmediateAckDeps(spawnFn),
    );

    const opts = calls[0]!.opts as unknown as Record<string, unknown>;
    const rawEnv = opts["rawEnv"] as Record<string, string | undefined>;
    expect(rawEnv).toBeDefined();
    expect(rawEnv[DETACH_MARKER_ENV]).toBeTruthy();
  });

  it("TC-001: spawn is called exactly once", async () => {
    const { spawnFn, calls } = makeSpawnSpy();

    await detachSelf(
      {
        args: ["run", "my-slug", "--detach"],
        repoRoot: "/repo",
        slug: "my-slug",
        env: { PATH: "/usr/bin" },
      },
      makeImmediateAckDeps(spawnFn),
    );

    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-002 (old): detach 親は pipeline を実行せず登録後に案内して exit 0 する
// Updated: simulates registration via readSidecarPid seam
// ---------------------------------------------------------------------------

describe("TC-002: detachSelf — 登録完了後に案内して exit 0 する (async)", () => {
  it("TC-002: detachSelf returns EXIT_CODE.SUCCESS (0) after registration", async () => {
    const { spawnFn } = makeSpawnSpy();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      const code = await detachSelf(
        {
          args: ["run", "my-slug", "--detach"],
          repoRoot: "/repo",
          slug: "my-slug",
          env: { PATH: "/usr/bin" },
        },
        makeImmediateAckDeps(spawnFn),
      );
      expect(code).toBe(0);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("TC-002: parent outputs guidance to stdout (slug, job wait, job show)", async () => {
    const { spawnFn } = makeSpawnSpy();
    const stdoutOutput: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutOutput.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    try {
      await detachSelf(
        {
          args: ["run", "my-slug", "--detach"],
          repoRoot: "/repo",
          slug: "my-slug",
          env: { PATH: "/usr/bin" },
        },
        makeImmediateAckDeps(spawnFn),
      );

      const combined = stdoutOutput.join("");
      expect(combined).toContain("my-slug");
      expect(combined).toContain("job wait");
      expect(combined).toContain("job show");
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("TC-002: detachSelf does not invoke preflight/auth/config (only spawn once)", async () => {
    const { spawnFn, calls } = makeSpawnSpy();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      const code = await detachSelf(
        {
          args: ["run", "my-slug", "--detach"],
          repoRoot: "/repo",
          slug: "my-slug",
          env: { PATH: "/usr/bin" },
        },
        makeImmediateAckDeps(spawnFn),
      );
      expect(code).toBe(0);
      expect(calls).toHaveLength(1); // exactly one spawn, no pipeline
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-003 (old): 破壊確認 — detached / マーカーを外すとテストが落ちる
// Updated: spawn-shape tooth still works in async context
// ---------------------------------------------------------------------------

describe("TC-003: 破壊確認 — 歯が効いている確認 (async)", () => {
  it("TC-003: fails when detached is NOT true (simulates removing detached:true from impl)", async () => {
    const { spawnFn, calls } = makeSpawnSpy();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      await detachSelf(
        {
          args: ["run", "my-slug", "--detach"],
          repoRoot: "/repo",
          slug: "my-slug",
          env: { PATH: "/usr/bin" },
        },
        makeImmediateAckDeps(spawnFn),
      );

      const opts = calls[0]!.opts as unknown as Record<string, unknown>;
      // This assertion is the tooth: if implementation removes detached:true, this fails
      expect(opts["detached"]).toBe(true);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("TC-003: fails when marker env is NOT set (simulates removing marker from impl)", async () => {
    const { spawnFn, calls } = makeSpawnSpy();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      await detachSelf(
        {
          args: ["run", "my-slug", "--detach"],
          repoRoot: "/repo",
          slug: "my-slug",
          env: { PATH: "/usr/bin" },
        },
        makeImmediateAckDeps(spawnFn),
      );

      const opts = calls[0]!.opts as unknown as Record<string, unknown>;
      const rawEnv = opts["rawEnv"] as Record<string, string | undefined>;
      // This assertion is the tooth: if implementation removes marker, this fails
      expect(rawEnv).toBeDefined();
      expect(rawEnv[DETACH_MARKER_ENV]).toBeTruthy();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-011 (new test-cases.md): マーカー付き子は foreground を実行し spawn しない
// ---------------------------------------------------------------------------

describe("TC-011: マーカー付き子は foreground を実行し spawn しない", () => {
  it("TC-011: isDetachedChild returns true when marker env is set", () => {
    // This is the gate: when marker is set, the caller must NOT call detachSelf
    const env = { [DETACH_MARKER_ENV]: "1", PATH: "/usr/bin" };
    expect(isDetachedChild(env)).toBe(true);
  });

  it("TC-011: isDetachedChild returns false when marker env is absent", () => {
    const env = { PATH: "/usr/bin" };
    expect(isDetachedChild(env)).toBe(false);
  });

  it("TC-011: when isDetachedChild is true, no spawn should occur (contract via caller guard)", () => {
    // The actual routing logic is in the CLI handler (command-registry.ts).
    // Here we verify that isDetachedChild correctly identifies the child context,
    // which is the precondition for the CLI guard to skip detachSelf.
    const childEnv = { [DETACH_MARKER_ENV]: "1", GITHUB_TOKEN: "token", PATH: "/usr/bin" };
    const parentEnv = { PATH: "/usr/bin" };

    expect(isDetachedChild(childEnv)).toBe(true);
    expect(isDetachedChild(parentEnv)).toBe(false);
  });
});
