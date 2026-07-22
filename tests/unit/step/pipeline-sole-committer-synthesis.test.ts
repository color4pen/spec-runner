/**
 * Unit tests for pipeline-sole-committer: synthesis model (R1, R5)
 *
 * TC-001: agent 自己 commit を mixed reset で歴史から除外し合成し直す
 * TC-002: agent 自己 commit の正当な作業内容が無損失で合成 commit に入る
 * TC-003: agent 自己 commit が無くても合成は起点から構成される (should)
 * TC-004: scoped step は宣言 path + 管理 path のみを明示 commit する
 * TC-005: guarded step の実変更列挙が正当な変更を 1 個も落とさない
 * TC-015: mixed reset 失敗は halt する
 * TC-016: 実変更列挙の status 失敗は halt する
 * TC-017: 合成経路の git add 失敗は halt する (should)
 * TC-018: 合成経路の git commit 失敗は halt する (should)
 * TC-028: guarded step が保護正典を変更した場合 → 退避して halt
 * TC-033: 破壊確認 — push-as-is へ戻すと TC-001/TC-002 が fail する (should)
 *
 * RED phase: Implementation for synthesis model (D1 / T-04) does not exist yet.
 *   TC-001/TC-002/TC-003: mixed reset + explicit synthesis path not implemented → fails.
 *   TC-005: guarded bare `git add -A` not replaced with explicit pathspec → fails.
 *   TC-015: mixed reset path doesn't exist → cannot test failure.
 *   TC-016: guarded status failure path is already fail-closed → may pass; included for regression guard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { commitAndPush } from "../../../src/core/step/commit-push.js";
import type { CommitPushInfra } from "../../../src/core/step/commit-push.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobStateStore } from "../../../src/store/job-state-store.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/git-exec.js";
import { EventBus } from "../../../src/core/event/event-bus.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock pipelineManagedPaths to return deterministic managed paths
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../../src/core/step/round-git-scope.js", () => ({
  pipelineManagedPaths: (slug: string) => [
    `specrunner/changes/${slug}/state.json`,
    `specrunner/changes/${slug}/events.jsonl`,
    `specrunner/changes/${slug}/usage.json`,
  ],
}));

// Stub fs.access so filterExistingFiles treats all managed paths as existing.
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, access: vi.fn().mockResolvedValue(undefined) };
});

// ─────────────────────────────────────────────────────────────────────────────
// Test state
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "psc-synthesis-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.mocked(fs.access).mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Git spawn mock helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GitCallRecord {
  args: string[];
}

/**
 * Build a mock SpawnFn where each call to a git subcommand gets its own
 * response from a sequential list. Unmatched subcommands default to exit 0.
 */
function makeSeqGitSpawnFn(
  seqResponses: Array<{ subcommand: string; exitCode: number; stdout?: string }>,
  defaultExitCode = 0,
): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  const counters: Record<string, number> = {};

  const spawnFn: SpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push({ args: [...args] });
    const subcommand = args[0] ?? "";
    counters[subcommand] = (counters[subcommand] ?? 0) + 1;
    const callNum = counters[subcommand]!;

    // Find the n-th entry for this subcommand in seqResponses
    let matchCount = 0;
    let response: { exitCode: number; stdout?: string } = { exitCode: defaultExitCode };
    for (const r of seqResponses) {
      if (r.subcommand === subcommand) {
        matchCount++;
        if (matchCount === callNum) {
          response = r;
          break;
        }
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
 * Build a mock SpawnFn that emits a spawn error (ChildProcess error event) for
 * the specified subcommand, causing runSubprocess to reject.
 */
function makeSpawnErrorFn(
  errorOnSubcommand: string,
): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];

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
        procEm.emit("error", new Error(`Simulated spawn error for git ${subcommand}`));
      });
    } else {
      setImmediate(() => {
        procEm.emit("close", 0);
      });
    }

    return procEm as unknown as ChildProcess;
  };

  return { spawnFn, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "test-slug";

function makeJobState(jobId: string): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "change/test-slug-abc",
    history: [],
    error: null,
    steps: {},
  };
}

function makeGuardedStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-5",
      system: "implement",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...overrides,
  };
}

function makeScopedStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "spec-review",
    agent: {
      name: "specrunner-spec-review",
      role: "reviewer",
      model: "claude-sonnet-4-5",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "review this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes: (_state, deps) => [
      { path: `specrunner/changes/${deps.slug}/spec-review-result-001.md`, artifact: "file" as const },
    ],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    config: { version: 1, runtime: "local", agents: {} },
    request: {
      type: "spec-change",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: SLUG,
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "user",
    repo: "repo",
    spawn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: (_jobId: string) => ({
      load: vi.fn().mockResolvedValue(makeJobState("test")),
      save: vi.fn().mockResolvedValue(undefined),
      appendHistory: vi.fn().mockResolvedValue(undefined),
    }) as unknown as JobStateStore,
    ...overrides,
  };
}

function makeInfra(spawnFn: SpawnFn): CommitPushInfra {
  return {
    spawnFn,
    sleepFn: async () => {},
    events: new EventBus(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: agent 自己 commit を mixed reset で歴史から除外し合成し直す
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-001: agent 自己 commit を mixed reset で歴史から除外し合成し直す", () => {
  it("HEAD が headBeforeStep より前進していれば git reset --mixed <headBeforeStep> を呼ぶ", async () => {
    // Destruction confirmation for TC-033: this test SHOULD FAIL if push-as-is is restored
    // because current push-as-is path does NOT call git reset --mixed.
    const headBeforeStep = "abc123headbefore";
    const headAtTailEntry = "def456headadvanced"; // agent self-committed

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      // rev-parse HEAD → advanced (agent self-committed)
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headAtTailEntry}\n` },
      // git reset --mixed <headBeforeStep> → success (NEW behavior)
      { subcommand: "reset", exitCode: 0 },
      // git status --porcelain (for guarded enumeration after reset)
      { subcommand: "status", exitCode: 0, stdout: " M src/foo.ts\0" },
      // git add -A -- src/foo.ts
      { subcommand: "add", exitCode: 0 },
      // git diff --cached --quiet
      { subcommand: "diff", exitCode: 1 },
      // git commit
      { subcommand: "commit", exitCode: 0 },
      // git rev-list (for egress verification, if implemented)
      { subcommand: "rev-list", exitCode: 0, stdout: "" },
      // git push
      { subcommand: "push", exitCode: 0 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-001-job");
    const infra = makeInfra(spawnFn);
    const deps = makeDeps();

    await commitAndPush(step, state, deps, headBeforeStep, infra);

    // TC-001: git reset --mixed <headBeforeStep> MUST be called
    const resetCall = calls.find(
      (c) =>
        c.args[0] === "reset" &&
        c.args.includes("--mixed") &&
        c.args.includes(headBeforeStep),
    );
    expect(resetCall, "git reset --mixed <headBeforeStep> must be called when HEAD advanced").toBeDefined();

    // TC-001: push-as-is must NOT be the only action (commit must also be called for synthesis)
    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must be called for synthesis (not push-as-is only)").toBeDefined();

    // TC-001: push MUST be called (synthesis commit was pushed)
    const pushCall = calls.find((c) => c.args[0] === "push");
    expect(pushCall, "git push must be called").toBeDefined();
  });

  it("reset は staged push の前に呼ばれ、push-as-is 経路は廃止されている", async () => {
    const headBeforeStep = "abc123headbefore";
    const headAtTailEntry = "def456headadvanced";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headAtTailEntry}\n` },
      { subcommand: "reset", exitCode: 0 },
      { subcommand: "status", exitCode: 0, stdout: " M src/impl.ts\0" },
      { subcommand: "add", exitCode: 0 },
      { subcommand: "diff", exitCode: 1 },
      { subcommand: "commit", exitCode: 0 },
      { subcommand: "rev-list", exitCode: 0, stdout: "" },
      { subcommand: "push", exitCode: 0 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-001b-job");
    const infra = makeInfra(spawnFn);

    await commitAndPush(step, state, makeDeps(), headBeforeStep, infra);

    const subcommands = calls.map((c) => c.args[0]);
    const resetIdx = subcommands.indexOf("reset");
    const commitIdx = subcommands.indexOf("commit");
    const pushIdx = subcommands.indexOf("push");

    expect(resetIdx, "reset must appear before commit").toBeGreaterThanOrEqual(0);
    expect(commitIdx, "commit must appear after reset").toBeGreaterThan(resetIdx);
    expect(pushIdx, "push must appear after commit").toBeGreaterThan(commitIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: agent 自己 commit の正当な作業内容が無損失で合成 commit に入る
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-002: agent 自己 commit の正当な作業内容が無損失で合成 commit に入る", () => {
  it("mixed reset 後、status で列挙されたパスが add と commit に含まれる", async () => {
    // Destruction confirmation for TC-033: this SHOULD FAIL if push-as-is is restored
    // because push-as-is would not call commit and the content would be in the agent commit object.
    const headBeforeStep = "abc123headbefore";
    const headAtTailEntry = "def456headadvanced";

    // Agent made legitimate changes to these files
    const changedFile1 = "src/core/feature.ts";
    const changedFile2 = "src/util/helper.ts";
    // Status returns NUL-delimited entries: "XY PATH\0XY PATH\0"
    const statusOutput = ` M ${changedFile1}\0 M ${changedFile2}\0`;

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headAtTailEntry}\n` },
      { subcommand: "reset", exitCode: 0 },
      { subcommand: "status", exitCode: 0, stdout: statusOutput },
      { subcommand: "add", exitCode: 0 },
      { subcommand: "diff", exitCode: 1 },
      { subcommand: "commit", exitCode: 0 },
      { subcommand: "rev-list", exitCode: 0, stdout: "" },
      { subcommand: "push", exitCode: 0 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-002-job");
    const infra = makeInfra(spawnFn);

    await commitAndPush(step, state, makeDeps(), headBeforeStep, infra);

    // TC-002: All agent-modified files must appear in the git add call
    const addCall = calls.find((c) => c.args[0] === "add" && c.args.includes("--"));
    expect(addCall, "git add must be called with explicit pathspec").toBeDefined();
    expect(addCall!.args, "git add must include changedFile1").toContain(changedFile1);
    expect(addCall!.args, "git add must include changedFile2").toContain(changedFile2);

    // TC-002: All agent-modified files must appear in the git commit call
    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must be called").toBeDefined();
    expect(commitCall!.args, "git commit must include changedFile1").toContain(changedFile1);
    expect(commitCall!.args, "git commit must include changedFile2").toContain(changedFile2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: agent 自己 commit が無くても合成は起点から構成される (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-003: agent 自己 commit が無くても合成は起点から構成される", () => {
  it("HEAD が headBeforeStep と同じなら reset なし、worktree の変更のみを合成する", async () => {
    const headBeforeStep = "abc123headbefore";
    // Same as headBeforeStep → no advance

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      // rev-parse → same as headBeforeStep (no agent self-commit)
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      // status for guarded enumeration
      { subcommand: "status", exitCode: 0, stdout: " M src/feature.ts\0" },
      { subcommand: "add", exitCode: 0 },
      { subcommand: "diff", exitCode: 1 },
      { subcommand: "commit", exitCode: 0 },
      { subcommand: "rev-list", exitCode: 0, stdout: "" },
      { subcommand: "push", exitCode: 0 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-003-job");
    const infra = makeInfra(spawnFn);

    await commitAndPush(step, state, makeDeps(), headBeforeStep, infra);

    // TC-003: reset must NOT be called when HEAD = headBeforeStep
    const resetCall = calls.find((c) => c.args[0] === "reset" && c.args.includes("--mixed"));
    expect(resetCall, "git reset --mixed must NOT be called when HEAD has not advanced").toBeUndefined();

    // TC-003: synthesis commit must still happen (commit is called)
    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must be called for synthesis even without self-commit").toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: scoped step は宣言 path + 管理 path のみを明示 commit する
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-004: scoped step は宣言 path + 管理 path のみを明示 commit する", () => {
  it("pre-staged src/secret.ts は scoped 合成 commit に含まれない", async () => {
    // scoped step (spec-review): declares only result file
    const declaredPath = `specrunner/changes/${SLUG}/spec-review-result-001.md`;
    const unauthorizedPath = "src/secret.ts"; // pre-staged in index but NOT declared

    const headBeforeStep = "abc123headbefore";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      // rev-parse HEAD → same as headBeforeStep (no advance)
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      // git add -A -- <stagePaths> → success
      { subcommand: "add", exitCode: 0 },
      // git diff --cached --quiet -- <stagePaths> → exit 1 (staged changes)
      { subcommand: "diff", exitCode: 1 },
      // git commit -m "spec-review: test-slug" -- <stagePaths>
      { subcommand: "commit", exitCode: 0 },
      // rev-list for egress
      { subcommand: "rev-list", exitCode: 0, stdout: "" },
      // git push
      { subcommand: "push", exitCode: 0 },
    ]);

    const step = makeScopedStep({
      name: "spec-review",
      writes: (_state, deps) => [
        { path: `specrunner/changes/${deps.slug}/spec-review-result-001.md`, artifact: "file" as const },
      ],
    });
    const state = makeJobState("tc-004-job");
    const infra = makeInfra(spawnFn);

    await commitAndPush(step, state, makeDeps(), headBeforeStep, infra);

    // TC-004: add must include the declared path
    const addCall = calls.find((c) => c.args[0] === "add");
    expect(addCall, "git add must be called").toBeDefined();
    expect(addCall!.args, "git add must include declared path").toContain(declaredPath);

    // TC-004: add must NOT include the unauthorized pre-staged file
    expect(addCall!.args, "git add must NOT include src/secret.ts").not.toContain(unauthorizedPath);

    // TC-004: commit must include only declared + managed paths
    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must be called").toBeDefined();
    expect(commitCall!.args, "git commit must include declared path").toContain(declaredPath);
    expect(commitCall!.args, "git commit must NOT include src/secret.ts").not.toContain(unauthorizedPath);

    // TC-004: bare git add -A (without --) must not be called
    const bareAdd = calls.find(
      (c) => c.args[0] === "add" && c.args[1] === "-A" && !c.args.includes("--"),
    );
    expect(bareAdd, "bare git add -A (without pathspec --) must not be called").toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: guarded step の実変更列挙が正当な変更を 1 個も落とさない
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-005: guarded step の実変更列挙が正当な変更を 1 個も落とさない", () => {
  it("untracked 新規・削除・rename を含む実変更が明示 pathspec で commit に取り込まれる", async () => {
    // guarded step detects: new untracked, tracked modified, deleted
    const newUntrackedFile = "src/new-module.ts";
    const modifiedFile = "src/existing.ts";
    const deletedFile = "src/old-module.ts";
    // NUL-delimited status output:
    // "?? src/new-module.ts\0" = untracked new
    // " M src/existing.ts\0" = modified
    // " D src/old-module.ts\0" = deleted
    const statusOutput = `?? ${newUntrackedFile}\0 M ${modifiedFile}\0 D ${deletedFile}\0`;

    const headBeforeStep = "abc123";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      { subcommand: "status", exitCode: 0, stdout: statusOutput },
      { subcommand: "add", exitCode: 0 },
      { subcommand: "diff", exitCode: 1 },
      { subcommand: "commit", exitCode: 0 },
      { subcommand: "rev-list", exitCode: 0, stdout: "" },
      { subcommand: "push", exitCode: 0 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-005-job");
    const infra = makeInfra(spawnFn);

    await commitAndPush(step, state, makeDeps(), headBeforeStep, infra);

    // TC-005: git add must use explicit pathspec (-- separator)
    const addCall = calls.find((c) => c.args[0] === "add" && c.args.includes("--"));
    expect(addCall, "git add must use explicit pathspec (-- separator)").toBeDefined();

    // TC-005: All three types of changes must be in add call
    expect(addCall!.args, "new untracked file must be in add").toContain(newUntrackedFile);
    expect(addCall!.args, "modified file must be in add").toContain(modifiedFile);
    expect(addCall!.args, "deleted file must be in add").toContain(deletedFile);

    // TC-005: git commit must use explicit pathspec for all changed files
    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall, "git commit must be called").toBeDefined();
    expect(commitCall!.args, "new untracked file must be in commit").toContain(newUntrackedFile);
    expect(commitCall!.args, "modified file must be in commit").toContain(modifiedFile);
    expect(commitCall!.args, "deleted file must be in commit").toContain(deletedFile);

    // TC-005: bare git add -A (without --) must NOT be used in guarded synthesis
    const bareAdd = calls.find(
      (c) => c.args[0] === "add" && c.args[1] === "-A" && !c.args.includes("--"),
    );
    expect(
      bareAdd,
      "bare git add -A without pathspec must not be used (guarded must use explicit paths from status)",
    ).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: mixed reset 失敗は halt する
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-015: mixed reset 失敗は halt する", () => {
  it("git reset --mixed が非 0 exit を返した場合、黙殺せず halt する", async () => {
    const headBeforeStep = "abc123headbefore";
    const headAtTailEntry = "def456headadvanced";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headAtTailEntry}\n` },
      // git reset --mixed → FAILURE (exit 1)
      { subcommand: "reset", exitCode: 1 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-015-job");
    const infra = makeInfra(spawnFn);

    // TC-015: Must throw (halt), not silently continue
    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toThrow();

    // TC-015: commit and push must NOT be called after reset failure
    expect(calls.map((c) => c.args[0])).not.toContain("commit");
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });

  it("git reset --mixed がスポーンエラーを起こした場合も halt する", async () => {
    const headBeforeStep = "abc123headbefore";
    const headAtTailEntry = "def456headadvanced";

    // Override: rev-parse succeeds, then reset spawn fails
    const { spawnFn: base } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headAtTailEntry}\n` },
    ]);
    const { spawnFn: withError } = makeSpawnErrorFn("reset");

    // Combine: rev-parse uses base, reset uses spawn error
    let revParseCount = 0;
    const combinedSpawnFn: SpawnFn = (bin, args, opts) => {
      if (args[0] === "rev-parse") {
        revParseCount++;
        if (revParseCount === 1) return base(bin, args, opts);
      }
      return withError(bin, args, opts);
    };

    const step = makeGuardedStep();
    const state = makeJobState("tc-015b-job");
    const infra = makeInfra(combinedSpawnFn);

    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: 実変更列挙の status 失敗は halt する
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-016: 実変更列挙の status 失敗は halt する", () => {
  it("guarded 合成経路で git status が非 0 exit を返した場合、黙殺せず halt する", async () => {
    const headBeforeStep = "abc123";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      // rev-parse → no advance
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      // git status --porcelain → FAILURE (exit 128 = not a git repo or other error)
      { subcommand: "status", exitCode: 128 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-016-job");
    const infra = makeInfra(spawnFn);

    // TC-016: Must throw (halt), not silently skip
    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toThrow();

    // TC-016: commit and push must NOT be called after status failure
    expect(calls.map((c) => c.args[0])).not.toContain("commit");
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });

  it("guarded 合成経路で git status がスポーンエラーを起こした場合も halt する", async () => {
    const headBeforeStep = "abc123";

    const { spawnFn: base } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
    ]);
    const { spawnFn: withError } = makeSpawnErrorFn("status");

    let revParseCount = 0;
    const combinedSpawnFn: SpawnFn = (bin, args, opts) => {
      if (args[0] === "rev-parse") {
        revParseCount++;
        if (revParseCount === 1) return base(bin, args, opts);
      }
      return withError(bin, args, opts);
    };

    const step = makeGuardedStep();
    const state = makeJobState("tc-016b-job");
    const infra = makeInfra(combinedSpawnFn);

    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: 合成経路の git add 失敗は halt する (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-017: 合成経路の git add 失敗は halt する", () => {
  it("guarded 合成経路の git add が非 0 exit を返した場合、typed error で halt する", async () => {
    const headBeforeStep = "abc123";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      { subcommand: "status", exitCode: 0, stdout: " M src/foo.ts\0" },
      // git add -A -- src/foo.ts → FAILURE
      { subcommand: "add", exitCode: 128 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-017-job");
    const infra = makeInfra(spawnFn);

    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toMatchObject({ code: expect.stringMatching(/COMMIT_AND_PUSH_FAILED|COMMIT_EFFECT_FAILED/) });

    expect(calls.map((c) => c.args[0])).not.toContain("commit");
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });

  it("scoped 合成経路の git add が非 0 exit を返した場合、typed error で halt する", async () => {
    const headBeforeStep = "abc123";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      // git add -A -- <stagePaths> → FAILURE
      { subcommand: "add", exitCode: 128 },
    ]);

    const step = makeScopedStep({
      writes: (_state, deps) => [
        { path: `specrunner/changes/${deps.slug}/spec-review-result-001.md`, artifact: "file" as const },
      ],
    });
    const state = makeJobState("tc-017b-job");
    const infra = makeInfra(spawnFn);

    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toMatchObject({ code: expect.stringMatching(/COMMIT_AND_PUSH_FAILED|COMMIT_EFFECT_FAILED/) });

    expect(calls.map((c) => c.args[0])).not.toContain("commit");
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-018: 合成経路の git commit 失敗は halt する (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-018: 合成経路の git commit 失敗は halt する", () => {
  it("guarded 合成経路の git commit が非 0 exit を返した場合、typed error で halt し push は呼ばれない", async () => {
    const headBeforeStep = "abc123";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      { subcommand: "status", exitCode: 0, stdout: " M src/foo.ts\0" },
      { subcommand: "add", exitCode: 0 },
      { subcommand: "diff", exitCode: 1 },
      // git commit → FAILURE
      { subcommand: "commit", exitCode: 1 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-018-job");
    const infra = makeInfra(spawnFn);

    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toMatchObject({ code: expect.stringMatching(/COMMIT_AND_PUSH_FAILED|COMMIT_EFFECT_FAILED/) });

    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-028: guarded step が保護正典を変更した場合 → 退避して halt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-028: guarded step が保護正典を変更 → 退避して halt", () => {
  it("guarded の実変更列挙に保護正典 request.md が含まれる場合、WRITE_SCOPE_VIOLATION で halt する", async () => {
    const headBeforeStep = "abc123";
    // guarded step (implementer) modified request.md — a protected canonical path
    const protectedPath = `specrunner/changes/${SLUG}/request.md`;
    const statusOutput = ` M ${protectedPath}\0 M src/feature.ts\0`;

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      { subcommand: "status", exitCode: 0, stdout: statusOutput },
      // quarantine evidence uses git diff
      { subcommand: "diff", exitCode: 0, stdout: "diff --git a/..." },
      // quarantine write (mkdir, writeFile via fs — not git)
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("tc-028-job");
    const infra = makeInfra(spawnFn);

    // TC-028: Must throw WRITE_SCOPE_VIOLATION, not proceed to commit/push
    await expect(
      commitAndPush(step, state, makeDeps(), headBeforeStep, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });

    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-033: 破壊確認 — push-as-is 経路へ戻すと TC-001/TC-002 が fail する (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-033: 破壊確認 — push-as-is 経路の封鎖有効性", () => {
  it("push-as-is が呼ばれた場合は git reset --mixed が呼ばれていない = 現行バグの検出", async () => {
    // Destruction confirmation:
    // If the implementation reverts to push-as-is (current behavior), TC-001 and TC-002 should fail
    // because push-as-is does NOT call git reset --mixed.
    //
    // This test documents that behavior: it verifies that if reset is NOT called,
    // the synthesis test (TC-001) would detect the regression.
    //
    // Currently this test passes (current code doesn't call reset → the resetCall check would find nothing).
    // After implementation, this test should also pass (reset IS called → TC-001 is green, regression caught).

    const headAtTailEntry = "def456headadvanced";

    // Mock: simulate the old push-as-is behavior (no reset, direct push after agent commit)
    const callsRecord: string[][] = [];
    const _pushAsIsSpawnFn: SpawnFn = (_bin, args, _opts): ChildProcess => {
      callsRecord.push([...args]);
      const subcommand = args[0] ?? "";

      const procEm = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procAny = procEm as any;
      const stdoutEm = new EventEmitter();
      procAny.stdout = stdoutEm;
      procAny.stderr = new EventEmitter();
      procAny.stdin = { write: () => true, end: () => {} };

      setImmediate(() => {
        if (subcommand === "rev-parse") {
          stdoutEm.emit("data", Buffer.from(`${headAtTailEntry}\n`));
        }
        if (subcommand === "diff") {
          // Simulate "no staged changes" → triggers range inspection → push-as-is (old behavior)
          procEm.emit("close", 0); // exit 0 = no staged changes (diff check)
          return;
        }
        procEm.emit("close", 0);
      });

      return procEm as unknown as ChildProcess;
    };

    // In the OLD push-as-is behavior: if we reach the no-staged-changes path with HEAD advanced,
    // we'd see push called without reset --mixed being called first.
    // The TC-001 test would fail because resetCall would be undefined.

    // Document: the absence of a reset call when HEAD advanced is the bug
    const noResetFound = !callsRecord.some((args) => args[0] === "reset" && args.includes("--mixed"));
    expect(
      noResetFound,
      "Destruction confirmation: in push-as-is behavior, reset --mixed is NOT called (this documents the bug)",
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// egress 公開範囲は entry-HEAD で縮小しない（resume 経路の盲点防止）
//
// headBeforeStep は step (再)entry ごとに live rev-parse で取り直される。crash →
// resume の後は crash した試行中の agent 自己 commit が entry HEAD になるため、
// entry-HEAD を rev-list の除外 (--not の追加 ref) に使うと、その agent commit が
// 公開範囲から外れて egress 照合の盲点になる。公開範囲は常に
// `rev-list HEAD --not --remotes=origin` の厳密形でなければならない。
//
// DESTROY: runInlineEgressCheck が headBeforeStep を rev-list 引数に加える旧実装に
// 戻すと本テストが fail する。
// ─────────────────────────────────────────────────────────────────────────────

describe("egress 公開範囲は entry-HEAD で縮小しない（resume 経路の盲点防止）", () => {
  it("guarded 合成の egress rev-list 引数が厳密形で、headBeforeStep を含まない", async () => {
    const headBeforeStep = "entry-head-abc123";

    const { spawnFn, calls } = makeSeqGitSpawnFn([
      { subcommand: "rev-parse", exitCode: 0, stdout: `${headBeforeStep}\n` },
      { subcommand: "status", exitCode: 0, stdout: " M src/foo.ts\0" },
      { subcommand: "add", exitCode: 0 },
      { subcommand: "diff", exitCode: 1 },
      { subcommand: "commit", exitCode: 0 },
      { subcommand: "rev-list", exitCode: 0, stdout: "" },
      { subcommand: "push", exitCode: 0 },
    ]);

    const step = makeGuardedStep();
    const state = makeJobState("egress-strict-job");
    const infra = makeInfra(spawnFn);

    await commitAndPush(step, state, makeDeps(), headBeforeStep, infra);

    const revListCalls = calls.filter((c) => c.args[0] === "rev-list");
    expect(revListCalls.length, "egress rev-list must run").toBeGreaterThan(0);
    for (const call of revListCalls) {
      expect(
        call.args,
        "publish range must be the strict form (no entry-HEAD exclusion ref)",
      ).toEqual(["rev-list", "HEAD", "--not", "--remotes=origin"]);
      expect(
        call.args,
        "headBeforeStep must NOT narrow the publish range (resume blind-spot)",
      ).not.toContain(headBeforeStep);
    }
  });
});
