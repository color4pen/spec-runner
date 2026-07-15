/**
 * E2E test: guard-halt → checkpoint publish → attach → resume start.
 *
 * Uses real git operations (bare origin + Machine A clone + Machine B clone).
 * No GitHub API, no real agent sessions, no subprocess agents.
 *
 * TC-E2E-001: Machine A — real Pipeline.run() + fake AgentRunner (implementer returns
 *   "timeout") → state.status === "awaiting-resume" → commitFinalState pushes checkpoint
 *   commit to origin/BRANCH
 * TC-E2E-002: Machine B — fresh clone → runAttachVerification → materialize →
 *   real Pipeline.run() from resumePoint.step → fake AgentRunner called at that step
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { spawnCommand } from "../../src/util/spawn.js";
import { runAttachVerification } from "../../src/core/attach/orchestrator.js";
import { WorkspaceMaterializer } from "../../src/core/runtime/workspace-materializer.js";
import type { MaterializerHost } from "../../src/core/runtime/workspace-materializer.js";
import { createWorktreeManager } from "../../src/core/worktree/manager.js";
import { buildPipeline } from "../../src/core/pipeline/run.js";
import { STANDARD_DESCRIPTOR } from "../../src/core/pipeline/registry.js";
import { JobStateStore, buildInitialJobState } from "../../src/store/job-state-store.js";
import { commitFinalState } from "../../src/core/step/commit-push.js";
import { EventBus } from "../../src/core/event/event-bus.js";
import { ImplementerStep } from "../../src/core/step/implementer.js";
import { STEP_NAMES } from "../../src/core/step/step-names.js";
import { transitionJob } from "../../src/state/lifecycle.js";
import { defaultSpawnFn, gitExec } from "../../src/util/git-exec.js";
import type { AgentRunContext, AgentRunResult } from "../../src/core/port/agent-runner.js";
import type { PipelineDeps } from "../../src/core/types.js";
import type { JobState } from "../../src/state/schema.js";
import type { RuntimeStrategy } from "../../src/core/port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";
import type { ParsedRequest } from "../../src/parser/request-md.js";
import type { GitHubClient } from "../../src/core/port/github-client.js";
import type { PipelineDescriptor } from "../../src/core/pipeline/types.js";
import { makeStoreFactory } from "../helpers/store-factory.js";

// ---------------------------------------------------------------------------
// Silence stdout/stderr from pipeline internals in tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Git fixture helpers
// ---------------------------------------------------------------------------

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@test.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@test.com",
};

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await spawnCommand("git", args, { cwd, env: GIT_ENV });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const SLUG = "e2e-feature";
const EXPECTED_REPO = { owner: "acme", name: "repo" };

// ---------------------------------------------------------------------------
// Minimal SpecRunnerConfig for the pipeline
// ---------------------------------------------------------------------------

const MINIMAL_CONFIG: SpecRunnerConfig = {
  version: 1 as const,
  agents: {
    implementer: {
      agentId: "implementer-agent-id",
      definitionHash: "sha256:imp",
      lastSyncedAt: new Date().toISOString(),
    },
  },
  pipeline: { maxRetries: 2 },
};

// ---------------------------------------------------------------------------
// Minimal ParsedRequest
// ---------------------------------------------------------------------------

function makeRequest(slug: string): ParsedRequest {
  return {
    type: "new-feature",
    title: "E2E test feature",
    slug,
    baseBranch: "main",
    content: "# E2E test request\n\nDo something interesting.\n",
    adr: false,
  };
}

// ---------------------------------------------------------------------------
// Minimal GitHubClient stub (all methods are no-ops / safe defaults)
// ---------------------------------------------------------------------------

function makeStubGithubClient(): GitHubClient {
  return {
    verifyBranch: async () => true,
    getRawFile: async () => null,
    verifyPath: async () => true,
    verifyToken: async () => ({ valid: true, scopes: [] }),
    createPullRequest: async () => ({ number: 1, url: "https://github.com/test/test/pull/1" }),
    getPullRequest: async () => null,
    createIssueComment: async () => {},
    getCommitStatus: async () => ({ state: "success", total: 0, failing: [], pending: [] }),
    getPullRequestChecks: async () => ({ state: "success", total: 0, failing: [], pending: [] }),
    getMergeableState: async () => ({ mergeable: true, mergeStateStatus: "CLEAN" }),
    mergePullRequest: async () => {},
  } as unknown as GitHubClient;
}

// ---------------------------------------------------------------------------
// Machine A RuntimeStrategy — real commitFinalState, no-op everything else
// ---------------------------------------------------------------------------

function makeMachineAStrategy(machineADir: string, slug: string): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner(): never { throw new Error("not used"); },
    async setupWorkspace() { return { cwd: machineADir }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(cwd: string): Promise<string | null> {
      return gitExec(defaultSpawnFn, cwd, ["rev-parse", "HEAD"]);
    },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(): Promise<void> {
      // Timeout fires before finalization — this is never called in TC-E2E-001
    },
    async validateStepInputs(): Promise<void> {},
    async validateStepOutputs() { return { violations: [] }; },
    async commitFinalState(deps: unknown, state: unknown): Promise<void> {
      const s = state as JobState;
      // Real commitFinalState: git add -A → commit "checkpoint: <slug>" → push
      await commitFinalState({
        cwd: machineADir,
        branch: s.branch ?? "",
        slug,
        spawnFn: spawnCommand,
        messageLabel: "checkpoint",
      });
    },
    async bootstrapJob(): Promise<JobState> { throw new Error("not used"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs: { path: string }[]) {
      return refs.map((r) => ({ path: r.path, hash: null }));
    },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
  };
}

// ---------------------------------------------------------------------------
// Minimal pipeline descriptor: implementer → end (Machine B resume)
// ---------------------------------------------------------------------------

const IMPLEMENTER_ONLY_DESCRIPTOR: PipelineDescriptor = {
  id: "implementer-only",
  steps: [
    [STEP_NAMES.IMPLEMENTER, ImplementerStep],
  ],
  transitions: [
    { step: STEP_NAMES.IMPLEMENTER, on: "success", to: "end" },
    { step: STEP_NAMES.IMPLEMENTER, on: "error",   to: "escalate" },
  ],
  loopName: STEP_NAMES.IMPLEMENTER,
  loopNames: [STEP_NAMES.IMPLEMENTER],
  loopFixerPairs: {},
  startStep: STEP_NAMES.IMPLEMENTER,
  maxIterations: 1,
  roles: { [STEP_NAMES.IMPLEMENTER]: { role: "creator", phase: "impl" } },
};

// ---------------------------------------------------------------------------
// MaterializerHost for Machine B (real git worktree creation)
// ---------------------------------------------------------------------------

function makeRealMaterializerHost(cwd: string): MaterializerHost {
  const manager = createWorktreeManager(
    spawnCommand,
    undefined,
    (ms) => new Promise((r) => setTimeout(r, ms)),
    async () => "bun" as const,
  );

  return {
    cwd,
    manager,
    spawnFn: spawnCommand,
    resolveSetupPlan: () => ({ kind: "skip" } as const),
    registerWorkspace: () => undefined,
    updateJobState: async () => undefined,
    writeLivenessSidecar: async (slug, jobId, worktreePath, pid) => {
      const sidecarDir = path.join(cwd, ".specrunner", "local", slug);
      await fs.mkdir(sidecarDir, { recursive: true });
      await fs.writeFile(
        path.join(sidecarDir, "liveness.json"),
        JSON.stringify({ pid: pid ?? null, session: null, worktreePath, jobId }, null, 2),
        "utf-8",
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "attach-e2e-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-E2E-001 + TC-E2E-002: full guard-halt → checkpoint → attach → resume flow
// ---------------------------------------------------------------------------

describe("TC-E2E-001 + TC-E2E-002: guard-halt publishes checkpoint; attach resumes from it", () => {
  it(
    "Machine A creates awaiting-resume checkpoint on origin; Machine B attaches and resumes implementer",
    async () => {
      // =======================================================================
      // GIT FIXTURE SETUP
      // =======================================================================

      const originDir  = path.join(tmpDir, "origin");
      const machineADir = path.join(tmpDir, "machine-a");
      const machineBDir = path.join(tmpDir, "machine-b");

      // 1. Bare origin
      await fs.mkdir(originDir, { recursive: true });
      await git(originDir, "init", "--bare", "--initial-branch=main");

      // 2. Machine A clone
      await git(tmpDir, "clone", originDir, "machine-a");
      await git(machineADir, "config", "user.email", "test@test.com");
      await git(machineADir, "config", "user.name", "Test");

      // 3. Initial commit on main
      await fs.writeFile(path.join(machineADir, "README.md"), "# E2E test\n");
      await git(machineADir, "add", "README.md");
      await git(machineADir, "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "initial");
      await git(machineADir, "push", "origin", "main");

      // 4. Create feature branch in Machine A
      const jobIdPrefix = "12345678"; // 8-char prefix for branch name
      const jobId = `${jobIdPrefix}-abcd-abcd-abcd-abcdef012345`;
      const BRANCH = `feat/${SLUG}-${jobIdPrefix}`;

      await git(machineADir, "checkout", "-b", BRANCH);

      // 5. Write required checkpoint files (request.md, spec.md, tasks.md)
      const changeDir = path.join(machineADir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(
        path.join(changeDir, "request.md"),
        `# E2E test feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n- **adr**: false\n\nDo something.\n`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(changeDir, "spec.md"),
        `# Spec\n\n## Overview\n\nTest feature spec.\n`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(changeDir, "tasks.md"),
        `# Tasks\n\n- [ ] Implement the feature\n`,
        "utf-8",
      );

      // Commit initial files and push to create the branch on origin
      await git(machineADir, "add", "-A");
      await git(machineADir, "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", `setup: initial files for ${SLUG}`);
      await git(machineADir, "push", "origin", BRANCH);

      // =======================================================================
      // TC-E2E-001: MACHINE A — Pipeline guard-halt → checkpoint published
      // =======================================================================

      // Build initial state for Machine A
      const machineAInitialState: JobState = {
        ...buildInitialJobState({
          request: {
            path: `specrunner/changes/${SLUG}/request.md`,
            title: "E2E test feature",
            type: "new-feature",
            slug: SLUG,
          },
          repository: EXPECTED_REPO,
        }),
        jobId,
        branch: BRANCH,
        status: "running",
        step: "implementer",
      };

      // Persist initial state to the slug-based location in Machine A's clone
      const machineAStoreFactory = (id: string) =>
        new JobStateStore(id, machineADir, { slug: SLUG, stateRoot: machineADir });
      await machineAStoreFactory(jobId).persist(machineAInitialState);

      // Fake AgentRunner: returns "timeout" for ALL steps (implementer is the only one that runs)
      let machineARunnerCallCount = 0;
      const machineARunner = {
        async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
          machineARunnerCallCount++;
          return {
            completionReason: "timeout" as const,
            resultContent: null,
            toolResult: null,
            followUpAttempts: 0,
          };
        },
      };

      // Build Machine A's PipelineDeps
      const machineAStrategy = makeMachineAStrategy(machineADir, SLUG);
      const machineADeps: PipelineDeps = {
        config: MINIMAL_CONFIG,
        slug: SLUG,
        cwd: machineADir,
        request: makeRequest(SLUG),
        githubClient: makeStubGithubClient(),
        owner: EXPECTED_REPO.owner,
        repo: EXPECTED_REPO.name,
        spawn: spawnCommand,
        storeFactory: machineAStoreFactory,
        runner: machineARunner,
        runtimeStrategy: machineAStrategy,
        gitTransportSpawn: defaultSpawnFn,
      };

      // Build and run the pipeline — starts at "implementer"
      const events = new EventBus();
      const machineAPipeline = buildPipeline(STANDARD_DESCRIPTOR, machineADeps, events);
      const finalState = await machineAPipeline.run("implementer", machineAInitialState, machineADeps);

      // --- Assert (a): guard-halt stopped the pipeline at awaiting-resume ---
      expect(finalState.status).toBe("awaiting-resume");
      expect(finalState.resumePoint?.step).toBe("implementer");

      // --- Assert (b): fake runner called exactly once (implementer only, no continuation) ---
      expect(machineARunnerCallCount).toBe(1);

      // --- Assert (c): origin BRANCH HEAD commit is the checkpoint commit ---
      const originHead = await git(machineADir, "rev-parse", `origin/${BRANCH}`);
      const checkpointCommitMsg = await git(machineADir, "log", "-1", "--format=%s", `origin/${BRANCH}`);
      expect(checkpointCommitMsg).toBe(`checkpoint: ${SLUG}`);

      // --- Assert (d): checkpoint commit tree contains state.json ---
      const treeFiles = await git(machineADir, "ls-tree", "-r", "--name-only", originHead);
      expect(treeFiles).toContain(`specrunner/changes/${SLUG}/state.json`);
      expect(treeFiles).toContain(`specrunner/changes/${SLUG}/events.jsonl`);
      expect(treeFiles).toContain(`specrunner/changes/${SLUG}/request.md`);

      // =======================================================================
      // TC-E2E-002: MACHINE B — Clone origin → attach → resume starts
      // =======================================================================

      // 1. Clone origin to Machine B
      await git(tmpDir, "clone", originDir, "machine-b");
      await git(machineBDir, "config", "user.email", "test@test.com");
      await git(machineBDir, "config", "user.name", "Test");

      // 2. runAttachVerification — reads checkpoint from origin/BRANCH
      const verified = await runAttachVerification({
        cwd: machineBDir,
        branch: BRANCH,
        spawnFn: spawnCommand,
        expectedRepo: EXPECTED_REPO,
      });

      expect(verified.slug).toBe(SLUG);
      expect(verified.jobId).toBe(jobId);
      expect(verified.state.status).toBe("awaiting-resume");
      expect(verified.state.resumePoint?.step).toBe("implementer");

      // 3. WorkspaceMaterializer.materialize — create worktree from checkpoint OID
      const materializerHost = makeRealMaterializerHost(machineBDir);
      const materializer = new WorkspaceMaterializer(materializerHost);
      const workspace = await materializer.materialize(SLUG, jobId, {
        kind: "attach-from-checkpoint",
        checkpointRef: verified.checkpointOid,
        branchName: BRANCH,
      });

      expect(workspace.worktreePath).toBeDefined();
      const worktreePath = workspace.worktreePath!;

      // Verify the worktree has the checkpoint files
      const stateJsonInWorktree = await fs.readFile(
        path.join(worktreePath, "specrunner", "changes", SLUG, "state.json"),
        "utf-8",
      );
      const checkpointState = JSON.parse(stateJsonInWorktree);
      expect(checkpointState.status).toBe("awaiting-resume");
      expect(checkpointState.jobId).toBe(jobId);

      // 4. Transition state to "running" for resume (as the resume command would do)
      const { state: runningState } = transitionJob(verified.state, "running", {
        trigger: "test-resume",
        reason: "resuming from checkpoint",
      });
      expect(runningState.status).toBe("running");

      // 5. Build fake AgentRunner for Machine B — returns "success" for implementer
      let machineBRunnerCallCount = 0;
      let machineBRunnerCalledAtStep: string | undefined;
      const machineBRunner = {
        async run(ctx: AgentRunContext): Promise<AgentRunResult> {
          machineBRunnerCallCount++;
          machineBRunnerCalledAtStep = ctx.step.name;
          return {
            completionReason: "success" as const,
            resultContent: null,
            toolResult: null,
            followUpAttempts: 0,
          };
        },
      };

      // 6. Build Machine B's PipelineDeps (no runtimeStrategy — skips git commit/push,
      //    validateStepInputs, finalizeStepArtifacts; keeps the test self-contained)
      const machineBStoreFactory = makeStoreFactory(tmpDir);
      // Seed the initial state in the changeDir store so begin() can persist
      await machineBStoreFactory(jobId).persist(runningState);

      const machineBDeps: PipelineDeps = {
        config: MINIMAL_CONFIG,
        slug: SLUG,
        cwd: worktreePath,
        request: makeRequest(SLUG),
        githubClient: makeStubGithubClient(),
        owner: EXPECTED_REPO.owner,
        repo: EXPECTED_REPO.name,
        spawn: spawnCommand,
        storeFactory: machineBStoreFactory,
        runner: machineBRunner,
        // No runtimeStrategy: validateStepInputs/finalizeStepArtifacts/commitFinalState skipped
      };

      // 7. Build minimal pipeline for Machine B: implementer → end
      const machineBEvents = new EventBus();
      const machineBPipeline = buildPipeline(IMPLEMENTER_ONLY_DESCRIPTOR, machineBDeps, machineBEvents);

      // 8. Run Machine B pipeline from resumePoint.step
      const resumeStep = verified.state.resumePoint!.step;
      const machineBFinalState = await machineBPipeline.run(resumeStep, runningState, machineBDeps);

      // --- Assert (c): fake AgentRunner called exactly once at resumePoint.step ---
      expect(machineBRunnerCallCount).toBe(1);
      expect(machineBRunnerCalledAtStep).toBe(STEP_NAMES.IMPLEMENTER);

      // --- Assert (d): pipeline completed normally (implementer → end → awaiting-archive) ---
      expect(machineBFinalState.status).toBe("awaiting-archive");

      // Clean up worktree
      await spawnCommand("git", ["worktree", "remove", "--force", worktreePath], { cwd: machineBDir }).catch(() => undefined);
    },
    // Long timeout — real git operations can be slow
    60_000,
  );
});
