/**
 * Real-git integration tests for write-scope bypass closure (3 bypass routes).
 *
 * TC-023: 実 git — 経路1: 事前 stage した許可外ファイルが commit に含まれない
 * TC-024: 実 git — 経路2: 自己 commit 違反（request.md 含む）で halt + push 抑止
 * TC-025: 実 git — 経路3: scoped 残余違反（request.md 改変）で halt + worktree 復元
 * TC-009: scoped residual halt prevents result adoption (integration variant)
 *
 * Each test uses a real local git repository (temp dir). Only `git push` is
 * intercepted (returns exit 0 without a remote). All other git commands run
 * against the real filesystem.
 *
 * Destruction confirmation:
 *   TC-023: revert T-04 (pathspec on commit) → this TC fails
 *   TC-024: revert T-05 (self-commit inspection) → this TC fails
 *   TC-025: revert T-06 (scoped residual halt) → this TC fails
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
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
// Mock pipelineManagedPaths to return controllable set
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../../src/core/step/round-git-scope.js", () => ({
  pipelineManagedPaths: (slug: string) => [
    `specrunner/changes/${slug}/state.json`,
    `specrunner/changes/${slug}/events.jsonl`,
    `specrunner/changes/${slug}/usage.json`,
  ],
}));

// ─────────────────────────────────────────────────────────────────────────────
// Real-git SpawnFn: delegates all commands to real git EXCEPT push.
// Push is intercepted (exits 0) so no remote is needed.
// ─────────────────────────────────────────────────────────────────────────────

function makeRealGitNoPushSpawnFn(): SpawnFn {
  return (bin: string, args: string[], opts: SpawnOptions): ChildProcess => {
    if (bin === "git" && args[0] === "push") {
      const em = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emAny = em as any;
      emAny.stdout = new EventEmitter();
      emAny.stderr = new EventEmitter();
      emAny.stdin = { write: () => true, end: () => {} };
      setImmediate(() => em.emit("close", 0));
      return em as unknown as ChildProcess;
    }
    return nodeSpawn(bin, args, opts);
  };
}

/**
 * Track whether push was intercepted (simulates "push not called" check).
 * Returns { spawnFn, pushCalled }.
 */
function makeRealGitNoPushSpawnFnWithPushTracking(): {
  spawnFn: SpawnFn;
  pushIntercepted: { count: number };
} {
  const pushIntercepted = { count: 0 };
  const inner = makeRealGitNoPushSpawnFn();

  const spawnFn: SpawnFn = (bin, args, opts) => {
    if (bin === "git" && args[0] === "push") {
      pushIntercepted.count++;
    }
    return inner(bin, args, opts);
  };

  return { spawnFn, pushIntercepted };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeJobState(step = "spec-review", branch = "feat/test-slug"): JobState {
  return {
    version: 1,
    jobId: "wsc-intg-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step,
    status: "running",
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

function makeDeps(slug: string, cwd: string): PipelineDeps {
  return {
    storeFactory: ((_jobId: string) => {
      throw new Error("not used in integration tests");
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
    cwd,
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

/** Run git command synchronously in given dir, throw on failure. */
function git(args: string[], cwd: string): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
}

/** Read HEAD sha synchronously */
function headSha(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" });
  if (result.status !== 0) throw new Error("rev-parse failed");
  return result.stdout.trim();
}

/** Get files in HEAD commit (for TC-023 verification) */
function commitFiles(cwd: string, ref = "HEAD"): string[] {
  const result = spawnSync(
    "git",
    ["show", "--name-only", "--format=", ref],
    { cwd, encoding: "utf-8" },
  );
  if (result.status !== 0) return [];
  return result.stdout.trim().split("\n").filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test setup: real git repo
// ─────────────────────────────────────────────────────────────────────────────

let gitDir: string;
const slug = "test-slug";

beforeEach(async () => {
  gitDir = await fs.mkdtemp(path.join(os.tmpdir(), "wsc-intg-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  // Initialize real git repo
  git(["init"], gitDir);
  git(["config", "user.email", "test@example.com"], gitDir);
  git(["config", "user.name", "WSC Integration Test"], gitDir);

  // Create initial commit with foundational files
  const changeFolder = path.join(gitDir, "specrunner", "changes", slug);
  await fs.mkdir(changeFolder, { recursive: true });

  // request.md (protected canon path)
  await fs.writeFile(
    path.join(changeFolder, "request.md"),
    "# Request\nOriginal content — must not be changed by pipeline steps.\n",
  );

  // result file (will be the declared write path for scoped steps)
  await fs.writeFile(
    path.join(changeFolder, "spec-review-result-001.md"),
    "# Result\nInitial placeholder.\n",
  );

  git(["add", "-A"], gitDir);
  git(["commit", "-m", "init: initial commit"], gitDir);
});

afterEach(async () => {
  await fs.rm(gitDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-023: 実 git — 経路1: 事前 stage した許可外ファイルが commit に含まれない
//
// GIVEN: 実 git temp repo で scoped step 実行前に許可外ファイル src/secret.ts を git add した状態
// WHEN: commitAndPush が scoped commit（pathspec 付き）を実行する
// THEN: git show --name-only HEAD で commit tree に src/secret.ts が含まれない
//
// DESTROY: T-04（pathspec 化）を revert すると本 TC が fail する。
//   Reason: without pathspec on commit, `git commit -m msg` commits entire index
//   including pre-staged src/secret.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-023: 実 git — 経路1: 事前 stage した許可外ファイルが commit に含まれない", () => {
  it("scoped commit does NOT include pre-staged unauthorized file src/secret.ts", async () => {
    const spawnFn = makeRealGitNoPushSpawnFn();

    // Pre-stage unauthorized file (before pipeline step runs)
    const srcDir = path.join(gitDir, "src");
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, "secret.ts"), "export const secret = 'leaked';");
    git(["add", "src/secret.ts"], gitDir);

    // Modify the declared result file (simulating step output)
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    await fs.writeFile(
      path.join(gitDir, resultPath),
      "# Result\nCompleted by spec-review step.\n",
    );

    const step = makeScopedStep("spec-review", [resultPath]);
    const deps = makeDeps(slug, gitDir);
    const infra = makeCommitPushInfra(spawnFn);

    // After T-04: scoped commit uses pathspec → src/secret.ts excluded
    // Before T-04: commit has no pathspec → src/secret.ts included (BUG)
    await commitAndPush(step, makeJobState(), deps, null, infra);

    const committed = commitFiles(gitDir);
    expect(
      committed,
      "src/secret.ts must NOT be in commit tree (pre-staged file excluded by scoped pathspec)",
    ).not.toContain("src/secret.ts");
    expect(
      committed,
      "declared result path must be in commit tree",
    ).toContain(resultPath);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-024: 実 git — 経路2: 自己 commit 違反（request.md 含む）で halt + push 抑止
//
// GIVEN: 実 git temp repo で agent が request.md を変更する commit を自分で作り、worktree は clean な状態
// WHEN: commitAndPush が headBeforeStep..HEAD を検査する
// THEN: WRITE_SCOPE_VIOLATION で halt し、intercept された push コールが発生しない
//
// DESTROY: T-05（自己 commit 検査）を revert すると本 TC が fail する。
//   Reason: without self-commit inspection, pushOnly is called regardless of commit content.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-024: 実 git — 経路2: 自己 commit 違反（request.md 含む）で halt + push 抑止", () => {
  it("WRITE_SCOPE_VIOLATION halt when guarded agent self-commit changes request.md", async () => {
    const { spawnFn, pushIntercepted } = makeRealGitNoPushSpawnFnWithPushTracking();

    const headBeforeStep = headSha(gitDir);

    // Agent self-commit: changes request.md (protected canon path)
    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    await fs.writeFile(
      path.join(gitDir, requestMdPath),
      "# Request\nWEAKENED by agent — this violates write-scope.\n",
    );
    git(["add", requestMdPath], gitDir);
    git(["commit", "-m", "agent: unauthorized change to request.md"], gitDir);
    // Worktree is now clean (agent committed)

    const step = makeGuardedStep("implementer");
    const deps = makeDeps(slug, gitDir);
    const infra = makeCommitPushInfra(spawnFn);

    // After T-05: detects request.md in headBeforeStep..HEAD → WRITE_SCOPE_VIOLATION
    // Before T-05: pushes directly without inspecting commit content
    await expect(
      commitAndPush(step, makeJobState("implementer"), deps, headBeforeStep, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

    // Push must NOT have been called (even though our spawnFn intercepts it)
    expect(
      pushIntercepted.count,
      "push must NOT be called when self-commit has violation",
    ).toBe(0);
  }, 30_000);

  it("violation halt message includes request.md path", async () => {
    const { spawnFn } = makeRealGitNoPushSpawnFnWithPushTracking();
    const headBeforeStep = headSha(gitDir);

    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    await fs.writeFile(
      path.join(gitDir, requestMdPath),
      "# Request\nWeakened.\n",
    );
    git(["add", requestMdPath], gitDir);
    git(["commit", "-m", "agent: unauthorized"], gitDir);

    const step = makeGuardedStep("implementer");
    const deps = makeDeps(slug, gitDir);
    const infra = makeCommitPushInfra(spawnFn);

    let caught: unknown;
    try {
      await commitAndPush(step, makeJobState("implementer"), deps, headBeforeStep, infra);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(String((caught as Error).message)).toContain(requestMdPath);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-025: 実 git — 経路3: scoped 残余違反（request.md 改変）で halt + worktree 復元
//
// GIVEN: 実 git temp repo で scoped step（judge）が request.md を worktree で改変した状態
//        （commit はしていない）
// WHEN: commitAndPush の residual 検査が request.md を違反として検出する
// THEN: WRITE_SCOPE_VIOLATION で halt し、worktree の request.md が HEAD の内容に復元されている
//
// DESTROY: T-06（残余 halt 化）を revert すると本 TC が fail する。
//   Reason: without halt, commitAndPush resolves and the modified request.md is not
//   treated as an error; result adoption continues with the contaminated canon.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-025: 実 git — 経路3: scoped 残余違反（request.md 改変）で halt + worktree 復元", () => {
  it("WRITE_SCOPE_VIOLATION halt when scoped step changes request.md in worktree", async () => {
    const spawnFn = makeRealGitNoPushSpawnFn();

    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const originalContent = await fs.readFile(path.join(gitDir, requestMdPath), "utf-8");

    // Scoped step modifies request.md in worktree (but does not commit it)
    await fs.writeFile(
      path.join(gitDir, requestMdPath),
      "# Request\nModified by scoped judge step — this is a residual violation.\n",
    );

    // Modify the declared result file (legitimate step output)
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    await fs.writeFile(
      path.join(gitDir, resultPath),
      "# Result\nCompleted.\n",
    );

    const step = makeScopedStep("spec-review", [resultPath]);
    const deps = makeDeps(slug, gitDir);
    const infra = makeCommitPushInfra(spawnFn);

    // After T-06: WRITE_SCOPE_VIOLATION halt
    // Before T-06: resolves (continues with contaminated canon)
    await expect(
      commitAndPush(step, makeJobState(), deps, null, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

    // Worktree request.md must be restored to HEAD content (original)
    const restoredContent = await fs.readFile(path.join(gitDir, requestMdPath), "utf-8");
    expect(
      restoredContent,
      "request.md must be restored to HEAD content after halt",
    ).toBe(originalContent);
  }, 30_000);

  it("worktree restore happens before halt (request.md is clean after throw)", async () => {
    const spawnFn = makeRealGitNoPushSpawnFn();

    const requestMdPath = `specrunner/changes/${slug}/request.md`;
    const originalContent = await fs.readFile(path.join(gitDir, requestMdPath), "utf-8");

    // Scoped judge step changes request.md
    await fs.writeFile(
      path.join(gitDir, requestMdPath),
      "CONTAMINATED CONTENT — judges should not write here\n",
    );

    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;
    await fs.writeFile(path.join(gitDir, resultPath), "Result content.\n");

    const step = makeScopedStep("spec-review", [resultPath]);
    const deps = makeDeps(slug, gitDir);
    const infra = makeCommitPushInfra(spawnFn);

    try {
      await commitAndPush(step, makeJobState(), deps, null, infra);
    } catch {
      // Expected: WRITE_SCOPE_VIOLATION
    }

    // Verify restore happened: worktree is clean at request.md
    const afterHalt = await fs.readFile(path.join(gitDir, requestMdPath), "utf-8");
    expect(
      afterHalt,
      "worktree request.md must match HEAD content (restored before halt)",
    ).toBe(originalContent);
  }, 30_000);
});
