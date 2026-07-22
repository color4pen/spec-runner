/**
 * Integration E2E tests for pipeline-sole-committer: 実 git repo による封鎖証明
 *
 * TC-019: R6-1 — 事前 stage 許可外ファイルの封鎖（実 git E2E）(must)
 * TC-020: R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E）(must)
 *
 * Uses real local git repos in temp dirs. git push is intercepted (no remote needed).
 *
 * RED phase:
 *   TC-019: commitFinalState uses bare `git add -A` (T-05 not yet implemented) →
 *     `src/secret.ts` is picked up by add -A and appears in the commit. Test fails.
 *   TC-020: ParallelReviewRound has no HEAD guard (T-07 not yet implemented) →
 *     reviewer's self-commit is not detected. round.outcome is not "escalation". Test fails.
 *
 * The new implementations should:
 *   TC-019: commitFinalState uses pipelineManagedPaths only (T-05) → secret.ts not staged.
 *   TC-020: ParallelReviewRound detects HEAD advance after fan-out (T-07) →
 *     ROUND_HEAD_ADVANCED escalation halt, reviewer commit removed by mixed reset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { commitFinalState } from "../src/core/step/commit-push.js";
import type { SpawnFn } from "../src/util/spawn.js";
import { ParallelReviewRound } from "../src/core/pipeline/parallel-review-round.js";
import { EventBus } from "../src/core/event/event-bus.js";
import type { Step } from "../src/core/step/types.js";
import type { JobState } from "../src/state/schema.js";
import type { PipelineDeps } from "../src/core/types.js";
import type { StepExecutor } from "../src/core/step/executor.js";
import type { StepExecutionResult } from "../src/core/step/commit-orchestrator.js";
import type { ParallelReviewConfig } from "../src/core/pipeline/types.js";
import type { SpawnFn as GitExecSpawnFn } from "../src/util/git-exec.js";
import type { RuntimeStrategy } from "../src/core/port/runtime-strategy.js";
import { makeStoreFactory } from "./helpers/store-factory.js";

// ─────────────────────────────────────────────────────────────────────────────
// Git sync helpers
// ─────────────────────────────────────────────────────────────────────────────

function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

/** Try git command; return null on failure (non-throwing). */
function gitTry(args: string[], cwd: string): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return (result.stdout ?? "").trim();
}

/** Create a minimal real git repo in tempDir. */
async function createGitRepo(tempDir: string): Promise<void> {
  gitSync(["init"], tempDir);
  gitSync(["config", "user.email", "e2e@spec-runner.local"], tempDir);
  gitSync(["config", "user.name", "PSC E2E Test"], tempDir);
}

/** Write files and make an initial commit; returns HEAD SHA. */
async function makeInitialCommit(
  cwd: string,
  files: Record<string, string> = {},
): Promise<string> {
  const defaults: Record<string, string> = {
    "README.md": "# Test repo\n",
  };
  const allFiles = { ...defaults, ...files };

  for (const [relPath, content] of Object.entries(allFiles)) {
    const absPath = path.join(cwd, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf-8");
  }

  gitSync(["add", "."], cwd);
  gitSync(["commit", "-m", "initial: test repo setup"], cwd);
  return gitSync(["rev-parse", "HEAD"], cwd);
}

/** List files changed by the given commit OID (diff-tree). */
function getCommitFiles(cwd: string, commitOid: string): string[] {
  const output = gitTry(
    ["diff-tree", "--no-commit-id", "-r", "--name-only", commitOid],
    cwd,
  );
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

/** Get all commits between base (exclusive) and HEAD (inclusive). */
function getCommitsSinceBase(cwd: string, base: string): string[] {
  const output = gitTry(["rev-list", `${base}..HEAD`], cwd);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "test-slug";
const BRANCH = `change/${SLUG}-e2e`;
const JOB_ID = "e2e-test-job-id-001";

/**
 * Push-intercepting SpawnFn (spawn.ts style): runs git commands against real repo
 * except push, which is recorded but not executed.
 */
function makePushInterceptSpawnFn(repoDir: string, pushedBranches: string[]): SpawnFn {
  return async (cmd: string, args: string[], _opts?: { cwd?: string }) => {
    if (args[0] === "push") {
      pushedBranches.push(args[args.length - 1] ?? "");
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    const result = spawnSync(cmd, args, { cwd: repoDir, encoding: "utf8" });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
}

/**
 * Push-intercepting GitExecSpawnFn (git-exec.ts ChildProcess style):
 * used for gitTransportSpawn in PipelineDeps.
 */
function makeGitExecSpawnFn(repoDir: string): GitExecSpawnFn {
  return (cmd: string, args: string[], opts) => {
    // Return a fake ChildProcess that emits events synchronously
    const result = spawnSync(cmd, args, {
      cwd: (opts as { cwd?: string })?.cwd ?? repoDir,
      encoding: "utf8",
    });
    const { EventEmitter } = require("node:events");
    const cp = new EventEmitter();
    Object.assign(cp, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    // Emit data + close asynchronously
    setImmediate(() => {
      if (result.stdout) cp.stdout.emit("data", result.stdout);
      if (result.stderr) cp.stderr.emit("data", result.stderr);
      cp.emit("close", result.status ?? 0);
    });
    return cp as ReturnType<GitExecSpawnFn>;
  };
}

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "E2E Test Change",
      type: "spec-change",
      slug: SLUG,
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "psc-e2e-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-019: R6-1 — 事前 stage 許可外ファイルの封鎖（実 git E2E）
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-019: R6-1 — 事前 stage 許可外ファイルの封鎖（実 git E2E）", () => {
  it(
    "src/secret.ts を事前 stage しても checkpoint / finalize commit に含まれない",
    async () => {
      // TC-031 destruction confirmation context:
      // If commitFinalState reverts to bare `git add -A` (T-05 not implemented),
      // src/secret.ts WILL appear in the commit → this test FAILS.
      // After T-05 (pipelineManagedPaths only), src/secret.ts is excluded.

      // 1. Create real git repo + initial commit
      await createGitRepo(tempDir);
      const baseOid = await makeInitialCommit(tempDir);

      // 2. Write pipeline-managed file (state.json) — legitimate pipeline output
      const stateJsonPath = `specrunner/changes/${SLUG}/state.json`;
      const stateAbs = path.join(tempDir, stateJsonPath);
      await fs.mkdir(path.dirname(stateAbs), { recursive: true });
      await fs.writeFile(stateAbs, JSON.stringify({ jobId: JOB_ID }), "utf-8");

      // 3. Write and pre-stage unauthorized file (adversarial pre-staged file)
      const secretPath = "src/secret.ts";
      const secretAbs = path.join(tempDir, secretPath);
      await fs.mkdir(path.dirname(secretAbs), { recursive: true });
      await fs.writeFile(secretAbs, "export const secret = '🚫';\n", "utf-8");
      gitSync(["add", secretPath], tempDir); // pre-stage: adversarially placed in index

      // 4. Verify src/secret.ts is staged (it's in the index)
      const statusBefore = gitSync(["status", "--porcelain"], tempDir);
      expect(statusBefore).toContain(secretPath);

      // 5. Run commitFinalState with push intercepted
      const pushedBranches: string[] = [];
      const spawnFn = makePushInterceptSpawnFn(tempDir, pushedBranches);

      await commitFinalState({
        cwd: tempDir,
        branch: BRANCH,
        slug: SLUG,
        spawnFn,
        messageLabel: "finalize",
      });

      // 6. Enumerate all commits since base
      const commitsSinceBase = getCommitsSinceBase(tempDir, baseOid);

      // 7. TC-019 assertion: src/secret.ts must NOT appear in any commit's changed files
      let secretFoundInCommit = false;
      for (const commitOid of commitsSinceBase) {
        const files = getCommitFiles(tempDir, commitOid);
        if (files.includes(secretPath)) {
          secretFoundInCommit = true;
          break;
        }
      }

      expect(
        secretFoundInCommit,
        `src/secret.ts must NOT appear in any commit after commitFinalState.\n` +
        `Commits since base: ${commitsSinceBase.join(", ")}\n` +
        `(TC-031 destruction confirmation: bare add -A would pick it up — T-05 must prevent this)`,
      ).toBe(false);
    },
    30000,
  );

  it(
    "pipeline 管理パス（state.json）は finalize commit に含まれる（正常系検証）",
    async () => {
      // Positive verification: state.json is a pipeline-managed path and MUST appear in commit
      await createGitRepo(tempDir);
      const baseOid = await makeInitialCommit(tempDir);

      const stateJsonPath = `specrunner/changes/${SLUG}/state.json`;
      const stateAbs = path.join(tempDir, stateJsonPath);
      await fs.mkdir(path.dirname(stateAbs), { recursive: true });
      await fs.writeFile(stateAbs, JSON.stringify({ jobId: JOB_ID, step: "finalize" }), "utf-8");

      const pushedBranches: string[] = [];
      const spawnFn = makePushInterceptSpawnFn(tempDir, pushedBranches);

      await commitFinalState({
        cwd: tempDir,
        branch: BRANCH,
        slug: SLUG,
        spawnFn,
        messageLabel: "finalize",
      });

      const commitsSinceBase = getCommitsSinceBase(tempDir, baseOid);
      expect(
        commitsSinceBase.length,
        "At least one commit should have been made for state.json",
      ).toBeGreaterThan(0);

      let stateFoundInCommit = false;
      for (const commitOid of commitsSinceBase) {
        const files = getCommitFiles(tempDir, commitOid);
        if (files.includes(stateJsonPath)) {
          stateFoundInCommit = true;
          break;
        }
      }

      expect(
        stateFoundInCommit,
        `state.json (pipeline-managed) must appear in a commit after commitFinalState`,
      ).toBe(true);
    },
    30000,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-020: R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E）
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-020: R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E）", () => {
  const COORDINATOR = "custom-reviewers";
  const MEMBER_A = "reviewer-alpha";

  function makeMinimalStep(name: string): Step {
    return {
      kind: "agent",
      name,
      agent: { id: `${name}-agent` } as never,
      buildMessage: () => `${name} message`,
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      writes: () => [],
    } as unknown as Step;
  }

  it(
    "reviewer が自己 commit した場合、escalation halt し HEAD が reset される",
    async () => {
      // TC-032 destruction confirmation context:
      // Without T-07 (HEAD guard), reviewer self-commit is not detected.
      // round.outcome would be "approved" (not "escalation") → this test FAILS.
      // After T-07, ROUND_HEAD_ADVANCED is detected and HEAD is reset to headBeforeRound.

      // 1. Create real git repo + initial commit
      await createGitRepo(tempDir);
      await makeInitialCommit(tempDir, {
        [`specrunner/changes/${SLUG}/request.md`]: "# Original request\n",
      });

      const headBeforeRound = gitSync(["rev-parse", "HEAD"], tempDir);

      // 2. Build store
      const storeFactory = makeStoreFactory(tempDir);
      await fs.mkdir(
        path.join(tempDir, ".specrunner", "test-jobs", JOB_ID),
        { recursive: true },
      );

      // 3. Build git-exec SpawnFn (ChildProcess-based, used for gitTransportSpawn in deps)
      const gitExecSpawnFn = makeGitExecSpawnFn(tempDir);

      // 4. Build runtimeStrategy with real captureHeadSha
      const runtimeStrategy = {
        captureHeadSha: async () => gitSync(["rev-parse", "HEAD"], tempDir),
        listWorktreeChanges: vi.fn().mockResolvedValue({ kind: "success" as const, paths: [] }),
        listChangedFiles: vi.fn().mockResolvedValue({ kind: "unavailable" as const, reason: "test" }),
        digestArtifacts: undefined,
        finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
        validateStepInputs: vi.fn().mockResolvedValue(undefined),
        validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
      } as unknown as RuntimeStrategy;

      // 5. Executor that simulates reviewer weakening request.md and self-committing
      const selfCommitExecutor = {
        produceResult: vi.fn(async (): Promise<StepExecutionResult> => {
          // Reviewer weakens the canonical doc and commits (unauthorized self-commit)
          const requestAbsPath = path.join(
            tempDir, `specrunner/changes/${SLUG}/request.md`,
          );
          await fs.writeFile(requestAbsPath, "# WEAKENED request\n", "utf-8");
          gitSync(["add", `specrunner/changes/${SLUG}/request.md`], tempDir);
          gitSync(
            ["commit", "-m", "reviewer: weaken request (unauthorized self-commit)"],
            tempDir,
          );

          return {
            kind: "success",
            completion: { verdict: "approved", persistToolResult: null },
            completedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            session: null,
          };
        }),
        execute: vi.fn().mockResolvedValue({}) as never,
      } as unknown as StepExecutor;

      // 6. Construct ParallelReviewRound
      const steps = new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]);
      const parallelReview: ParallelReviewConfig = {
        coordinator: COORDINATOR,
        members: [MEMBER_A],
      };
      const round = new ParallelReviewRound({
        executor: selfCommitExecutor,
        steps,
        parallelReview,
        events: new EventBus(),
      });

      // 7. Build PipelineDeps with gitTransportSpawn
      const state = makeJobState({
        step: COORDINATOR,
        reviewers: [
          {
            name: MEMBER_A,
            maxIterations: 3,
            purpose: "alpha reviewer purpose",
            criteria: "alpha reviewer criteria",
            judgment: "alpha reviewer judgment",
            freeText: "",
          },
        ],
      });

      // Initialize state file
      await fs.writeFile(
        path.join(tempDir, ".specrunner", "test-jobs", JOB_ID, "state.json"),
        JSON.stringify(state),
      );

      const deps: PipelineDeps = {
        config: { version: 1, runtime: "local", agents: {} } as never,
        request: {
          type: "spec-change",
          title: "E2E Test",
          slug: SLUG,
          baseBranch: "main",
          content: "...",
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
          createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "" }),
          listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
          searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
          listIssueComments: vi.fn().mockResolvedValue([]),
          removeLabel: vi.fn().mockResolvedValue(undefined),
        } as never,
        owner: "test",
        repo: "repo",
        spawn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
        runtimeStrategy,
        storeFactory,
        gitTransportSpawn: gitExecSpawnFn,
      };

      // 8. Run the round — expecting ROUND_HEAD_ADVANCED escalation after T-07
      const result = await round.run(COORDINATOR, state, deps);

      // 9. TC-020 assertions
      const headAfterRound = gitSync(["rev-parse", "HEAD"], tempDir);

      // 9a. After T-07: HEAD must be reset to headBeforeRound (mixed reset removes reviewer commit)
      expect(
        headAfterRound,
        "HEAD must be reset to headBeforeRound after ROUND_HEAD_ADVANCED (T-07 mixed reset)\n" +
        "(TC-032 destruction confirmation: without HEAD guard, HEAD stays at reviewer commit — RED)",
      ).toBe(headBeforeRound);

      // 9b. Round outcome must be escalation (HEAD advance → escalation halt)
      expect(
        result.outcome,
        "round outcome must be 'escalation' when reviewer self-commits (T-07 HEAD guard)\n" +
        "(without HEAD guard, outcome may be 'approved' — RED until T-07)",
      ).toBe("escalation");

      // 9c. Error code must be ROUND_HEAD_ADVANCED
      const coordinatorRun = result.state.steps?.[COORDINATOR]?.at(-1);
      expect(
        coordinatorRun?.outcome.error?.code,
        "error code must be ROUND_HEAD_ADVANCED (T-09 new error code)\n" +
        "(without T-07/T-09, error code is absent or different — RED)",
      ).toBe("ROUND_HEAD_ADVANCED");
    },
    60000,
  );

  it(
    "reviewer が commit しなければ round は正常に進む（非 escalation）",
    async () => {
      // Sanity check: if no HEAD advance, the round should produce non-escalation verdict.
      // This verifies the HEAD guard only fires when HEAD actually advances.
      await createGitRepo(tempDir);
      await makeInitialCommit(tempDir, {
        [`specrunner/changes/${SLUG}/request.md`]: "# Original request\n",
      });

      const headBefore = gitSync(["rev-parse", "HEAD"], tempDir);
      const storeFactory = makeStoreFactory(tempDir);
      await fs.mkdir(
        path.join(tempDir, ".specrunner", "test-jobs", JOB_ID),
        { recursive: true },
      );

      const runtimeStrategy = {
        captureHeadSha: async () => gitSync(["rev-parse", "HEAD"], tempDir),
        listWorktreeChanges: vi.fn().mockResolvedValue({ kind: "success" as const, paths: [] }),
        listChangedFiles: vi.fn().mockResolvedValue({ kind: "unavailable" as const, reason: "test" }),
        digestArtifacts: undefined,
        finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
        validateStepInputs: vi.fn().mockResolvedValue(undefined),
        validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
      } as unknown as RuntimeStrategy;

      // Executor that does NOT commit (legitimate behavior)
      const cleanExecutor = {
        produceResult: vi.fn(async (): Promise<StepExecutionResult> => ({
          kind: "success",
          completion: { verdict: "approved", persistToolResult: null },
          completedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          session: null,
        })),
        execute: vi.fn().mockResolvedValue({}) as never,
      } as unknown as StepExecutor;

      const steps = new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]);
      const parallelReview: ParallelReviewConfig = {
        coordinator: COORDINATOR,
        members: [MEMBER_A],
      };
      const round = new ParallelReviewRound({
        executor: cleanExecutor,
        steps,
        parallelReview,
        events: new EventBus(),
      });

      const state = makeJobState({
        step: COORDINATOR,
        reviewers: [
          {
            name: MEMBER_A,
            maxIterations: 3,
            purpose: "alpha reviewer purpose",
            criteria: "alpha reviewer criteria",
            judgment: "alpha reviewer judgment",
            freeText: "",
          },
        ],
      });

      await fs.writeFile(
        path.join(tempDir, ".specrunner", "test-jobs", JOB_ID, "state.json"),
        JSON.stringify(state),
      );

      const deps: PipelineDeps = {
        config: { version: 1, runtime: "local", agents: {} } as never,
        request: {
          type: "spec-change",
          title: "E2E Test",
          slug: SLUG,
          baseBranch: "main",
          content: "...",
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
          createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "" }),
          listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
          searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
          listIssueComments: vi.fn().mockResolvedValue([]),
          removeLabel: vi.fn().mockResolvedValue(undefined),
        } as never,
        owner: "test",
        repo: "repo",
        spawn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
        runtimeStrategy,
        storeFactory,
      };

      // Round with no self-commit should complete without escalation (or may fail for
      // store reasons unrelated to HEAD guard)
      const result = await round.run(COORDINATOR, state, deps);

      // HEAD must not have changed
      const headAfter = gitSync(["rev-parse", "HEAD"], tempDir);
      expect(headAfter).toBe(headBefore);

      // Result must not be ROUND_HEAD_ADVANCED escalation
      expect(result.state.error?.code).not.toBe("ROUND_HEAD_ADVANCED");
    },
    60000,
  );
});
