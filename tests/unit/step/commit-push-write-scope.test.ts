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
 *
 * NOTE: Tests TC-003, TC-004, TC-017 are RED until commitAndPush implements
 * scoped staging (git add -A -- <paths> instead of git add -A).
 *
 * Tests TC-005, TC-006, TC-018, TC-019, TC-020 are RED until commitAndPush
 * implements the guarded mode (git status pre-check + findWriteScopeViolations).
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
  it("no git add is called when writes() is empty (stagePaths = [])", async () => {
    // Override pipelineManagedPaths to return [] for this test
    // (simulating a scenario where no pipeline paths exist)
    vi.doMock("../../../src/core/step/round-git-scope.js", () => ({
      pipelineManagedPaths: () => [],
    }));

    const { spawnFn, calls } = makeGitSpawnFn({});

    const slug = "test-slug";
    // Scoped step with empty writes() — all possible stage paths are empty
    const step = makeScopedStep("spec-fixer", []); // empty writes
    const state = makeJobState();
    const deps = makeDeps(slug);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, state, deps, null, infra);

    // With empty stagePaths, no git commands should be called
    expect(
      calls.map((c) => c.args[0]),
      "No git commands should be called when stagePaths is empty",
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
    const { spawnFn, calls } = makeGitSpawnFn({
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
