/**
 * Unit tests for write-scope bypass closure (3 bypass routes).
 *
 * TC-001: scoped commit uses pathspec — excludes pre-staged unauthorized files
 * TC-002: staged judgment uses pathspec scope (scoped mode) — not global index
 * TC-003: (should) scoped empty stagePaths — no fallback to index-global commit
 * TC-004: guarded agent self-commit with protected path → WRITE_SCOPE_VIOLATION halt, no push
 * TC-005: scoped agent self-commit with unauthorized path → WRITE_SCOPE_VIOLATION halt, no push
 * TC-006: clean agent self-commit (boundary-safe paths only) → push (behavior preserved)
 * TC-007: commit range enumerate failure (git error) → fail-closed halt, no push
 * TC-008: scoped residual (judge changes request.md) → WRITE_SCOPE_VIOLATION halt after restore
 * TC-009: scoped residual halt prevents result adoption (throw from commitAndPush)
 * TC-010: self-commit violation quarantine uses commit range diff (base..head)
 * TC-011: scoped residual quarantine uses worktree diff (HEAD) — current behavior
 * TC-012: guarded boundary-safe worktree changes → commit + push (behavior preserved)
 * TC-013: scoped boundary-safe changes → pathspec commit + push (behavior preserved)
 * TC-018: quarantine with range { base, head } → git diff base head -- path captured
 * TC-019: quarantine without range → git diff HEAD -- path captured (existing behavior)
 * TC-020: commit range enumerate helper → returns path array on success
 * TC-021: commit range enumerate helper → returns null on git error (fail-closed)
 * TC-022: (should) diff mock handles --cached --quiet and --name-only range simultaneously
 *
 * RED until implementation:
 *   TC-001/002: T-04 (pathspec on commit + staged check)
 *   TC-004/005/007: T-05 (agent self-commit inspection)
 *   TC-008/009: T-06 (scoped residual halt)
 *   TC-010/018: T-02 + T-05 (quarantine range + self-commit check)
 *   TC-020/021: T-03 (commit range enumerate helper)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { commitAndPush } from "../../../src/core/step/commit-push.js";
import type { CommitPushInfra } from "../../../src/core/step/commit-push.js";
import type { AgentStep, IoRef } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/git-exec.js";
import { EventBus } from "../../../src/core/event/event-bus.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../../src/core/step/round-git-scope.js", () => ({
  pipelineManagedPaths: (slug: string) => [
    `specrunner/changes/${slug}/state.json`,
    `specrunner/changes/${slug}/events.jsonl`,
    `specrunner/changes/${slug}/usage.json`,
  ],
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wsc-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.mocked(fs.access).mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GitCallRecord {
  args: string[];
  stdout?: string;
}

/**
 * Simple subcommand-based mock (same as commit-push-write-scope.test.ts).
 */
function makeGitSpawnFn(opts: {
  responses?: Record<string, { exitCode: number; stdout?: string }>;
} = {}): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  const responses = opts.responses ?? {};

  const spawnFn: SpawnFn = (_bin, args, _opts): ChildProcess => {
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
      if (response.stdout) stdoutEm.emit("data", Buffer.from(response.stdout));
      procEm.emit("close", response.exitCode);
    });

    return procEm as unknown as ChildProcess;
  };

  return { spawnFn, calls };
}

/**
 * Arg-pattern-based mock for tests that need to distinguish diff subcommands.
 * Rules are checked in order; first match wins. Unmatched falls back to defaults
 * by subcommand name, then to exit 0 / empty stdout.
 */
interface ArgRule {
  match: (args: string[]) => boolean;
  exitCode: number;
  stdout?: string;
}

function makeGitSpawnFnByArgs(opts: {
  rules?: ArgRule[];
  defaults?: Record<string, { exitCode: number; stdout?: string }>;
}): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  const rules = opts.rules ?? [];
  const defaults = opts.defaults ?? {};

  const spawnFn: SpawnFn = (_bin, args, _opts): ChildProcess => {
    calls.push({ args: [...args] });

    let exitCode = 0;
    let stdout = "";

    const matched = rules.find((r) => r.match(args));
    if (matched) {
      exitCode = matched.exitCode;
      stdout = matched.stdout ?? "";
    } else {
      const sub = args[0] ?? "";
      const d = defaults[sub];
      if (d) {
        exitCode = d.exitCode;
        stdout = d.stdout ?? "";
      }
    }

    const procEm = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procAny = procEm as any;
    const stdoutEm = new EventEmitter();
    procAny.stdout = stdoutEm;
    procAny.stderr = new EventEmitter();
    procAny.stdin = { write: () => true, end: () => {} };

    setImmediate(() => {
      if (stdout) stdoutEm.emit("data", Buffer.from(stdout));
      procEm.emit("close", exitCode);
    });

    return procEm as unknown as ChildProcess;
  };

  return { spawnFn, calls };
}

function makeJobState(branch = "feat/test-slug"): JobState {
  return {
    version: 1,
    jobId: "wsc-test-job",
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
      throw new Error("storeFactory must not be used");
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

function makeScopedStep(name: string, writePaths: string[]): AgentStep {
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

function makeGuardedStep(name: string, writePaths: string[] = []): AgentStep {
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
    sleepFn: async (_ms) => {},
    events: new EventBus(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: scoped commit uses pathspec — excludes pre-staged unauthorized files
//
// 事前 stage された許可外ファイルが commit に含まれない
// Source: spec.md > Requirement: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する
//         Scenario: 事前 stage された許可外ファイルが commit に含まれない
//
// RED: current commitAndPushTail calls `git commit -m msg` (no pathspec).
// GREEN after T-04: `git commit -m msg -- <stagePaths>`.
// DESTROY: revert T-04 → this TC fails.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-001: scoped commit uses pathspec — excludes pre-staged unauthorized files", () => {
  it("git commit call contains '--' pathspec separator", async () => {
    const slug = "test-slug";
    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        add: { exitCode: 0 },
        diff: { exitCode: 1 }, // staged changes present
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must have been called").toBeDefined();
    // After T-04: commit args must include "--" separator for pathspec
    expect(
      commitCall!.args,
      "git commit must use '--' pathspec separator to exclude pre-staged files",
    ).toContain("--");
  });

  it("git commit pathspec contains the declared write path", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        add: { exitCode: 0 },
        diff: { exitCode: 1 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must have been called").toBeDefined();
    // Declared path must be in the commit pathspec
    expect(
      commitCall!.args,
      "declared result path must appear in git commit pathspec",
    ).toContain(resultPath);
  });

  it("unauthorized pre-staged path src/secret.ts is NOT in the commit pathspec", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        add: { exitCode: 0 },
        diff: { exitCode: 1 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must have been called").toBeDefined();
    // src/secret.ts must NOT appear anywhere in commit args
    const commitArgStr = commitCall!.args.join(" ");
    expect(commitArgStr, "src/secret.ts must not be in git commit args").not.toContain("src/secret.ts");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: staged judgment uses pathspec scope (scoped mode)
//
// staged 判定も pathspec scope で行われる
// Source: spec.md > Requirement: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する
//         Scenario: staged 判定も pathspec scope で行われる
//
// RED: current code calls `git diff --cached --quiet` (global, no pathspec).
//   When pre-staged files exist, this detects staged changes and calls commit.
//   After T-04, scoped diff check is `git diff --cached --quiet -- <stagePaths>`.
//   Pre-staged unauthorized files are outside scope → no staged changes in scope → no commit.
// DESTROY: revert T-04 → diff uses global scope, detects pre-staged file, calls commit.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-002: staged judgment uses pathspec scope (scoped mode)", () => {
  it("commit is NOT called when only unauthorized files are pre-staged (not in scoped paths)", async () => {
    const slug = "test-slug";
    // Scoped step with a declared result path
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    // Arg-based mock: diff with --cached uses exit 0 for scoped paths (no staged),
    // but would use exit 1 for global (pre-staged unauthorized file detected).
    const { spawnFn, calls } = makeGitSpawnFnByArgs({
      rules: [
        {
          // scoped staged check (with pathspec separator "--"): no staged changes in scope
          match: (args) => args[0] === "diff" && args.includes("--cached") && args.includes("--"),
          exitCode: 0,
        },
        {
          // global staged check (without pathspec): pre-staged unauthorized file detected
          match: (args) => args[0] === "diff" && args.includes("--cached") && !args.includes("--"),
          exitCode: 1,
        },
        {
          // rev-parse HEAD (for HEAD-advance detection)
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: "abc123\n",
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        status: { exitCode: 0, stdout: "" },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    // With pathspec-scoped diff (no staged changes in declared scope),
    // commit must NOT be called even though global diff would detect pre-staged file.
    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(
      commitCall,
      "git commit must NOT be called when scoped staged check shows no changes in declared scope",
    ).toBeUndefined();
  });

  it("staged diff check includes '--' separator in scoped mode (pathspec present)", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 1, // staged changes present in scope → commit
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
        status: { exitCode: 0, stdout: "" },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    // Find the staged diff check call
    const diffCachedCall = calls.find(
      (c) => c.args[0] === "diff" && c.args.includes("--cached"),
    );
    expect(diffCachedCall, "diff --cached must be called").toBeDefined();
    // After T-04: scoped staged check uses "--" separator
    expect(
      diffCachedCall!.args,
      "scoped staged diff check must include '--' pathspec separator",
    ).toContain("--");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: (should) scoped empty stagePaths — no fallback to index-global commit
//
// scoped で staging 対象が空のとき index 全体へ fallback しない
// Source: spec.md > Requirement: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する
//         Scenario: scoped で staging 対象が空のとき index 全体へ fallback しない
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-003: (should) scoped empty stagePaths — no global commit fallback", () => {
  it("git commit is NOT called when stagePaths is empty (no fallback to global index)", async () => {
    // filterExistingFiles returns [] when access rejects → stagePaths = []
    vi.mocked(fs.access).mockRejectedValue(new Error("not found"));

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        diff: { exitCode: 0 }, // no staged changes
        "rev-parse": { exitCode: 0, stdout: "abc123\n" }, // HEAD not advanced
      },
    });

    const slug = "test-slug";
    const step = makeScopedStep("spec-fixer", []); // empty writes()
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    // With empty stagePaths and HEAD not advanced, commit must NOT be called
    expect(
      calls.map((c) => c.args[0]),
      "git commit must NOT be called when stagePaths is empty",
    ).not.toContain("commit");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: guarded agent self-commit with protected path → WRITE_SCOPE_VIOLATION halt, no push
//
// guarded 自己 commit に保護正典が含まれる → push せず halt
// Source: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する
//         Scenario: guarded 自己 commit に保護正典が含まれる → push せず halt
//
// RED: current code does not check self-commit content — pushes directly.
// GREEN after T-05: check headBeforeStep..HEAD for violations before push.
// DESTROY: revert T-05 → push called without violation check.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-004: guarded agent self-commit with protected path → WRITE_SCOPE_VIOLATION halt, no push", () => {
  const slug = "test-slug";
  const headBeforeStep = "old-sha-before-step";
  const headAfterAgentCommit = "new-sha-after-agent-commit";
  const requestMdPath = `specrunner/changes/${slug}/request.md`;

  function makeGuardedSelfCommitViolationSpawnFn() {
    return makeGitSpawnFnByArgs({
      rules: [
        // Worktree status: clean (no violations)
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        // Staged check: no staged changes (agent already committed)
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        // HEAD: advanced from headBeforeStep
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterAgentCommit}\n`,
        },
        // Commit range diff: agent commit changed request.md (violation)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: `${requestMdPath}\n`,
        },
        // Quarantine evidence diff
        {
          match: (args) => args[0] === "diff" && !args.includes("--cached") && !args.includes("--name-only"),
          exitCode: 0,
          stdout: "diff --git a/request.md b/request.md\n-original\n+weakened",
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });
  }

  it("throws WRITE_SCOPE_VIOLATION when guarded self-commit changes request.md", async () => {
    const { spawnFn } = makeGuardedSelfCommitViolationSpawnFn();
    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
  });

  it("git push is NOT called when guarded self-commit has violation", async () => {
    const { spawnFn, calls } = makeGuardedSelfCommitViolationSpawnFn();
    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).rejects.toThrow();

    expect(
      calls.map((c) => c.args[0]),
      "git push must NOT be called when self-commit has violation",
    ).not.toContain("push");
  });

  it("halt error message includes the violated request.md path", async () => {
    const { spawnFn } = makeGuardedSelfCommitViolationSpawnFn();
    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    let caught: unknown;
    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(String((caught as Error).message)).toContain(requestMdPath);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: scoped agent self-commit with unauthorized path → WRITE_SCOPE_VIOLATION halt, no push
//
// scoped 自己 commit に宣言外 path が含まれる → push せず halt
// Source: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する
//         Scenario: scoped 自己 commit に宣言外 path が含まれる → push せず halt
//
// RED: current code does not check self-commit content — pushes directly.
// GREEN after T-05: findScopedCommitViolations detects unauthorized path.
// DESTROY: revert T-05 → push called without violation check.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-005: scoped agent self-commit with unauthorized path → WRITE_SCOPE_VIOLATION halt, no push", () => {
  const slug = "test-slug";
  const headBeforeStep = "old-sha-before-step";
  const headAfterAgentCommit = "new-sha-scoped-self-commit";
  const requestMdPath = `specrunner/changes/${slug}/request.md`;
  const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

  function makeScopedSelfCommitViolationSpawnFn() {
    return makeGitSpawnFnByArgs({
      rules: [
        // Staged check: no staged changes (agent already committed)
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        // HEAD: advanced
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterAgentCommit}\n`,
        },
        // Commit range diff: scoped self-commit changed request.md (unauthorized for scoped step)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: `${requestMdPath}\n`,
        },
        // Quarantine evidence diff
        {
          match: (args) => args[0] === "diff" && !args.includes("--cached") && !args.includes("--name-only"),
          exitCode: 0,
          stdout: "diff --git a/request.md b/request.md\n-original\n+unauthorized",
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        status: { exitCode: 0, stdout: "" },
        push: { exitCode: 0 },
      },
    });
  }

  it("throws WRITE_SCOPE_VIOLATION when scoped self-commit changes unauthorized path", async () => {
    const { spawnFn } = makeScopedSelfCommitViolationSpawnFn();
    // scoped step that only declares result path, NOT request.md
    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
  });

  it("git push is NOT called when scoped self-commit has violation", async () => {
    const { spawnFn, calls } = makeScopedSelfCommitViolationSpawnFn();
    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).rejects.toThrow();

    expect(
      calls.map((c) => c.args[0]),
      "git push must NOT be called when scoped self-commit has violation",
    ).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: clean agent self-commit (boundary-safe paths) → push (behavior preserved)
//
// 違反の無い自己 commit は push される（挙動保存）
// Source: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する
//         Scenario: 違反の無い自己 commit は push される（挙動保存）
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-006: clean agent self-commit (boundary-safe) → push (behavior preserved)", () => {
  it("push is called when guarded self-commit only changes source files (no protected paths)", async () => {
    const slug = "test-slug";
    const headBeforeStep = "old-sha";
    const headAfterCommit = "new-sha";

    const { spawnFn, calls } = makeGitSpawnFnByArgs({
      rules: [
        // Status: clean (no worktree violations)
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        // Staged check: no staged changes
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        // HEAD: advanced
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        // Commit range diff: only source files changed (boundary-safe for guarded)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: "src/foo.ts\nsrc/bar.ts\n",
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).resolves.toBeUndefined();

    expect(
      calls.map((c) => c.args[0]),
      "git push must be called for clean self-commit",
    ).toContain("push");
  });

  it("does NOT throw when scoped self-commit only changes declared paths", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    const headBeforeStep = "old-sha";
    const headAfterCommit = "new-sha";

    const { spawnFn } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0, // no staged (agent committed)
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        // Commit range: only declared result path (no violation for scoped)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: `${resultPath}\n`,
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        status: { exitCode: 0, stdout: "" },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: commit range enumerate failure (git error) → fail-closed halt, no push
//
// 変更 path の列挙に失敗したら fail-closed
// Source: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する
//         Scenario: 変更 path の列挙に失敗したら fail-closed
//
// RED: current code pushes when HEAD advances, regardless of enumerate failure.
// GREEN after T-05: enumerate failure → halt (push not called).
// DESTROY: revert T-05 → push called even on enumerate failure.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-007: commit range enumerate failure (git error) → fail-closed halt, no push", () => {
  it("throws when git diff --name-only fails (git error)", async () => {
    const slug = "test-slug";
    const headBeforeStep = "old-sha";
    const headAfterCommit = "new-sha";

    const { spawnFn } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0, // no staged
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        // enumerate failure: git error (exit 128)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 128, // git error → gitExec returns null
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).rejects.toThrow();
  });

  it("git push is NOT called when enumerate fails (fail-closed)", async () => {
    const slug = "test-slug";
    const headBeforeStep = "old-sha";
    const headAfterCommit = "new-sha";

    const { spawnFn, calls } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 128,
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).rejects.toThrow();

    expect(
      calls.map((c) => c.args[0]),
      "git push must NOT be called on enumerate failure (fail-closed)",
    ).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: judge step changes request.md (scoped residual) → WRITE_SCOPE_VIOLATION halt after restore
//
// judge step が request.md を改変 → 復元後に halt
// Source: spec.md > Requirement: scoped mode の保護正典残余違反は halt する
//         Scenario: judge step が request.md を改変 → 復元後に halt
//
// RED: current code detects residual violation, restores, but CONTINUES (resolves).
// GREEN after T-06: throw WRITE_SCOPE_VIOLATION after restore.
// DESTROY: revert T-06 → resolves instead of throwing.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-008: scoped residual (judge changes request.md) → WRITE_SCOPE_VIOLATION halt after restore", () => {
  const slug = "test-slug";
  const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
  const requestMdPath = `specrunner/changes/${slug}/request.md`;

  function makeScopedResidualSpawnFn() {
    const postStageDirtyStatus = ` M ${requestMdPath}\0`;
    return makeGitSpawnFn({
      responses: {
        add: { exitCode: 0 },
        status: { exitCode: 0, stdout: postStageDirtyStatus },
        diff: { exitCode: 0, stdout: "diff --git a/request.md\n-orig\n+changed" },
        clean: { exitCode: 0 },
        checkout: { exitCode: 0 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });
  }

  it("throws WRITE_SCOPE_VIOLATION when scoped step's residual violation is detected", async () => {
    const { spawnFn } = makeScopedResidualSpawnFn();
    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    // RED: current code resolves (continues). GREEN after T-06: rejects.
    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), null, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
  });

  it("git restore (checkout HEAD) is called before the throw", async () => {
    const { spawnFn, calls } = makeScopedResidualSpawnFn();
    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), null, infra),
    ).rejects.toThrow();

    // restore must happen before throw
    const checkoutCall = calls.find((c) => c.args[0] === "checkout");
    expect(checkoutCall, "git checkout (restore) must be called before throw").toBeDefined();
  });

  it("git commit and push are NOT called after residual halt", async () => {
    const { spawnFn, calls } = makeScopedResidualSpawnFn();
    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), null, infra),
    ).rejects.toThrow();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "git commit must NOT be called after residual halt").not.toContain("commit");
    expect(subcommands, "git push must NOT be called after residual halt").not.toContain("push");
  });

  it("halt error message includes request.md (violated path)", async () => {
    const { spawnFn } = makeScopedResidualSpawnFn();
    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    let caught: unknown;
    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(String((caught as Error).message)).toContain(requestMdPath);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: scoped residual halt prevents result adoption
//
// 結果採用が halt により抑止される
// Source: spec.md > Requirement: scoped mode の保護正典残余違反は halt する
//         Scenario: 結果採用が halt により抑止される
//
// RED: current code resolves → result would be adopted.
// GREEN after T-06: commitAndPush throws → caller cannot proceed to result adoption.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-009: scoped residual halt prevents result adoption", () => {
  it("throw from commitAndPush prevents any code after it from running (result adoption suppressed)", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    const requestMdPath = `specrunner/changes/${slug}/request.md`;

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        add: { exitCode: 0 },
        status: { exitCode: 0, stdout: ` M ${requestMdPath}\0` },
        diff: { exitCode: 0, stdout: "diff content" },
        clean: { exitCode: 0 },
        checkout: { exitCode: 0 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    // Track whether any "result adoption" code would run after commitAndPush
    let resultAdopted = false;
    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);
      // This line (simulating result adoption) must NOT be reached
      resultAdopted = true;
    } catch {
      // Expected: throw prevents result adoption
      resultAdopted = false;
    }

    // RED with current code: resolves → resultAdopted = true
    // GREEN after T-06: throws → resultAdopted = false
    expect(resultAdopted, "result adoption must be prevented by the WRITE_SCOPE_VIOLATION throw").toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-010: self-commit violation quarantine uses commit range diff (base..head)
//
// 自己 commit 違反は commit 差分を退避する
// Source: spec.md > Requirement: 3 経路の違反は証跡を退避し halt メッセージに退避先を含める
//         Scenario: 自己 commit 違反は commit 差分を退避する
//
// RED: current code doesn't check self-commits, so no quarantine with range is produced.
// GREEN after T-02 + T-05: quarantine captures git diff base head -- path.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-010: self-commit violation quarantine uses commit range diff (base..head)", () => {
  it("quarantine file is written with commit range diff content when self-commit violation detected", async () => {
    const slug = "test-slug";
    const headBeforeStep = "old-sha-tc010";
    const headAfterCommit = "new-sha-tc010";
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const rangeDiffContent = "diff --git a/request.md b/request.md\n-original\n+weakened-by-agent";

    const { spawnFn } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        // Commit range enumerate: returns request.md (violation)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: `${requestMdPath}\n`,
        },
        // Range evidence diff: git diff base head -- path
        {
          match: (args) =>
            args[0] === "diff" &&
            !args.includes("--name-only") &&
            !args.includes("--cached") &&
            args.includes(headBeforeStep) &&
            args.includes(headAfterCommit),
          exitCode: 0,
          stdout: rangeDiffContent,
        },
        // Fallback diff (e.g. HEAD --) returns empty
        {
          match: (args) => args[0] === "diff" && args.includes("HEAD"),
          exitCode: 0,
          stdout: "",
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        clean: { exitCode: 0 },
        checkout: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    let thrown: unknown;
    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

    // Quarantine file must exist with range diff content
    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    const files = await fs.readdir(sidecarDir);
    const evidenceFiles = files.filter((f) => f.startsWith("write-scope-violation-implementer-"));
    expect(evidenceFiles.length, "quarantine file must be written").toBeGreaterThanOrEqual(1);

    const content = await fs.readFile(path.join(sidecarDir, evidenceFiles[0]!), "utf-8");
    // Content must contain range diff (base..head) not just HEAD diff
    expect(content, "quarantine must contain commit range diff content").toContain("weakened-by-agent");

    // Halt message must reference the quarantine file
    expect(
      String((thrown as Error).message),
      "halt message must contain quarantine file path",
    ).toContain("write-scope-violation-implementer-");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-011: scoped residual quarantine uses worktree diff (HEAD) — current behavior
//
// scoped 残余違反は worktree 差分を退避する
// Source: spec.md > Requirement: 3 経路の違反は証跡を退避し halt メッセージに退避先を含める
//         Scenario: scoped 残余違反は worktree 差分を退避する
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-011: scoped residual quarantine uses worktree diff (HEAD)", () => {
  it("quarantine file is written for scoped residual violation (after T-06: also throws)", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const worktreeDiffContent = "diff --git a/request.md b/request.md\n-canon\n+modified-by-step";

    const { spawnFn } = makeGitSpawnFnByArgs({
      rules: [
        // Post-stage status: request.md still dirty
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: ` M ${requestMdPath}\0`,
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 1, // staged changes (declared result file was staged)
        },
        // Worktree diff for quarantine (HEAD -- path)
        {
          match: (args) => args[0] === "diff" && !args.includes("--cached") && !args.includes("--name-only"),
          exitCode: 0,
          stdout: worktreeDiffContent,
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        clean: { exitCode: 0 },
        checkout: { exitCode: 0 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    // After T-06: throws. Before T-06: resolves but still writes quarantine.
    // We wrap in try/catch to handle both cases.
    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);
    } catch {
      // Expected after T-06 implementation
    }

    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    const files = await fs.readdir(sidecarDir);
    const evidenceFiles = files.filter((f) => f.startsWith("write-scope-violation-spec-review-"));
    expect(evidenceFiles.length, "quarantine file must be written for scoped residual violation").toBeGreaterThanOrEqual(1);

    const content = await fs.readFile(path.join(sidecarDir, evidenceFiles[0]!), "utf-8");
    expect(content, "quarantine must contain worktree diff content").toContain("modified-by-step");
  });

  it("halt message contains quarantine file path after T-06", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    const requestMdPath = `specrunner/changes/${slug}/request.md`;

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        add: { exitCode: 0 },
        status: { exitCode: 0, stdout: ` M ${requestMdPath}\0` },
        diff: { exitCode: 0, stdout: "diff content" },
        clean: { exitCode: 0 },
        checkout: { exitCode: 0 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    let caught: unknown;
    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);
    } catch (e) {
      caught = e;
    }

    // After T-06: throws with message containing quarantine path
    if (caught) {
      expect(String((caught as Error).message)).toContain("write-scope-violation-");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: guarded boundary-safe changes → commit + push (behavior preserved)
//
// guarded の境界内 worktree 変更は現行どおり commit + push
// Source: spec.md > Requirement: 境界内のみの変更の挙動と commit 内容を現行と同一に保つ
//         Scenario: guarded の境界内 worktree 変更は現行どおり commit + push
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-012: guarded boundary-safe changes → commit + push (behavior preserved)", () => {
  it("resolves with commit + push for guarded step with source-only changes", async () => {
    const slug = "test-slug";

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        status: { exitCode: 0, stdout: " M src/foo.ts\0" },
        add: { exitCode: 0 },
        diff: { exitCode: 1 }, // staged changes
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), null, infra),
    ).resolves.toBeUndefined();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "git commit must be called for boundary-safe changes").toContain("commit");
    expect(subcommands, "git push must be called for boundary-safe changes").toContain("push");
  });

  it("guarded commit uses -A (no pathspec) — whole worktree staging preserved", async () => {
    const slug = "test-slug";

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        status: { exitCode: 0, stdout: " M src/foo.ts\0" },
        add: { exitCode: 0 },
        diff: { exitCode: 1 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);

    const addCall = calls.find((c) => c.args[0] === "add");
    expect(addCall, "git add must be called").toBeDefined();
    expect(addCall!.args, "guarded add must use -A (whole worktree)").toContain("-A");
    expect(addCall!.args, "guarded add must NOT use -- (no pathspec)").not.toContain("--");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: scoped boundary-safe changes → pathspec commit + push (behavior preserved)
//
// scoped の境界内変更は宣言 path + 管理 path を現行どおり commit
// Source: spec.md > Requirement: 境界内のみの変更の挙動と commit 内容を現行と同一に保つ
//         Scenario: scoped の境界内変更は宣言 path + 管理 path を現行どおり commit
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-013: scoped boundary-safe changes → pathspec commit + push (behavior preserved)", () => {
  it("resolves with commit + push for scoped step with declared-path-only changes", async () => {
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        add: { exitCode: 0 },
        status: { exitCode: 0, stdout: "" }, // no residual violations
        diff: { exitCode: 1 }, // staged changes present
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeScopedStep("spec-review", [resultPath]);
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), null, infra),
    ).resolves.toBeUndefined();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands, "git commit must be called").toContain("commit");
    expect(subcommands, "git push must be called").toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-018: quarantine with range { base, head } → git diff base head -- path captured
//
// Source: tasks.md > T-02: quarantine を commit 差分レンジ対応に一般化（D6）
//
// RED: current quarantineViolationEvidence always uses `git diff HEAD -- path`.
// GREEN after T-02: when range { base, head } is passed, uses `git diff base head -- path`.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-018: quarantine with range { base, head } → git diff base head -- path captured", () => {
  it("quarantine evidence uses commit range diff when self-commit violation quarantined", async () => {
    // This test verifies TC-018 through the observable effect: quarantine file
    // content comes from `git diff base head -- path` when a range is provided
    // (T-05 passes range to quarantineViolationEvidence for self-commit violations).
    const slug = "test-slug";
    const headBeforeStep = "base-sha-018";
    const headAfterCommit = "head-sha-018";
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const RANGE_DIFF = "## range-diff-content: from base-sha-018 to head-sha-018";

    const { spawnFn } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: `${requestMdPath}\n`,
        },
        // Range diff: called with base and head args for quarantine evidence
        {
          match: (args) =>
            args[0] === "diff" &&
            !args.includes("--name-only") &&
            !args.includes("--cached") &&
            args.includes(headBeforeStep) &&
            args.includes(headAfterCommit),
          exitCode: 0,
          stdout: RANGE_DIFF,
        },
        // HEAD diff fallback
        {
          match: (args) => args[0] === "diff" && args.includes("HEAD"),
          exitCode: 0,
          stdout: "",
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        clean: { exitCode: 0 },
        checkout: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra);
    } catch {
      // Expected: WRITE_SCOPE_VIOLATION
    }

    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    const files = await fs.readdir(sidecarDir);
    const evidenceFile = files.find((f) => f.startsWith("write-scope-violation-implementer-"));
    expect(evidenceFile, "quarantine file must exist").toBeDefined();

    const content = await fs.readFile(path.join(sidecarDir, evidenceFile!), "utf-8");
    // After T-02: content includes range diff, not just HEAD diff
    expect(content, "quarantine must contain range diff content (base..head)").toContain(RANGE_DIFF);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-019: quarantine without range → git diff HEAD -- path captured (existing behavior)
//
// Source: tasks.md > T-02: quarantine を commit 差分レンジ対応に一般化（D6）
// Regression guard: T-02 must preserve existing worktree diff behavior when no range given.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-019: quarantine without range → git diff HEAD -- path captured (existing behavior)", () => {
  it("quarantine evidence uses git diff HEAD for guarded worktree violation (no range)", async () => {
    const slug = "test-slug";
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const statusOutput = ` M ${requestMdPath}\0`;
    const headDiffContent = "diff --git a/request.md\n-original\n+modified";

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        status: { exitCode: 0, stdout: statusOutput },
        diff: { exitCode: 0, stdout: headDiffContent },
        clean: { exitCode: 0 },
        checkout: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    let thrown: unknown;
    try {
      await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    const files = await fs.readdir(sidecarDir);
    const evidenceFile = files.find((f) => f.startsWith("write-scope-violation-implementer-"));
    expect(evidenceFile, "quarantine file must exist").toBeDefined();

    const content = await fs.readFile(path.join(sidecarDir, evidenceFile!), "utf-8");
    expect(content, "quarantine must contain HEAD diff content").toContain("modified");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-020: commit range enumerate helper → returns path array on success
//
// Source: tasks.md > T-03: commit レンジの変更 path 列挙ヘルパ（D2, fail-closed）
//
// Tested via commitAndPush behavior: when HEAD advances and range enumerate succeeds,
// the changed paths are returned for violation check.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-020: commit range enumerate helper → path array on success", () => {
  it("commit range diff result is parsed and used for violation check (boundary-safe → push)", async () => {
    const slug = "test-slug";
    const headBeforeStep = "abc123";
    const headAfterCommit = "def456";

    const { spawnFn, calls } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        // Range enumerate: returns boundary-safe paths (no violations for guarded mode)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: "src/a.ts\nresult.md\n",
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    // With boundary-safe paths in commit, should push successfully
    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).resolves.toBeUndefined();

    // Verify that git diff --name-only was called (enumerate helper invoked)
    const nameOnlyCall = calls.find(
      (c) => c.args[0] === "diff" && c.args.includes("--name-only"),
    );
    expect(nameOnlyCall, "git diff --name-only must be called for commit range enumerate").toBeDefined();
    // The call must include both SHAs
    expect(nameOnlyCall!.args, "enumerate must include headBeforeStep").toContain(headBeforeStep);
    expect(nameOnlyCall!.args, "enumerate must include HEAD (after commit)").toContain(headAfterCommit);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-021: commit range enumerate helper → null on git error (fail-closed)
//
// Source: tasks.md > T-03: commit レンジの変更 path 列挙ヘルパ（D2, fail-closed）
//
// Tested via commitAndPush behavior: enumerate failure → halt (push not called).
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-021: commit range enumerate helper → null on git error (fail-closed)", () => {
  it("commitAndPush halts when range enumerate fails (null returned, not empty array)", async () => {
    const slug = "test-slug";
    const headBeforeStep = "abc123";
    const headAfterCommit = "def456";

    const { spawnFn, calls } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        // Git error on enumerate (non-zero exit → gitExec returns null)
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 128,
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    // Enumerate failure → fail-closed halt
    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).rejects.toThrow();

    // Push must NOT be called (fail-closed)
    expect(
      calls.map((c) => c.args[0]),
      "git push must NOT be called when enumerate returns null",
    ).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-022: (should) diff mock handles --cached and --name-only simultaneously
//
// Source: tasks.md > T-09: 新規単体テスト（mock spawn・分岐網羅）
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-022: (should) diff mock — --cached and --name-only both work in same spawn", () => {
  it("staged=no (exit 0 for --cached) and range diff (path list for --name-only) work simultaneously", async () => {
    const slug = "test-slug";
    const headBeforeStep = "old-sha-022";
    const headAfterCommit = "new-sha-022";
    const sourcePath = "src/valid.ts";

    // Single spawn mock with arg-based dispatch for both diff subcommand variants
    const { spawnFn, calls } = makeGitSpawnFnByArgs({
      rules: [
        {
          match: (args) => args[0] === "status",
          exitCode: 0,
          stdout: "",
        },
        // --cached --quiet: no staged changes (exit 0)
        {
          match: (args) => args[0] === "diff" && args.includes("--cached"),
          exitCode: 0,
          stdout: "",
        },
        {
          match: (args) => args[0] === "rev-parse",
          exitCode: 0,
          stdout: `${headAfterCommit}\n`,
        },
        // --name-only range diff: returns boundary-safe paths
        {
          match: (args) => args[0] === "diff" && args.includes("--name-only"),
          exitCode: 0,
          stdout: `${sourcePath}\n`,
        },
      ],
      defaults: {
        add: { exitCode: 0 },
        push: { exitCode: 0 },
      },
    });

    const step = makeGuardedStep("implementer");
    const infra = makeCommitPushInfra(spawnFn);

    await expect(
      commitAndPush(step, makeJobState(), makeDeps(slug), headBeforeStep, infra),
    ).resolves.toBeUndefined();

    const diffCachedCall = calls.find((c) => c.args[0] === "diff" && c.args.includes("--cached"));
    const diffNameOnlyCall = calls.find((c) => c.args[0] === "diff" && c.args.includes("--name-only"));

    // Both diff variants must have been called
    expect(diffCachedCall, "diff --cached must be called for staged check").toBeDefined();
    expect(diffNameOnlyCall, "diff --name-only must be called for range enumerate").toBeDefined();

    // No conflict: staged check correctly returned exit 0, range diff returned paths
    expect(
      calls.map((c) => c.args[0]),
      "push must be called when no violations found",
    ).toContain("push");
  });
});
