/**
 * Integration tests for guarded staging exclusion and volume guard.
 *
 * Covers:
 *   TC-001 (must):   Untracked artifact trees excluded when stagingExcludePatterns configured
 *   TC-002 (must):   No exclusion configured — all changed paths staged (legacy behavior)
 *   TC-003 (must):   Exclude pattern on canon path does not suppress write-scope violation
 *   TC-004 (must):   Over-threshold stage set halts with actionable message before commit
 *   TC-005 (must):   At-or-below threshold commits and pushes as before
 *   TC-006 (must):   Exclusion brings over-limit set under threshold — no halt
 *   TC-018 (must):   Guarded git status call includes --untracked-files=all
 *   TC-020 (should): Scoped staging path is unaffected by new pipeline.stagingExcludePatterns /
 *                    maxStagedFiles config
 *
 * RED state: all tests fail until:
 *   - T-05: commitAndPush guarded branch wired with exclusion + volume guard
 *   - T-08: pipeline config type updated
 *   - T-04: STAGING_LIMIT_EXCEEDED error code added
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-repo-guarded-staging-test";
const BRANCH = "change/guarded-test-abc12345";
const SLUG = "test-slug";

/** Declared output path for the implementer (guarded, non-canon) */
const GUARDED_IMPL_PATH = "src/impl-core-001.ts";
/** Scoped step declared output */
const SCOPED_OUTPUT_PATH = `specrunner/changes/${SLUG}/result-001.md`;

// ---------------------------------------------------------------------------
// Helper: ChildProcess-based SpawnFn mock
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

function makeInfra(spawnFn: SpawnFn): CommitPushInfra {
  return {
    spawnFn,
    sleepFn: vi.fn(async () => {}),
    events: new EventBus(),
  };
}

function makeState(stepName = "implementer"): JobState {
  return {
    version: 2,
    jobId: "guarded-staging-test-job",
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

/** scoped-mode step (design) */
function makeScopedStep(): AgentStep {
  return {
    kind: "agent",
    name: "design",
    agent: { id: "design-agent" } as never,
    buildMessage: () => "design message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
    writes: () => [{ path: SCOPED_OUTPUT_PATH }],
  } as unknown as AgentStep;
}

/**
 * Build a porcelain -z status entry.
 * xy = 2-char status (e.g. "??" for untracked, " M" for worktree-modified).
 */
function statusEntry(xy: string, path: string): string {
  return `${xy} ${path}\0`;
}

// ---------------------------------------------------------------------------
// TC-001: Untracked artifact trees excluded when stagingExcludePatterns configured
// ---------------------------------------------------------------------------

describe("TC-001: untracked artifact trees are excluded when stagingExcludePatterns is configured", () => {
  it(
    // TC-001
    "TC-001: git add pathspec contains src/lib.rs but excludes .cargo-tmp/ and vendor/ paths",
    async () => {
      // GIVEN: guarded step with .cargo-tmp/..., vendor/..., and src/lib.rs in worktree
      // AND: pipeline.stagingExcludePatterns = ["**/.cargo-tmp/**", ".cargo-tmp/**", "vendor/**"]
      const COMMIT_SHA = "sha-tc001-abc";

      const statusOut =
        statusEntry("??", ".cargo-tmp/registry/cache.json") +
        statusEntry("??", "vendor/lodash/index.js") +
        statusEntry(" M", "src/lib.rs");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },                     // rev-parse HEAD
        { exitCode: 0, stdout: statusOut },                           // status --porcelain -z ... --untracked-files=all
        { exitCode: 0 },                                              // add -A -- src/lib.rs
        { exitCode: 1 },                                              // diff --cached --quiet (staged changes)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-list
        { exitCode: 0 },                                              // push
      ]);

      const pipelineConfig = {
        stagingExcludePatterns: ["**/.cargo-tmp/**", ".cargo-tmp/**", "vendor/**"],
      };

      // WHEN commitAndPush runs the guarded branch
      await commitAndPush(
        makeGuardedStep(),
        makeState(),
        makeDeps(pipelineConfig),
        null,
        makeInfra(fn),
      );

      // THEN git add pathspec includes src/lib.rs and excludes artifact paths
      const addCall = calls.find((c) => c[0] === "add");
      expect(addCall).toBeDefined();
      expect(addCall).toContain("src/lib.rs");
      expect(addCall).not.toContain(".cargo-tmp/registry/cache.json");
      expect(addCall).not.toContain("vendor/lodash/index.js");

      // AND commit and push proceed
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: No exclusion configured — all changed paths staged (legacy behavior)
// ---------------------------------------------------------------------------

describe("TC-002: no exclude patterns configured — all changed paths staged (legacy behavior)", () => {
  it(
    // TC-002
    "TC-002: git add pathspec covers all enumerated changed paths including artifact paths",
    async () => {
      // GIVEN: same worktree changes, but NO stagingExcludePatterns
      const COMMIT_SHA = "sha-tc002-abc";

      const statusOut =
        statusEntry("??", ".cargo-tmp/registry/cache.json") +
        statusEntry("??", "vendor/lodash/index.js") +
        statusEntry(" M", "src/lib.rs");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
        { exitCode: 0 },                                              // add (all 3 paths)
        { exitCode: 1 },                                              // diff
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },
        { exitCode: 0 },
      ]);

      // WHEN commitAndPush runs with no pipeline config (empty object)
      await commitAndPush(
        makeGuardedStep(),
        makeState(),
        makeDeps(),
        null,
        makeInfra(fn),
      );

      // THEN git add pathspec covers all enumerated changed paths
      const addCall = calls.find((c) => c[0] === "add");
      expect(addCall).toBeDefined();
      expect(addCall).toContain(".cargo-tmp/registry/cache.json");
      expect(addCall).toContain("vendor/lodash/index.js");
      expect(addCall).toContain("src/lib.rs");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-003: Exclude pattern on canon path does not suppress write-scope violation
// ---------------------------------------------------------------------------

describe("TC-003: exclude pattern covering a canon path does not open a fail-open", () => {
  it(
    // TC-003
    "TC-003: rejects with WRITE_SCOPE_VIOLATION even when canon path matches stagingExcludePatterns",
    async () => {
      // GIVEN: worktree changes include design.md (a protected canon path, untracked)
      // AND: stagingExcludePatterns: ["specrunner/changes/**"]
      const CANON_PATH = `specrunner/changes/${SLUG}/design.md`;

      const statusOut =
        statusEntry("??", CANON_PATH) +
        statusEntry(" M", "src/foo.ts");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },   // rev-parse HEAD
        { exitCode: 0, stdout: statusOut },         // status (--untracked-files=all)
        { exitCode: 0, stdout: "" },               // git diff HEAD -- CANON_PATH (quarantine)
        { exitCode: 0 },                           // git clean -f -- CANON_PATH (restore)
      ]);

      // WHEN commitAndPush runs with the exclusion pattern for the canon path
      // THEN it halts with WRITE_SCOPE_VIOLATION (violation check precedes exclusion)
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ stagingExcludePatterns: ["specrunner/changes/**"] }),
          null,
          makeInfra(fn),
        ),
      ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("commit");
      expect(subcommands).not.toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: Over-threshold stage set halts with actionable message before commit
// ---------------------------------------------------------------------------

describe("TC-004: over-threshold stage set halts with actionable message before commit", () => {
  it(
    // TC-004
    "TC-004: rejects with STAGING_LIMIT_EXCEEDED; no git add/commit/push is invoked",
    async () => {
      // GIVEN: 4 files in worktree, maxStagedFiles: 3 → 4 > 3 → halt
      const statusOut =
        statusEntry("??", ".cargo-tmp/a.json") +
        statusEntry("??", ".cargo-tmp/b.json") +
        statusEntry("??", ".cargo-tmp/c.json") +
        statusEntry(" M", "src/lib.rs");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" }, // rev-parse HEAD
        { exitCode: 0, stdout: statusOut },       // status
        // volume guard fires before git add — no further git calls expected
      ]);

      // WHEN commitAndPush runs the guarded branch with maxStagedFiles: 3
      // THEN it rejects with STAGING_LIMIT_EXCEEDED before any staging/commit/push
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedFiles: 3 }),
          null,
          makeInfra(fn),
        ),
      ).rejects.toMatchObject({ code: "STAGING_LIMIT_EXCEEDED" });

      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("add");
      expect(subcommands).not.toContain("commit");
      expect(subcommands).not.toContain("push");
    },
  );

  it(
    // TC-004
    "TC-004: STAGING_LIMIT_EXCEEDED error message contains total count and top-directory breakdown",
    async () => {
      // GIVEN: 4 files across .cargo-tmp/ and src/ with maxStagedFiles: 2
      const statusOut =
        statusEntry("??", ".cargo-tmp/a.json") +
        statusEntry("??", ".cargo-tmp/b.json") +
        statusEntry("??", ".cargo-tmp/c.json") +
        statusEntry(" M", "src/lib.rs");

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
      ]);

      let caughtError: { code?: string; message?: string; hint?: string } | null = null;
      try {
        await commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ maxStagedFiles: 2 }),
          null,
          makeInfra(fn),
        );
      } catch (err) {
        caughtError = err as { code?: string; message?: string; hint?: string };
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError!.code).toBe("STAGING_LIMIT_EXCEEDED");

      // The error message or hint must include the total count (4) and a directory breakdown
      const fullText = (caughtError!.message ?? "") + (caughtError!.hint ?? "");
      expect(fullText).toContain("4");          // total staged files
      expect(fullText).toContain(".cargo-tmp"); // top contributor directory
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: At-or-below threshold commits and pushes as before
// ---------------------------------------------------------------------------

describe("TC-005: at-or-below threshold commits and pushes as before", () => {
  it(
    // TC-005
    "TC-005: exactly maxStagedFiles files → no halt, commit and push proceed",
    async () => {
      // GIVEN: 3 files, maxStagedFiles: 3 → 3 ≤ 3 → OK
      const COMMIT_SHA = "sha-tc005-abc";

      const statusOut =
        statusEntry(" M", "src/a.rs") +
        statusEntry(" M", "src/b.rs") +
        statusEntry(" M", "src/c.rs");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
        { exitCode: 0 },                                              // add
        { exitCode: 1 },                                              // diff (staged changes)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-parse (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-list
        { exitCode: 0 },                                              // push
      ]);

      // WHEN commitAndPush runs with maxStagedFiles: 3 and exactly 3 files
      await commitAndPush(
        makeGuardedStep(),
        makeState(),
        makeDeps({ maxStagedFiles: 3 }),
        null,
        makeInfra(fn),
      );

      // THEN commit and push proceed (no halt)
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: Exclusion brings over-limit set under threshold — no halt
// ---------------------------------------------------------------------------

describe("TC-006: exclusion brings an otherwise-over-limit set under the threshold", () => {
  it(
    // TC-006
    "TC-006: exclusion removes artifact trees so survivors ≤ maxStagedFiles → no halt; add uses surviving paths",
    async () => {
      // GIVEN: 5 files total (3 in .cargo-tmp/ + 2 real files), maxStagedFiles: 2
      // AND: stagingExcludePatterns removes .cargo-tmp/** → 2 survivors ≤ 2 → no halt
      const COMMIT_SHA = "sha-tc006-abc";

      const statusOut =
        statusEntry("??", ".cargo-tmp/a.json") +
        statusEntry("??", ".cargo-tmp/b.json") +
        statusEntry("??", ".cargo-tmp/c.json") +
        statusEntry(" M", "src/a.rs") +
        statusEntry(" M", "src/b.rs");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },                           // status: 5 files
        { exitCode: 0 },                                              // add -A -- src/a.rs src/b.rs
        { exitCode: 1 },                                              // diff (staged)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-parse (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-list
        { exitCode: 0 },                                              // push
      ]);

      // WHEN commitAndPush runs with exclusions that bring count from 5 to 2
      await commitAndPush(
        makeGuardedStep(),
        makeState(),
        makeDeps({
          maxStagedFiles: 2,
          stagingExcludePatterns: [".cargo-tmp/**"],
        }),
        null,
        makeInfra(fn),
      );

      // THEN no halt; commit proceeds with only the surviving paths
      const addCall = calls.find((c) => c[0] === "add");
      expect(addCall).toBeDefined();
      expect(addCall).toContain("src/a.rs");
      expect(addCall).toContain("src/b.rs");
      expect(addCall).not.toContain(".cargo-tmp/a.json");
      expect(addCall).not.toContain(".cargo-tmp/b.json");
      expect(addCall).not.toContain(".cargo-tmp/c.json");

      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-018 (must): Guarded git status call includes --untracked-files=all
// ---------------------------------------------------------------------------

describe("TC-018: guarded git status call includes --untracked-files=all", () => {
  it(
    // TC-018
    "TC-018: the git status call in guarded mode includes --untracked-files=all in its args",
    async () => {
      // GIVEN: a guarded step driven through commitAndPush
      const COMMIT_SHA = "sha-tc018-abc";
      const statusOut = statusEntry(" M", "src/lib.rs");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },
        { exitCode: 0, stdout: statusOut },
        { exitCode: 0 },                                              // add
        { exitCode: 1 },                                              // diff
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-parse (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },                  // rev-list
        { exitCode: 0 },                                              // push
      ]);

      // WHEN commitAndPush executes the guarded branch
      await commitAndPush(makeGuardedStep(), makeState(), makeDeps(), null, makeInfra(fn));

      // THEN the recorded git status call arguments include --untracked-files=all
      const statusCall = calls.find(
        (c) => c[0] === "status" && c.includes("--porcelain"),
      );
      expect(statusCall).toBeDefined();
      expect(statusCall).toContain("--untracked-files=all");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-020 (should): Scoped staging path is unaffected by pipeline.stagingExcludePatterns / maxStagedFiles
// ---------------------------------------------------------------------------

describe("TC-020 (should): scoped staging path is unaffected by new pipeline config", () => {
  it(
    // TC-020
    "TC-020: scoped step with stagingExcludePatterns and maxStagedFiles config — commit and push proceed as before",
    async () => {
      // GIVEN: a scoped step (design) with pipeline.stagingExcludePatterns and maxStagedFiles set
      const COMMIT_SHA = "sha-tc020-abc";

      // Scoped mode git call sequence:
      //   0: rev-parse HEAD (headAtEntry)
      //   1: add -A -- <declared output path>
      //   2: status --porcelain -z --no-renames (residual check — NO --untracked-files=all)
      //   3: diff --cached --quiet -- <path>
      //   4: commit -m ...
      //   5: rev-parse HEAD (egress)
      //   6: rev-list
      //   7: push
      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },          // rev-parse HEAD
        { exitCode: 0 },                                   // add
        { exitCode: 0, stdout: "" },                       // status (residual check, no residuals)
        { exitCode: 1 },                                   // diff (staged changes)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },        // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },        // rev-parse (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },        // rev-list
        { exitCode: 0 },                                   // push
      ]);

      // WHEN commitAndPush runs a scoped step with pipeline config that includes
      // stagingExcludePatterns and maxStagedFiles
      await commitAndPush(
        makeScopedStep(),
        makeState("design"),
        makeDeps({
          stagingExcludePatterns: ["vendor/**"],
          maxStagedFiles: 1,
        }),
        null,
        makeInfra(fn),
      );

      // THEN no status call includes --untracked-files=all
      const statusCalls = calls.filter(
        (c) => c[0] === "status" && c.includes("--porcelain"),
      );
      for (const statusCall of statusCalls) {
        expect(statusCall).not.toContain("--untracked-files=all");
      }

      // AND commit and push proceed as before
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});
