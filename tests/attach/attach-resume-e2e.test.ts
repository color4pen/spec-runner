/**
 * E2E test: guard-halt → checkpoint publish → attach → resume start.
 *
 * Uses real git operations (bare origin + Machine A clone + Machine B clone).
 * No GitHub API, no real agent sessions, no subprocess agents.
 *
 * TC-E2E-001: Machine A — real Pipeline.run() + fake AgentRunner (implementer returns
 *   "timeout") → state.status === "awaiting-resume" → commitFinalState pushes checkpoint
 *   commit to origin/BRANCH
 * TC-E2E-002: Machine B — fresh clone → runAttachVerification →
 *   real LocalRuntime.setupWorkspace({attachCheckpoint}) → real ResumeCommand.execute()
 *   (prepare() + buildPipelineForJob() non-mock) → real Pipeline.run() from resumePoint.step
 *   → fake AgentRunner called at that step
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { spawnCommand } from "../../src/util/spawn.js";
import { runAttachVerification } from "../../src/core/attach/orchestrator.js";
import { createWorktreeManager } from "../../src/core/worktree/manager.js";
import { buildPipeline } from "../../src/core/pipeline/run.js";
import { STANDARD_DESCRIPTOR } from "../../src/core/pipeline/registry.js";
import { JobStateStore, buildInitialJobState } from "../../src/store/job-state-store.js";
import { commitFinalState } from "../../src/core/step/commit-push.js";
import { EventBus } from "../../src/core/event/event-bus.js";
import { STEP_NAMES } from "../../src/core/step/step-names.js";
import { defaultSpawnFn, gitExec } from "../../src/util/git-exec.js";
import type { AgentRunContext, AgentRunResult } from "../../src/core/port/agent-runner.js";
import type { AgentRunner } from "../../src/core/port/agent-runner.js";
import type { PipelineDeps } from "../../src/core/types.js";
import type { JobState } from "../../src/state/schema.js";
import type { RuntimeStrategy } from "../../src/core/port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";
import type { ParsedRequest } from "../../src/parser/request-md.js";
import type { GitHubClient } from "../../src/core/port/github-client.js";
import { LocalRuntime } from "../../src/core/runtime/local.js";
import type { LocalRuntimeOptions } from "../../src/core/runtime/local.js";
import { ResumeCommand } from "../../src/core/command/resume.js";

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
    "Machine A creates awaiting-resume checkpoint on origin; Machine B attaches and resumes implementer via real ResumeCommand",
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
        `# E2E test feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n- **base-branch**: main\n- **adr**: false\n\nDo something.\n`,
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

      // Build initial state for Machine A.
      // request.path is stripped from state.json in slug mode and re-derived from the
      // worktree's change folder at load time; the stored value is not used by ResumeCommand.
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
      // TC-E2E-002: MACHINE B — Clone origin → attach → real ResumeCommand
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

      // 3. Write minimal project-local config for Machine B
      //    (ResumeCommand.prepare() calls loadConfig(repoRoot) which needs this)
      await fs.mkdir(path.join(machineBDir, ".specrunner"), { recursive: true });
      await fs.writeFile(
        path.join(machineBDir, ".specrunner", "config.json"),
        JSON.stringify({ version: 1, agents: {} }),
        "utf-8",
      );

      // 4. Isolate XDG_CONFIG_HOME so user global config is absent (ENOENT)
      //    This ensures loadConfig reads only the project-local config.
      const savedXdgConfigHome = process.env["XDG_CONFIG_HOME"];
      const xdgIsolateDir = path.join(tmpDir, "xdg-isolated");
      await fs.mkdir(xdgIsolateDir, { recursive: true });
      process.env["XDG_CONFIG_HOME"] = xdgIsolateDir;

      // Track worktree path for cleanup
      let attachWorktreePath: string | undefined;

      try {
        // 5. T-01: Attach via real LocalRuntime.setupWorkspace({attachCheckpoint})
        //    This creates a worktree from the checkpoint OID and writes a liveness sidecar.
        const attachRuntime = new LocalRuntime({
          cwd: machineBDir,
          githubClient: makeStubGithubClient(),
          owner: EXPECTED_REPO.owner,
          repo: EXPECTED_REPO.name,
          spawnFn: spawnCommand,
        });

        const attachWorkspace = await attachRuntime.setupWorkspace(SLUG, jobId, {
          attachCheckpoint: { branch: BRANCH, checkpointRef: verified.checkpointOid },
          baseBranch: "main",
        });

        expect(attachWorkspace.worktreePath).toBeDefined();
        attachWorktreePath = attachWorkspace.worktreePath!;

        // T-01 acceptance: verify the worktree state.json is awaiting-resume and jobId matches
        const attachStateJsonPath = path.join(attachWorktreePath, "specrunner", "changes", SLUG, "state.json");
        const attachStateRaw = JSON.parse(await fs.readFile(attachStateJsonPath, "utf-8"));
        expect(attachStateRaw.status).toBe("awaiting-resume");
        expect(attachStateRaw.jobId).toBe(jobId);

        // 6. T-04: Verify disk state BEFORE resume is awaiting-resume (pre-condition)
        const beforeResumeState = JSON.parse(await fs.readFile(attachStateJsonPath, "utf-8"));
        expect(beforeResumeState.status).toBe("awaiting-resume");

        // 7. T-03: Setup fake AgentRunner that captures call context and reads disk state
        let machineBRunnerCallCount = 0;
        let machineBRunnerCalledAtStep: string | undefined;
        let machineBRunnerCalledJobId: string | undefined;
        let machineBRunnerCalledSlug: string | undefined;
        let machineBRunnerCwd: string | undefined;
        let machineBDiskStatusAtRunnerCall: string | undefined;

        const machineBRunner: AgentRunner = {
          async run(ctx: AgentRunContext): Promise<AgentRunResult> {
            machineBRunnerCallCount++;
            machineBRunnerCalledAtStep = ctx.step.name;
            machineBRunnerCalledJobId = ctx.state.jobId;
            machineBRunnerCalledSlug = ctx.slug;
            machineBRunnerCwd = ctx.cwd;
            // T-04 running persistence: read state.json from disk at runner call time
            const stateJsonPath = path.join(ctx.cwd, "specrunner", "changes", SLUG, "state.json");
            const diskState = JSON.parse(await fs.readFile(stateJsonPath, "utf-8"));
            machineBDiskStatusAtRunnerCall = diskState.status;
            return {
              completionReason: "timeout" as const,
              resultContent: null,
              toolResult: null,
              followUpAttempts: 0,
            };
          },
        };

        // 8. T-03: Create resume runtime with spied worktree manager
        //    Only createAgentRunner() is overridden; all other methods are real LocalRuntime.
        //
        // NOTE: ResumeLocalRuntime is defined HERE (inside the test body) rather than at
        // module level to avoid a vitest mock collision: attach-cli.test.ts uses
        // vi.mock('../../src/core/runtime/local.js') which replaces LocalRuntime with a mock
        // object. If ResumeLocalRuntime extends LocalRuntime at module evaluation time and
        // local.js is already mocked, `extends` receives a non-class and throws
        // "The value of the superclass's prototype property is not an object or null".
        // Defining the class lazily (at runtime inside the test) ensures LocalRuntime is
        // the real class when this line executes.
        class ResumeLocalRuntime extends LocalRuntime {
          private readonly _fakeAgent: AgentRunner;
          constructor(opts: LocalRuntimeOptions, fakeAgent: AgentRunner) {
            super(opts);
            this._fakeAgent = fakeAgent;
          }
          override createAgentRunner(): AgentRunner {
            return this._fakeAgent;
          }
        }

        const resumeManager = createWorktreeManager(spawnCommand);
        const createSpy = vi.spyOn(resumeManager, "create");

        const resumeRuntime = new ResumeLocalRuntime({
          cwd: machineBDir,
          githubClient: makeStubGithubClient(),
          owner: EXPECTED_REPO.owner,
          repo: EXPECTED_REPO.name,
          spawnFn: spawnCommand,
          manager: resumeManager,
        }, machineBRunner);

        // 9. Execute real ResumeCommand (prepare() + buildPipelineForJob() non-mock)
        const machineBEvents = new EventBus();
        const exitCode = await new ResumeCommand(
          resumeRuntime,
          machineBEvents,
          SLUG,
          { cwd: machineBDir },
        ).execute();

        // ===================================================================
        // T-04: 6 observable assertions
        // ===================================================================

        // (1) Attached state resolution: resume resolved the correct jobId and slug
        expect(machineBRunnerCallCount).toBe(1);
        expect(machineBRunnerCalledJobId).toBe(jobId);
        expect(machineBRunnerCalledSlug).toBe(SLUG);

        // (2) startStep resolution: resolved step === resumePoint.step
        expect(machineBRunnerCalledAtStep).toBe(STEP_NAMES.IMPLEMENTER);
        expect(machineBRunnerCalledAtStep).toBe(verified.state.resumePoint!.step);

        // (3) Running persistence: disk state.json was "running" when runner was called
        expect(machineBDiskStatusAtRunnerCall).toBe("running");

        // (4) Worktree reuse: no new worktree created by resume, cwd equals attach worktree
        expect(createSpy).not.toHaveBeenCalled();
        expect(machineBRunnerCwd).toBe(attachWorktreePath);

        // (5) Descriptor real selection: final disk state is awaiting-resume with
        //     resumePoint.step === implementer (behavioral signature of STANDARD_DESCRIPTOR
        //     selected by buildPipelineForJob(), guard-halt after fake runner timeout)
        const finalDiskState = JSON.parse(await fs.readFile(attachStateJsonPath, "utf-8"));
        expect(finalDiskState.status).toBe("awaiting-resume");
        expect(finalDiskState.resumePoint?.step).toBe(STEP_NAMES.IMPLEMENTER);

        // (6) Resume started: fake runner called exactly once at implementer step
        //     (already verified above, exit code confirms awaiting-resume halted pipeline)
        expect(exitCode).toBe(1);

      } finally {
        // Restore XDG_CONFIG_HOME
        if (savedXdgConfigHome !== undefined) {
          process.env["XDG_CONFIG_HOME"] = savedXdgConfigHome;
        } else {
          delete process.env["XDG_CONFIG_HOME"];
        }

        // Best-effort worktree cleanup (rm -rf tmpDir in afterEach also covers this)
        if (attachWorktreePath) {
          await spawnCommand(
            "git",
            ["worktree", "remove", "--force", attachWorktreePath],
            { cwd: machineBDir },
          ).catch(() => undefined);
        }
      }
    },
    // Long timeout — real git operations can be slow
    60_000,
  );
});
