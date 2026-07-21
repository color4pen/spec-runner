/**
 * Unit tests for commitAndPush write-scope enforcement (scoped/guarded branching).
 *
 * TC-003: judge step (scoped mode) — request.md change excluded from commit
 * TC-004: scoped mode — normal commit content same as current
 * TC-005: guarded mode (implementer) — request.md change → halt, no commit
 * TC-006: guarded mode — boundary-only changes → commit proceeds normally
 * TC-017: scoped mode — empty stagePaths → no git add, no commit (no-op)
 * TC-018: guarded mode — HEAD-advance detection (push-only path) preserved
 * TC-019: guarded mode — git status spawn failure → fail-closed halt
 * TC-020: guarded mode — spec.md change → halt with spec.md in error message
 * TC-021: guarded mode — violated files restored before WRITE_SCOPE_VIOLATION throw
 *         (two-step: git clean for untracked, git checkout HEAD for tracked)
 * TC-022: scoped mode — pipeline-managed paths included in scoped git add call
 * TC-023: scoped mode — residual protected dirty files restored after staging
 *         (best-effort: postStatus failure is silently skipped)
 *
 * The mock for pipelineManagedPaths (round-git-scope.ts) is registered via vi.mock
 * so that once the implementation imports it, the mock takes effect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { commitAndPush } from "../../../src/core/step/commit-push.js";
import type { CommitPushInfra } from "../../../src/core/step/commit-push.js";
import type { AgentStep, IoRef } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/git-exec.js";
import { EventBus } from "../../../src/core/event/event-bus.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock pipelineManagedPaths so scoped-mode stagePaths can be controlled.
// Once commitAndPush imports this function (from round-git-scope.ts or wherever),
// the mock will intercept it.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../../src/core/step/round-git-scope.js", () => ({
  pipelineManagedPaths: (slug: string) => [
    `specrunner/changes/${slug}/state.json`,
    `specrunner/changes/${slug}/events.jsonl`,
    `specrunner/changes/${slug}/usage.json`,
  ],
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock node:fs/promises.access to always resolve (all managed paths "exist").
//
// commit-push.ts uses filterExistingFiles (via fs.access) to filter managed
// paths before calling git add, to avoid exit 128 on non-existent pathspecs.
// In unit tests, the temp directory does not contain managed path files, so
// we stub access to treat all paths as existing. Other fs functions remain real.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Test state management
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cap-wse-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  // Reset the access mock to always-resolve after each test.
  // TC-017 overrides it to always-reject; without this reset, subsequent
  // tests would see filterExistingFiles return [] and get unexpected behavior.
  vi.mocked(fs.access).mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GitCallRecord {
  args: string[];
  stdout?: string;
}

/**
 * Build a mock SpawnFn that records all git calls.
 * Responds to each git subcommand based on the `responses` map.
 * Default: exitCode=0, stdout="".
 *
 * For "status" command with NUL-delimited output, set stdout to the
 * porcelain format: "XY path\0" per changed file (e.g., " M file.ts\0").
 */
function makeGitSpawnFn(opts: {
  responses?: Record<string, { exitCode: number; stdout?: string }>;
} = {}): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  const responses = opts.responses ?? {};

  const spawnFn: SpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push({ args: [...args] });

    const subcommand = args[0] ?? "";
    const response = responses[subcommand] ?? { exitCode: 0, stdout: "" };

    const procEm = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procAny = procEm as any;
    const stdoutEm = new EventEmitter();
    procAny.stdout = stdoutEm;
    procAny.stderr = new EventEmitter();
    procAny.stdin = { write: () => true, end: () => {} };

    setImmediate(() => {
      if (response.stdout) {
        stdoutEm.emit("data", Buffer.from(response.stdout));
      }
      procEm.emit("close", response.exitCode);
    });

    return procEm as unknown as ChildProcess;
  };

  return { spawnFn, calls };
}

/**
 * Build a mock SpawnFn that emits an error event for a specific subcommand
 * (simulating a spawn-level failure, e.g., git not found or EPERM).
 */
function makeSpawnErrorFn(opts: {
  errorOnSubcommand: string;
}): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  const { errorOnSubcommand } = opts;

  const spawnFn: SpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push({ args: [...args] });
    const subcommand = args[0] ?? "";

    const procEm = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procAny = procEm as any;
    procAny.stdout = new EventEmitter();
    procAny.stderr = new EventEmitter();
    procAny.stdin = { write: () => true, end: () => {} };

    if (subcommand === errorOnSubcommand) {
      setImmediate(() => {
        procEm.emit("error", new Error(`Simulated spawn failure for git ${subcommand}`));
      });
    } else {
      setImmediate(() => { procEm.emit("close", 0); });
    }

    return procEm as unknown as ChildProcess;
  };

  return { spawnFn, calls };
}

function makeJobState(branch = "feat/test-slug"): JobState {
  return {
    version: 1,
    jobId: "wse-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

function makeDeps(slug = "test-slug"): PipelineDeps {
  return {
    storeFactory: ((_jobId: string) => {
      throw new Error("storeFactory must not be used in commit-push tests");
    }) as unknown as PipelineDeps["storeFactory"],
    config: { version: 1, runtime: "local", agents: {} },
    request: {
      type: "spec-change",
      title: "Test",
      slug,
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug,
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE",
      }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "user",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  };
}

function makeScopedStep(
  name: string,
  writePaths: string[],
): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "do something",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "do this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes(_state: JobState, deps: { slug: string }): IoRef[] {
      return writePaths.map((p) => ({ path: p.replace("{slug}", deps.slug) }));
    },
  };
}

function makeGuardedStep(
  name: string,
  writePaths: string[] = [],
): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "implement",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes(_state: JobState, _deps: { slug: string }): IoRef[] {
      return writePaths.map((p) => ({ path: p }));
    },
  };
}

function makeCommitPushInfra(spawnFn: SpawnFn): CommitPushInfra {
  return {
    spawnFn,
    sleepFn: async (_ms: number) => {},
    events: new EventBus(),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// TC-003: scoped mode — judge step's request.md change excluded from commit
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-003: scoped mode — request.md change not included in commit", () => {
  it("git add uses pathspec '--' and excludes request.md", async () => {
    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 }, // staged changes present → commit
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const slug = "test-slug";
    // spec-review is a scoped step (not in GUARDED_WRITE_STEPS)
    const step = makeScopedStep("spec-review", [
      `specrunner/changes/${slug}/spec-review-result-001.md`,
    ]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    // The git add call must use pathspec (contain "--" separator)
    const addCall = calls.find((c) => c.args[0] === "add");
    expect(addCall, "git add must have been called").toBeDefined();
    expect(addCall!.args, "git add must use pathspec '--' separator").toContain("--");

    // request.md must NOT appear in the git add args
    const addArgs = addCall!.args.join(" ");
    expect(addArgs, "request.md must not be in git add args").not.toContain("request.md");
  });

  it("declared result file IS included in the scoped git add call", async () => {
    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    const step = makeScopedStep("spec-review", [resultPath]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const addCall = calls.find((c) => c.args[0] === "add");
    expect(addCall, "git add must have been called").toBeDefined();
    expect(addCall!.args, "declared result file must be in git add args").toContain(resultPath);
  });

  it("does NOT use bare 'git add -A' without pathspec for scoped step", async () => {
    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 0 }, // no staged changes
        "rev-parse": { exitCode: 0, stdout: "abc123\n" },
      },
    });

    const slug = "test-slug";
    const step = makeScopedStep("spec-review", [
      `specrunner/changes/${slug}/spec-review-result-001.md`,
    ]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const addCall = calls.find((c) => c.args[0] === "add");
    if (addCall) {
      // If git add was called, it must use pathspec (not bare -A)
      // Bare `git add -A` has exactly 2 args: ["add", "-A"]
      expect(
        addCall.args.length,
        "bare 'git add -A' (2 args) should not be used; pathspec should be appended",
      ).toBeGreaterThan(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: scoped mode — normal path commit same as current behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-004: scoped mode — normal path commit includes declared outputs", () => {
  it("git commit is called with the correct message format", async () => {
    const slug = "test-slug";
    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 }, // staged changes
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-fixer", [
      `specrunner/changes/${slug}/spec.md`,
      `specrunner/changes/${slug}/design.md`,
    ]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must be called").toBeDefined();

    const msgIdx = commitCall!.args.indexOf("-m");
    expect(msgIdx, "commit must have -m flag").toBeGreaterThan(-1);
    const commitMsg = commitCall!.args[msgIdx + 1];
    // Format: "<step.name>: <slug>"
    expect(commitMsg).toBe(`spec-fixer: ${slug}`);
  });

  it("git push is called after commit", async () => {
    const slug = "test-slug";
    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-fixer", [
      `specrunner/changes/${slug}/spec.md`,
    ]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).toContain("commit");
    expect(subcommands).toContain("push");
    const commitIdx = subcommands.indexOf("commit");
    const pushIdx = subcommands.indexOf("push");
    expect(commitIdx).toBeLessThan(pushIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: guarded mode — implementer's request.md change → halt, no commit
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-005: guarded mode — request.md change causes halt", () => {
  it("throws when implementer changes request.md", async () => {
    const slug = "test-slug";
    const requestMdPath = `specrunner/changes/${slug}/request.md`;

    // git status returns request.md as changed
    const statusOutput = ` M ${requestMdPath}\0`;
    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, state, deps, null, infra),
    ).rejects.toMatchObject({
      code: "WRITE_SCOPE_VIOLATION",
    });
  });

  it("git commit is NOT called when implementer changed request.md", async () => {
    const slug = "test-slug";
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const statusOutput = ` M ${requestMdPath}\0`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "add": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toThrow();

    // Neither commit nor push should have been called
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "git commit must NOT be called").not.toContain("commit");
    expect(subcommands, "git push must NOT be called").not.toContain("push");
  });

  it("halt error message includes the violated request.md path", async () => {
    const slug = "test-slug";
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const statusOutput = ` M ${requestMdPath}\0`;

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    let caughtError: Error | undefined;
    try {
      await commitAndPush(step, state, deps, null, infra);
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError, "Should have thrown an error").toBeDefined();
    expect(caughtError!.message, "Error message must include request.md path").toContain(
      requestMdPath,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: guarded mode — boundary-safe changes commit normally
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-006: guarded mode — boundary-safe changes commit proceeds normally", () => {
  it("git status is checked before git add in guarded mode", async () => {
    const slug = "test-slug";
    // Only source code changed (boundary-safe)
    const statusOutput = " M src/foo.ts\0 M src/bar.ts\0";

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const subcommands = calls.map((c) => c.args[0]);

    // In guarded mode, "status" must be called
    expect(subcommands, "git status must be called in guarded mode").toContain("status");

    // Normal commit flow proceeds after status check
    expect(subcommands).toContain("add");
    expect(subcommands).toContain("commit");
    expect(subcommands).toContain("push");
  });

  it("does NOT throw when only boundary-safe paths changed", async () => {
    const slug = "test-slug";
    const statusOutput = " M src/foo.ts\0";

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(commitAndPush(step, state, deps, null, infra)).resolves.toBeUndefined();
  });

  it("guarded mode uses bare 'git add -A' (no pathspec) after passing status check", async () => {
    const slug = "test-slug";
    const statusOutput = " M src/foo.ts\0";

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const addCall = calls.find((c) => c.args[0] === "add");
    expect(addCall, "git add must have been called").toBeDefined();

    // In guarded mode, git add -A (without pathspec) should be used after passing the check
    // This preserves the original "stage whole worktree" behavior for guarded steps
    expect(addCall!.args).toContain("-A");
    // Should NOT use pathspec for guarded mode (whole worktree is staged)
    expect(addCall!.args).not.toContain("--");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: scoped mode — empty stagePaths → no git commands called
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-017: scoped mode — empty stagePaths → no-op", () => {
  it("no git add is called when writes() is empty and no managed paths exist (stagePaths = [])", async () => {
    // vi.doMock cannot override the hoisted vi.mock at the top of this file.
    // Instead, make filterExistingFiles return [] by rejecting all access() calls —
    // no managed path "exists", so existingManaged=[]. Combined with empty writes(),
    // stagePaths=[] and git add must NOT be called.
    vi.mocked(fs.access).mockRejectedValue(new Error("does not exist"));

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "diff": { exitCode: 0 }, // no staged changes (nothing was added)
      },
    });

    const slug = "test-slug";
    const step = makeScopedStep("spec-fixer", []); // empty writes()
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    // git add must NOT be called when stagePaths is empty
    expect(
      calls.map((c) => c.args[0]),
      "git add must NOT be called when stagePaths is empty",
    ).not.toContain("add");
    // git commit must NOT be called (no staged changes)
    expect(
      calls.map((c) => c.args[0]),
      "git commit must NOT be called when stagePaths is empty",
    ).not.toContain("commit");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-018: guarded mode — HEAD-advance detection preserved (push-only path)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-018: guarded mode — HEAD-advance detection preserved", () => {
  it("push is called without commit when agent self-committed (HEAD advanced)", async () => {
    const slug = "test-slug";
    const headBeforeStep = "old-sha-before-step";

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: "" }, // clean worktree — no violations
        "add": { exitCode: 0 },
        "diff": { exitCode: 0 }, // no staged changes (agent already committed)
        "rev-parse": { exitCode: 0, stdout: "new-sha-after-agent-commit\n" }, // HEAD advanced
        "push": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, headBeforeStep, infra);

    const subcommands = calls.map((c) => c.args[0]);

    // git status must be called (guarded mode)
    expect(subcommands, "git status must be called").toContain("status");

    // Push must happen (agent-committed, push-only path)
    expect(subcommands, "git push must be called").toContain("push");

    // git commit must NOT be called (agent already committed)
    expect(subcommands, "git commit must NOT be called for push-only path").not.toContain("commit");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-019: guarded mode — git status spawn failure → fail-closed halt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-019: guarded mode — git status spawn failure → fail-closed halt", () => {
  it("throws when git status returns non-zero exit code", async () => {
    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 1 }, // non-zero exit → fail-closed
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps("test-slug");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, state, deps, null, infra),
    ).rejects.toThrow();
  });

  it("git commit and push are NOT called after status spawn failure", async () => {
    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 128 }, // git error exit
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps("test-slug");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toThrow();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "git commit must NOT be called").not.toContain("commit");
    expect(subcommands, "git push must NOT be called").not.toContain("push");
  });

  it("throws when git status spawn-level fails (ChildProcess error event)", async () => {
    const { spawnFn, calls } = makeSpawnErrorFn({ errorOnSubcommand: "status" });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps("test-slug");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, state, deps, null, infra),
    ).rejects.toThrow();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "git commit must NOT be called").not.toContain("commit");
    expect(subcommands, "git push must NOT be called").not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-020: guarded mode — spec.md change → halt with spec.md in error message
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-020: guarded mode — spec.md change causes halt with path in error message", () => {
  it("throws when implementer changes spec.md", async () => {
    const slug = "test-slug";
    const specMdPath = `specrunner/changes/${slug}/spec.md`;
    const statusOutput = ` M ${specMdPath}\0`;

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, state, deps, null, infra),
    ).rejects.toMatchObject({
      code: "WRITE_SCOPE_VIOLATION",
    });
  });

  it("error message includes spec.md path when spec.md was changed", async () => {
    const slug = "test-slug";
    const specMdPath = `specrunner/changes/${slug}/spec.md`;
    const statusOutput = ` M ${specMdPath}\0`;

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    let caughtError: Error | undefined;
    try {
      await commitAndPush(step, state, deps, null, infra);
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError, "Should have thrown").toBeDefined();
    expect(caughtError!.message, "Error message must include spec.md path").toContain(specMdPath);
  });

  it("git commit and push are NOT called when spec.md changed", async () => {
    const slug = "test-slug";
    const specMdPath = `specrunner/changes/${slug}/spec.md`;
    const statusOutput = ` M ${specMdPath}\0`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "add": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toThrow();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("commit");
    expect(subcommands).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-021: guarded mode — violated files restored before WRITE_SCOPE_VIOLATION throw
//
// Fix for [HIGH]: commitFinalState (checkpoint path) uses git add -A after every
// awaiting-resume exit. Without restoration, a guarded step that halt-detected
// request.md (or another protected path) as a violation would leave that file dirty
// in the worktree. commitFinalState's git add -A would then stage and commit the
// violation content into the remote branch, defeating the fail-closed guarantee.
//
// Fix: two-step restore before throwing WRITE_SCOPE_VIOLATION:
//   1. git clean -f -- <violations>: removes newly created (untracked) violations that
//      are not in HEAD. git checkout HEAD would fail for those, leaving them in the
//      worktree where commitFinalState's git add -A would pick them up.
//   2. git checkout HEAD -- <violations>: restores tracked modified violations.
// Both are best-effort (failures silently ignored). The throw always occurs.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-021: guarded mode — violated files restored before WRITE_SCOPE_VIOLATION throw", () => {
  it("git checkout HEAD is called for request.md before throwing WRITE_SCOPE_VIOLATION", async () => {
    const slug = "test-slug";
    const requestMd = `specrunner/changes/${slug}/request.md`;
    const statusOutput = ` M ${requestMd}\0`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "checkout": { exitCode: 0 }, // restore succeeds
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toMatchObject({
      code: "WRITE_SCOPE_VIOLATION",
    });

    // git checkout HEAD -- request.md must be called BEFORE the throw
    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    expect(checkoutCall, "git checkout must be called to restore the violated file").toBeDefined();
    expect(checkoutCall!.args, "must checkout HEAD").toContain("HEAD");
    expect(checkoutCall!.args, "must use '--' separator").toContain("--");
    expect(checkoutCall!.args, "must restore request.md").toContain(requestMd);
  });

  it("checkout is called before the throw (not after)", async () => {
    const slug = "test-slug";
    const requestMd = `specrunner/changes/${slug}/request.md`;
    const statusOutput = ` M ${requestMd}\0`;

    const callOrder: string[] = [];
    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "checkout": { exitCode: 0 },
      },
    });

    // Wrap spawnFn to record call order
    const orderTrackingSpawnFn: typeof spawnFn = (bin, args, opts) => {
      callOrder.push(args[0] ?? "");
      return spawnFn(bin, args, opts);
    };

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(orderTrackingSpawnFn);

    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toThrow();

    const statusIdx = callOrder.indexOf("status");
    const checkoutIdx = callOrder.indexOf("checkout");
    expect(statusIdx, "status must be called").toBeGreaterThanOrEqual(0);
    expect(checkoutIdx, "checkout must be called").toBeGreaterThanOrEqual(0);
    expect(checkoutIdx, "checkout must come AFTER status").toBeGreaterThan(statusIdx);
    // commit and push must NOT be called (throw happens before them)
    expect(callOrder).not.toContain("commit");
    expect(callOrder).not.toContain("push");
  });

  it("multiple violated paths are all passed to git checkout", async () => {
    const slug = "test-slug";
    const requestMd = `specrunner/changes/${slug}/request.md`;
    const specMd = `specrunner/changes/${slug}/spec.md`;
    const statusOutput = ` M ${requestMd}\0 M ${specMd}\0`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "checkout": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toThrow();

    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    expect(checkoutCall, "git checkout must be called").toBeDefined();
    // Both violated paths must be in the checkout args
    expect(checkoutCall!.args, "request.md must be in checkout args").toContain(requestMd);
    expect(checkoutCall!.args, "spec.md must be in checkout args").toContain(specMd);
  });

  it("WRITE_SCOPE_VIOLATION is always thrown even when git checkout fails", async () => {
    const slug = "test-slug";
    const requestMd = `specrunner/changes/${slug}/request.md`;
    const statusOutput = ` M ${requestMd}\0`;

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "checkout": { exitCode: 1 }, // restore fails (e.g. file not in HEAD)
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    // Even if checkout fails, the WRITE_SCOPE_VIOLATION is still thrown
    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toMatchObject({
      code: "WRITE_SCOPE_VIOLATION",
    });
  });

  it("untracked (new) violation file is removed with git clean -f before git checkout HEAD", async () => {
    // Scenario: agent creates a brand-new request.md that didn't exist before (untracked).
    // git checkout HEAD -- request.md would fail (not in HEAD) and leave the file in the
    // worktree. The two-step restore calls git clean -f first to remove untracked files,
    // then git checkout HEAD for tracked modified files.
    const slug = "test-slug";
    const requestMd = `specrunner/changes/${slug}/request.md`;
    // "??" prefix = untracked (new file, never committed to git)
    const statusOutput = `?? ${requestMd}\0`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "clean": { exitCode: 0 },
        "checkout": { exitCode: 1 }, // fails because file not in HEAD — expected for new files
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    // WRITE_SCOPE_VIOLATION must be thrown despite clean succeeding and checkout failing
    await expect(commitAndPush(step, state, deps, null, infra)).rejects.toMatchObject({
      code: "WRITE_SCOPE_VIOLATION",
    });

    const cleanCall = calls.find((c) => c.args[0] === "clean");
    expect(cleanCall, "git clean must be called to remove untracked violation").toBeDefined();
    expect(cleanCall!.args, "git clean must use -f flag").toContain("-f");
    expect(cleanCall!.args, "git clean must use '--' separator").toContain("--");
    expect(cleanCall!.args, "git clean must target the violation path").toContain(requestMd);

    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    expect(checkoutCall, "git checkout HEAD must also be attempted (for tracked files)").toBeDefined();
    expect(checkoutCall!.args, "checkout must target HEAD").toContain("HEAD");
    expect(checkoutCall!.args, "checkout must include violation path").toContain(requestMd);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-022: scoped mode — pipeline-managed paths are included in scoped git add call
//
// Regression guard for pipelineManagedPaths dual-semantics:
//   - parallel round (partitionRoundChanges): managed paths are EXCLUDED from staging.
//   - sequential scoped (commitAndPush): managed paths are INCLUDED in staging.
// This test directly asserts the inclusion invariant so that a pipelineManagedPaths
// definition change surfaces here before silently breaking the sequential path.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-022: scoped mode — pipeline-managed paths included in scoped git add call", () => {
  it("state.json, events.jsonl, usage.json appear in git add pathspec even when not in writes()", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "status": { exitCode: 0, stdout: "" }, // no residual violations
        "diff": { exitCode: 1 }, // staged changes
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    // writes() only declares the result file — NOT managed paths.
    const step = makeScopedStep("spec-review", [resultPath]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const addCall = calls.find((c) => c.args[0] === "add");
    expect(addCall, "git add must have been called").toBeDefined();

    const addArgs = addCall!.args;
    // The mocked pipelineManagedPaths returns these 3 paths — they must be included
    // in the pathspec even though writes() did not declare them.
    expect(addArgs, "state.json must be in scoped add pathspec").toContain(
      `specrunner/changes/${slug}/state.json`,
    );
    expect(addArgs, "events.jsonl must be in scoped add pathspec").toContain(
      `specrunner/changes/${slug}/events.jsonl`,
    );
    expect(addArgs, "usage.json must be in scoped add pathspec").toContain(
      `specrunner/changes/${slug}/usage.json`,
    );
  });

  it("declared result file AND managed paths are both in the git add pathspec", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "status": { exitCode: 0, stdout: "" },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    const addCall = calls.find((c) => c.args[0] === "add");
    expect(addCall, "git add must have been called").toBeDefined();

    const addArgs = addCall!.args;
    // Declared result file
    expect(addArgs, "declared result file must be in pathspec").toContain(resultPath);
    // Managed paths (added automatically)
    expect(addArgs, "state.json must be in pathspec").toContain(`specrunner/changes/${slug}/state.json`);
    expect(addArgs, "events.jsonl must be in pathspec").toContain(`specrunner/changes/${slug}/events.jsonl`);
    expect(addArgs, "usage.json must be in pathspec").toContain(`specrunner/changes/${slug}/usage.json`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-023: scoped mode — residual protected dirty files are restored after staging
//
// Scenario: scoped step (spec-review) inadvertently modifies request.md.
// Scoped staging excludes request.md from the commit — correct.
// BUT without restoration, request.md stays dirty in the worktree. The NEXT
// guarded step (implementer) then sees request.md as changed, falsely reports a
// WRITE_SCOPE_VIOLATION attributed to implementer.
//
// Fix: two-step restore after scoped staging:
//   1. git clean -f -- <residualViolations>: removes newly created untracked files.
//   2. git checkout HEAD -- <residualViolations>: restores tracked modified files.
//
// Best-effort asymmetry: if git status fails (ok===false) after staging, the
// residual restoration is silently skipped. This is intentional — scoped restoration
// is defensive (prevents cross-step false positives in the NEXT step), not
// safety-critical. Guarded mode is the hard enforcement gate (fail-closed).
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-023: scoped mode — residual protected dirty files restored after staging", () => {
  it("calls git checkout HEAD for request.md that was changed but excluded from scoped staging", async () => {
    const slug = "test-slug";
    const requestMd = `specrunner/changes/${slug}/request.md`;
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    // After git add (scoped staging), git status still shows request.md as dirty
    // because it was NOT included in the scoped pathspec.
    const postStageDirtyStatus = ` M ${requestMd}\0`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        // post-stage git status returns request.md still dirty
        "status": { exitCode: 0, stdout: postStageDirtyStatus },
        "checkout": { exitCode: 0 }, // restore succeeds
        "diff": { exitCode: 1 }, // staged changes present
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    // spec-review does NOT declare request.md as a write target
    const step = makeScopedStep("spec-review", [resultPath]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    // git checkout HEAD -- request.md must be called to restore the dirty file
    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    expect(checkoutCall, "git checkout must be called for residual violation").toBeDefined();
    expect(checkoutCall!.args, "checkout must target HEAD").toContain("HEAD");
    expect(checkoutCall!.args, "checkout must use '--' separator").toContain("--");
    expect(checkoutCall!.args, "checkout must include request.md").toContain(requestMd);
  });

  it("does NOT call git checkout when no protected files are dirty after staging", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        // post-stage status is clean (no residual dirty files)
        "status": { exitCode: 0, stdout: "" },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    // With a clean worktree after staging, no checkout should be called
    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    expect(checkoutCall, "git checkout must NOT be called when no residual violations").toBeUndefined();
  });

  it("normal commit flow completes even when residual restore runs", async () => {
    const slug = "test-slug";
    const requestMd = `specrunner/changes/${slug}/request.md`;
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "status": { exitCode: 0, stdout: ` M ${requestMd}\0` },
        "checkout": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    // Must resolve (not throw) — restoration is transparent to callers
    await expect(commitAndPush(step, state, deps, null, infra)).resolves.toBeUndefined();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "commit must still be called").toContain("commit");
    expect(subcommands, "push must still be called").toContain("push");
  });

  it("declared protected file in writes() is NOT restored (step owns it)", async () => {
    const slug = "test-slug";
    // spec-fixer explicitly owns spec.md
    const specMd = `specrunner/changes/${slug}/spec.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        // spec.md is staged (and still shows in post-stage status as staged change)
        "status": { exitCode: 0, stdout: `M  ${specMd}\0` },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    // spec-fixer declares spec.md as its output
    const step = makeScopedStep("spec-fixer", [specMd]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    // spec.md is declared — must NOT be passed to git checkout (would undo staged change)
    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    if (checkoutCall) {
      expect(
        checkoutCall.args,
        "declared spec.md must not appear in git checkout args",
      ).not.toContain(specMd);
    }
  });

  it("git status failure after staging is silently skipped (best-effort asymmetry)", async () => {
    // postStatus.ok===false → skip residual restoration silently.
    // This is intentional: scoped post-staging restoration is defensive (prevents
    // cross-step false positives), not safety-critical. Guarded mode is the hard gate.
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        // git status fails after staging (e.g. git error)
        "status": { exitCode: 128 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    // Must complete without error — status failure is silently skipped
    await expect(commitAndPush(step, state, deps, null, infra)).resolves.toBeUndefined();

    // No git clean or checkout should be called (residual restoration skipped)
    const cleanCall = calls.find((c) => c.args[0] === "clean");
    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    expect(cleanCall, "git clean must NOT be called when status fails").toBeUndefined();
    expect(checkoutCall, "git checkout must NOT be called when status fails").toBeUndefined();

    // Commit and push must still complete normally
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "git commit must proceed despite status failure").toContain("commit");
    expect(subcommands, "git push must proceed despite status failure").toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// quarantine-01/02/03: violation evidence is preserved before restore
// 却下済み設計「自動 revert（証跡を消す）」への対処: 復元は checkpoint commit への
// 混入防止として機構的に必要だが、復元前に違反内容を machine-local sidecar へ退避する。
// ─────────────────────────────────────────────────────────────────────────────
describe("quarantine: violation evidence preserved before restore", () => {
  it("quarantine-01: guarded violation → evidence file written to .specrunner/local/<slug>/ with diff content", async () => {
    const slug = "test-slug";
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const statusOutput = ` M ${requestMdPath}\0`;
    const fakeDiff = "diff --git a/request.md b/request.md\n-old line\n+weakened line";

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "diff": { exitCode: 0, stdout: fakeDiff },
        "clean": { exitCode: 0 },
        "checkout": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    let thrown: unknown;
    try {
      await commitAndPush(step, state, deps, null, infra);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    const files = await fs.readdir(sidecarDir);
    const evidenceFiles = files.filter((f) => f.startsWith("write-scope-violation-implementer-"));
    expect(evidenceFiles.length).toBe(1);
    const content = await fs.readFile(path.join(sidecarDir, evidenceFiles[0]!), "utf-8");
    expect(content).toContain(requestMdPath);
    expect(content).toContain("weakened line");
    // Error message points the human at the quarantine file.
    expect(String((thrown as Error).message)).toContain("write-scope-violation-implementer-");
  });

  it("quarantine-02: untracked violation (no diff output) → raw file content captured", async () => {
    const slug = "test-slug";
    const newFilePath = `specrunner/changes/${slug}/design.md`;
    const statusOutput = `?? ${newFilePath}\0`;

    // Real untracked file in the temp worktree — diff returns empty for untracked.
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", slug), { recursive: true });
    await fs.writeFile(path.join(tempDir, newFilePath), "fabricated design content", "utf-8");

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "diff": { exitCode: 0, stdout: "" },
        "clean": { exitCode: 0 },
        "checkout": { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);
    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), null, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    const files = await fs.readdir(sidecarDir);
    const content = await fs.readFile(
      path.join(sidecarDir, files.find((f) => f.startsWith("write-scope-violation-"))!),
      "utf-8",
    );
    expect(content).toContain("fabricated design content");
  });

  it("quarantine-03: scoped residual restore → evidence file written and stderr note emitted", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    // After scoped staging, request.md remains dirty (residual violation).
    const statusOutput = ` M ${requestMdPath}\0`;

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "status": { exitCode: 0, stdout: statusOutput },
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "clean": { exitCode: 0 },
        "checkout": { exitCode: 0 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);
    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    const files = await fs.readdir(sidecarDir);
    expect(files.some((f) => f.startsWith("write-scope-violation-spec-review-"))).toBe(true);
    const stderrCalls = vi.mocked(process.stderr.write).mock.calls.map((c) => String(c[0]));
    expect(stderrCalls.some((c) => c.includes("境界外の残余変更"))).toBe(true);
  });
});
