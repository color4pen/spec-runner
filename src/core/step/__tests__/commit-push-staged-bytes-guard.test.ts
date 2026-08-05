/**
 * Integration tests for the guarded staged byte-size guard in commitAndPush.
 *
 * Covers:
 *   TC-030 (must): Over-byte staged set halts before commit — file count under its own limit
 *   TC-031 (must): At-or-below byte threshold proceeds to commit and push normally
 *   TC-032 (must): Delete-pending path contributes zero bytes and does not misfire the guard
 *   TC-033 (must): Non-ENOENT measurement failure halts fail-closed before commit
 *   TC-041 (must): Byte guard fires independently when file count is under its limit but bytes over
 *   TC-042 (must): Over-byte halt error message contains total bytes, threshold, and per-directory breakdown
 *
 * RED state: all tests fail until:
 *   - T-01: measureStagedBytes, resolveMaxStagedBytes, summarizeTopDirectoriesBySize added to staging-containment.ts
 *   - T-02: STAGED_BYTES_LIMIT_EXCEEDED + stagedBytesLimitExceededError added to errors.ts
 *   - T-03: Byte guard wired into commitAndPush guarded branch, statFn added to CommitPushInfra
 *   - T-04: maxStagedBytes added to PipelineConfig type
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";

import { commitAndPush } from "../commit-push.js";
import type { CommitPushInfra } from "../commit-push.js";
import { EventBus } from "../../event/event-bus.js";
import type { SpawnFn } from "../../../util/git-exec.js";
import type { AgentStep } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { StagedPathSizeProbe } from "../staging-containment.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-repo-byte-guard-test";
const BRANCH = "change/byte-guard-test-abc12345";
const SLUG = "byte-guard-slug";

/** Declared output path for the implementer (guarded, non-canon) */
const GUARDED_IMPL_PATH = "src/impl-byte-001.ts";

// ---------------------------------------------------------------------------
// Helper: ChildProcess-based SpawnFn mock
// (Copied from commit-push-guarded-staging.test.ts — do NOT import from that file)
// ---------------------------------------------------------------------------

/**
 * Build a git-exec.ts SpawnFn returning fake ChildProcess instances.
 * Each call consumes the next response. Excess calls return exit 0.
 * Tracks all args in `calls`.
 */
function makeGitSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  let idx = 0;

  const fn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push([...args]);
    const response = responses[idx++] ?? { exitCode: 0 };
    const proc = new EventEmitter() as unknown as ChildProcess;
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    proc.stdout = stdoutEE as never;
    proc.stderr = stderrEE as never;
    proc.stdin = { end: () => {} } as never;
    setImmediate(() => {
      if (response.stdout) stdoutEE.emit("data", Buffer.from(response.stdout));
      if (response.stderr) stderrEE.emit("data", Buffer.from(response.stderr));
      proc.emit("close", response.exitCode);
    });
    return proc;
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// Helpers: infra, state, deps, steps
// ---------------------------------------------------------------------------

/**
 * Build infra with an optional injected statFn (size probe).
 * When statFn is omitted, the default fs.lstat probe will be used
 * (but in tests we always inject a fake probe via statFn).
 */
function makeInfra(spawnFn: SpawnFn, statFn?: StagedPathSizeProbe): CommitPushInfra {
  return {
    spawnFn,
    sleepFn: vi.fn(async () => {}),
    events: new EventBus(),
    ...(statFn !== undefined ? { statFn } : {}),
  };
}

function makeState(stepName = "implementer"): JobState {
  return {
    version: 2,
    jobId: "byte-guard-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: stepName as never,
    status: "running",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
    synthesizedCommits: [],
  };
}

function makeDeps(pipelineConfig: Record<string, unknown> = {}): PipelineDeps {
  return {
    cwd: CWD,
    slug: SLUG,
    config: {
      version: 1,
      agents: {},
      ...(Object.keys(pipelineConfig).length > 0 ? { pipeline: pipelineConfig } : {}),
    } as never,
    request: {
      type: "bug-fix",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "Test request",
      adr: false,
      path: `specrunner/changes/${SLUG}/request.md`,
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "octo",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) as never,
    storeFactory: () => ({} as never),
  } as unknown as PipelineDeps;
}

/** guarded-mode step (implementer) */
function makeGuardedStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: { id: "implementer-agent" } as never,
    buildMessage: () => "implementer message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
    writes: () => [{ path: GUARDED_IMPL_PATH }],
  } as unknown as AgentStep;
}

/**
 * Build a porcelain -z status entry.
 * xy = 2-char status (e.g. "??" for untracked, " M" for worktree-modified).
 */
function statusEntry(xy: string, path: string): string {
  return `${xy} ${path}\0`;
}

/**
 * Build a size probe (StagedPathSizeProbe) from a map of path basename → size.
 * Paths not in the map throw ENOENT (simulating delete-pending).
 */
function makeSizeProbe(sizeMap: Map<string, number>): StagedPathSizeProbe {
  return async (absPath: string) => {
    // Match by the last segment of the absPath against the map keys
    for (const [key, size] of sizeMap.entries()) {
      if (absPath.endsWith(key)) {
        return { size };
      }
    }
    // Not found → simulate ENOENT (delete-pending)
    const err = Object.assign(
      new Error(`ENOENT: no such file, lstat '${absPath}'`),
      { code: "ENOENT" },
    );
    throw err;
  };
}

/**
 * Build a probe that throws a non-ENOENT error for the given path substring.
 */
function makeFailProbe(failPathSubstring: string, defaultSize = 100): StagedPathSizeProbe {
  return async (absPath: string) => {
    if (absPath.includes(failPathSubstring)) {
      const err = Object.assign(
        new Error(`EACCES: permission denied, lstat '${absPath}'`),
        { code: "EACCES" },
      );
      throw err;
    }
    return { size: defaultSize };
  };
}

// ---------------------------------------------------------------------------
// TC-030: Over-byte staged set halts before commit — file count under its own limit
// ---------------------------------------------------------------------------

describe("TC-030: over-byte staged set halts before commit — file count under its own limit", () => {
  it(
    // TC-030
    "TC-030: rejects with STAGED_BYTES_LIMIT_EXCEEDED; no git add/commit/push is invoked",
    async () => {
      // GIVEN: a few files whose count is ≤ maxStagedFiles (default 2000)
      // but whose injected sizes sum over a small maxStagedBytes (e.g. 500 bytes)
      const statusOut =
        statusEntry(" M", "src/a.ts") +
        statusEntry(" M", "src/b.ts");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" }, // rev-parse HEAD
        { exitCode: 0, stdout: statusOut },       // status
        // byte guard fires before git add — no further git calls expected
      ]);

      // sizes: src/a.ts = 300 bytes, src/b.ts = 300 bytes → total 600 > maxStagedBytes: 500
      const sizeMap = new Map([
        ["src/a.ts", 300],
        ["src/b.ts", 300],
      ]);
      const statFn = makeSizeProbe(sizeMap);

      // WHEN commitAndPush runs guarded branch with maxStagedBytes: 500
      // THEN it rejects with STAGED_BYTES_LIMIT_EXCEEDED before any staging/commit/push
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedBytes: 500 }),
          null,
          makeInfra(fn, statFn),
        ),
      ).rejects.toMatchObject({ code: "STAGED_BYTES_LIMIT_EXCEEDED" });

      // AND no destructive git calls were made (add/commit/push)
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("add");
      expect(subcommands).not.toContain("commit");
      expect(subcommands).not.toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-031: At-or-below byte threshold proceeds to commit and push normally
// ---------------------------------------------------------------------------

describe("TC-031: at-or-below byte threshold proceeds to commit and push normally", () => {
  it(
    // TC-031
    "TC-031: sizes sum ≤ maxStagedBytes (and count ≤ maxStagedFiles) → commit and push proceed",
    async () => {
      // GIVEN: files whose sizes sum ≤ maxStagedBytes
      const COMMIT_SHA = "sha-tc031-abc";

      const statusOut =
        statusEntry(" M", "src/a.ts") +
        statusEntry(" M", "src/b.ts");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },                     // rev-parse HEAD
        { exitCode: 0, stdout: statusOut },                           // status
        { exitCode: 0 },                                              // add -A -- src/a.ts src/b.ts
        { exitCode: 1 },                                              // diff --cached --quiet (staged changes)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-list
        { exitCode: 0 },                                              // push
      ]);

      // sizes: 200 + 200 = 400 ≤ maxStagedBytes: 1000 → no halt
      const sizeMap = new Map([
        ["src/a.ts", 200],
        ["src/b.ts", 200],
      ]);
      const statFn = makeSizeProbe(sizeMap);

      // WHEN commitAndPush runs with sizes well under maxStagedBytes: 1000
      await commitAndPush(
        makeGuardedStep(),
        makeState(),
        makeDeps({ maxStagedBytes: 1000 }),
        null,
        makeInfra(fn, statFn),
      );

      // THEN commit and push proceed (no halt)
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-032: Delete-pending path contributes zero bytes and does not misfire the guard
// ---------------------------------------------------------------------------

describe("TC-032: delete-pending path contributes zero bytes and does not misfire the guard", () => {
  it(
    // TC-032
    "TC-032: probe throws ENOENT for delete-pending path → 0 bytes, guard does not fire, commit proceeds",
    async () => {
      // GIVEN: status includes a delete-pending path plus present files
      // whose sizes sum ≤ maxStagedBytes
      const COMMIT_SHA = "sha-tc032-abc";

      // " D" → worktree-deleted (tracked, delete-pending)
      const statusOut =
        statusEntry(" D", "old-file.ts") +   // delete-pending (not in worktree)
        statusEntry(" M", "src/keep.ts");     // present file

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },                     // rev-parse HEAD
        { exitCode: 0, stdout: statusOut },                           // status
        { exitCode: 0 },                                              // add
        { exitCode: 1 },                                              // diff
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-parse (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-list
        { exitCode: 0 },                                              // push
      ]);

      // src/keep.ts = 100 bytes; old-file.ts → ENOENT (delete-pending → 0)
      // Total = 100 ≤ maxStagedBytes: 500 → no halt
      const sizeMap = new Map([
        ["src/keep.ts", 100],
        // old-file.ts is NOT in the map → ENOENT will be thrown
      ]);
      const statFn = makeSizeProbe(sizeMap);

      // WHEN commitAndPush runs the guarded branch
      await commitAndPush(
        makeGuardedStep(),
        makeState(),
        makeDeps({ maxStagedBytes: 500 }),
        null,
        makeInfra(fn, statFn),
      );

      // THEN the guard does NOT fire (delete-pending contributes 0 bytes)
      // AND commit and push proceed
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
      expect(subcommands).not.toContain("STAGED_BYTES_LIMIT_EXCEEDED");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-033: Non-ENOENT measurement failure halts fail-closed before commit
// ---------------------------------------------------------------------------

describe("TC-033: non-ENOENT measurement failure halts fail-closed before commit", () => {
  it(
    // TC-033
    "TC-033: probe throws non-ENOENT error → step halts; no git commit or push is invoked",
    async () => {
      // GIVEN: probe throws a non-ENOENT error (e.g. EACCES) for a path
      const statusOut =
        statusEntry(" M", "src/a.ts") +
        statusEntry(" M", "src/b.ts");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" }, // rev-parse HEAD
        { exitCode: 0, stdout: statusOut },       // status
        // measurement failure before git add — no further git calls expected
      ]);

      // probe that throws EACCES for src/b.ts (non-ENOENT → fail-closed)
      const statFn = makeFailProbe("src/b.ts");

      // WHEN commitAndPush runs the guarded branch
      // THEN it halts (rejects) — fail-closed
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedBytes: 100_000 }),
          null,
          makeInfra(fn, statFn),
        ),
      ).rejects.toThrow();

      // AND no git commit or push was invoked
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("commit");
      expect(subcommands).not.toContain("push");
    },
  );

  it(
    // TC-033
    "TC-033: no git add is invoked when measurement fails fail-closed",
    async () => {
      // GIVEN: probe throws EACCES for any path
      const statusOut = statusEntry(" M", "src/a.ts");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
      ]);

      const statFn: StagedPathSizeProbe = async () => {
        throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
      };

      // WHEN commitAndPush runs the guarded branch
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedBytes: 100_000 }),
          null,
          makeInfra(fn, statFn),
        ),
      ).rejects.toThrow();

      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("add");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-041: Byte guard fires independently — file count under limit, bytes over limit → halts
// ---------------------------------------------------------------------------

describe("TC-041: byte guard fires independently when file count is under its limit but bytes exceed limit", () => {
  it(
    // TC-041
    "TC-041: file count ≤ maxStagedFiles, bytes > maxStagedBytes → halts with STAGED_BYTES_LIMIT_EXCEEDED",
    async () => {
      // GIVEN: a stage set with 2 files (well under maxStagedFiles default 2000)
      // but whose sizes sum over a low maxStagedBytes (500)
      const statusOut =
        statusEntry(" M", "src/a.ts") +
        statusEntry(" M", "src/b.ts");

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
      ]);

      // 2 files: count=2 << maxStagedFiles=2000, but bytes=600 > maxStagedBytes=500
      const sizeMap = new Map([
        ["src/a.ts", 300],
        ["src/b.ts", 300],
      ]);
      const statFn = makeSizeProbe(sizeMap);

      // WHEN commitAndPush runs with maxStagedFiles at default (2000) and maxStagedBytes: 500
      // THEN it halts with STAGED_BYTES_LIMIT_EXCEEDED (byte guard fires, file-count guard does not)
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedBytes: 500 }),
          null,
          makeInfra(fn, statFn),
        ),
      ).rejects.toMatchObject({ code: "STAGED_BYTES_LIMIT_EXCEEDED" });
    },
  );

  it(
    // TC-041
    "TC-041: file count guard would not fire (2 << 2000) but byte guard fires — proving independence",
    async () => {
      // GIVEN: 2 files under maxStagedFiles (2000) but over maxStagedBytes (100)
      const statusOut =
        statusEntry(" M", "src/a.ts") +
        statusEntry(" M", "src/b.ts");

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
      ]);

      const sizeMap = new Map([
        ["src/a.ts", 60],
        ["src/b.ts", 60],
      ]);
      const statFn = makeSizeProbe(sizeMap);

      // WHEN maxStagedFiles is explicitly high (no file-count halt) but bytes (120) > maxStagedBytes (100)
      const caught = await commitAndPush(
        makeGuardedStep(),
        makeState(),
        makeDeps({ maxStagedFiles: 2000, maxStagedBytes: 100 }),
        null,
        makeInfra(fn, statFn),
      ).then(
        () => null,
        (err) => err as { code?: string },
      );

      expect(caught).not.toBeNull();
      // The error code must be STAGED_BYTES_LIMIT_EXCEEDED (not STAGING_LIMIT_EXCEEDED)
      expect(caught!.code).toBe("STAGED_BYTES_LIMIT_EXCEEDED");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-042: Over-byte halt error message contains total bytes, threshold, and per-directory breakdown
// ---------------------------------------------------------------------------

describe("TC-042: over-byte halt error message contains total bytes, threshold, and per-directory breakdown", () => {
  it(
    // TC-042
    "TC-042: error message contains total byte count and threshold",
    async () => {
      // GIVEN: files whose total bytes (600) exceeds maxStagedBytes (500)
      const statusOut =
        statusEntry(" M", "assets/img.png") +
        statusEntry(" M", "assets/video.mp4");

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
      ]);

      const sizeMap = new Map([
        ["assets/img.png", 250],
        ["assets/video.mp4", 350],
      ]);
      const statFn = makeSizeProbe(sizeMap);

      let caughtError: { code?: string; message?: string; hint?: string } | null = null;
      try {
        await commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedBytes: 500 }),
          null,
          makeInfra(fn, statFn),
        );
      } catch (err) {
        caughtError = err as { code?: string; message?: string; hint?: string };
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError!.code).toBe("STAGED_BYTES_LIMIT_EXCEEDED");

      // message must contain total (600) and threshold (500)
      const msg = caughtError!.message ?? "";
      expect(msg).toContain("600");
      expect(msg).toContain("500");
    },
  );

  it(
    // TC-042
    "TC-042: error message or hint contains a size breakdown (top directory name)",
    async () => {
      // GIVEN: files in the assets/ directory exceed maxStagedBytes
      const statusOut =
        statusEntry(" M", "assets/img.png") +
        statusEntry(" M", "assets/video.mp4");

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
      ]);

      const sizeMap = new Map([
        ["assets/img.png", 250],
        ["assets/video.mp4", 350],
      ]);
      const statFn = makeSizeProbe(sizeMap);

      let caughtError: { code?: string; message?: string; hint?: string } | null = null;
      try {
        await commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedBytes: 500 }),
          null,
          makeInfra(fn, statFn),
        );
      } catch (err) {
        caughtError = err as { code?: string; message?: string; hint?: string };
      }

      expect(caughtError).not.toBeNull();

      // The full text (message + hint) must include the directory breakdown
      const fullText = (caughtError!.message ?? "") + (caughtError!.hint ?? "");
      expect(fullText).toContain("assets"); // top contributing directory
    },
  );

  it(
    // TC-042
    "TC-042: error message or hint names both remedies (stagingExcludePatterns/.gitignore and maxStagedBytes)",
    async () => {
      // GIVEN: files exceeding maxStagedBytes
      const statusOut = statusEntry(" M", "dist/bundle.js");

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
      ]);

      const sizeMap = new Map([["dist/bundle.js", 1000]]);
      const statFn = makeSizeProbe(sizeMap);

      let caughtError: { code?: string; message?: string; hint?: string } | null = null;
      try {
        await commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedBytes: 500 }),
          null,
          makeInfra(fn, statFn),
        );
      } catch (err) {
        caughtError = err as { code?: string; message?: string; hint?: string };
      }

      expect(caughtError).not.toBeNull();

      const fullText = (caughtError!.message ?? "") + (caughtError!.hint ?? "");
      // Remedy 1: stagingExcludePatterns or .gitignore
      const hasExcludeRemedy =
        fullText.includes("stagingExcludePatterns") || fullText.includes(".gitignore");
      // Remedy 2: maxStagedBytes
      const hasMaxBytesRemedy = fullText.includes("maxStagedBytes");
      expect(hasExcludeRemedy).toBe(true);
      expect(hasMaxBytesRemedy).toBe(true);
    },
  );
});
