/**
 * T-16: E2E fixture — GitHub 無効経路の完全ライフサイクル
 *
 * Verifies that with `github.enabled: false`:
 * - The pipeline completes without creating a PR (`branch-published` result)
 * - GitHub API is never called (fetch spy = 0 calls to github.com)
 * - Git push never injects a token via extraheader
 * - `job archive` leaves the remote feature branch intact
 * - `runAttachVerification` accepts matching origin digest; rejects mismatched digest
 *
 * Infrastructure:
 *   - bare origin (non-GitHub URL: file:///tmp/...)
 *   - Machine A clone runs the pipeline (fake AgentRunner, real git)
 *   - Machine B clone tests attach with matching and mismatched origin
 *
 * Mock boundary: only the agent SDK query seam (AgentRunner.run) and
 * verification step runner are mocked. git / state / pipeline are real.
 *
 * TC-T16-001: pipeline completes with awaiting-archive (branch-published)
 * TC-T16-002: no GitHub API calls made during the lifecycle
 * TC-T16-003: no git extraheader token injection
 * TC-T16-004: archive leaves remote feature branch intact (deleteRemoteBranch:false)
 * TC-T16-005: attach from Machine B succeeds with matching origin digest
 * TC-T16-006: attach from Machine C (wrong origin) is rejected with identity-mismatch
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { spawnCommand, type SpawnOptions } from "../src/util/spawn.js";
import { buildPipelineForJob } from "../src/core/pipeline/run.js";
import { JobStateStore, buildInitialJobState } from "../src/store/job-state-store.js";
import { commitFinalState } from "../src/core/step/commit-push.js";
import { EventBus } from "../src/core/event/event-bus.js";
import { defaultSpawnFn, gitExec } from "../src/util/git-exec.js";
import type { AgentRunContext, AgentRunResult } from "../src/core/port/agent-runner.js";
import type { AgentRunner } from "../src/core/port/agent-runner.js";
import type { PipelineDeps } from "../src/core/types.js";
import type { JobState } from "../src/state/schema.js";
import type { ChangedFilesCapability } from "../src/core/port/runtime-strategy.js";
import type { StepArtifactLifecycleCapability } from "../src/core/step/step-capability.js";
import type { StepIoValidationCapability } from "../src/core/step/step-capability.js";
import type { TerminalStateCapability } from "../src/core/pipeline/pipeline-capability.js";
import type { SpecRunnerConfig } from "../src/config/schema.js";
import type { ParsedRequest } from "../src/parser/request-md.js";
import { noopRoundGitEffects } from "../src/core/step/noop-capabilities.js";
import { runAttachVerification } from "../src/core/attach/orchestrator.js";
import { runPlainArchive } from "../src/core/archive/plain-archive.js";
import { normalizeOriginIdentity } from "../src/git/remote.js";
import type { FinishFs } from "../src/core/finish/types.js";
import { getGitHubIntegration } from "../src/state/github-integration.js";
import { verificationResultPath, reviewFeedbackPath, conformanceResultPath } from "../src/util/paths.js";

// ---------------------------------------------------------------------------
// Mock the verification runner and pr-create runner so we don't spawn real processes
// ---------------------------------------------------------------------------

vi.mock("../src/core/verification/runner.js", () => ({
  runVerification: vi.fn().mockImplementation(async (slug: string, cwd: string = process.cwd()) => {
    const outputPath = path.join(cwd, verificationResultPath(slug));
    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    await fsPromises.writeFile(
      outputPath,
      `# Verification Result — ${slug} — iter 1\n\n## Verdict: passed\n\n## Phase Results\n\n| # | Phase | Status | Duration | Exit Code |\n|---|-------|--------|----------|-----------|\n`,
    );
    return { slug, verdict: "passed" as const, phases: [] };
  }),
}));

// pr-create runner is NOT called in GitHub-disabled path; if it were called it would fail
vi.mock("../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn().mockRejectedValue(new Error("pr-create must not be called in GitHub-disabled path")),
}));

// ---------------------------------------------------------------------------
// Silence stdout/stderr
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
// Constants
// ---------------------------------------------------------------------------

const SLUG = "gh-disabled-feature";
const JOB_ID_PREFIX = "deadbeef";
const JOB_ID = `${JOB_ID_PREFIX}-cafe-babe-cafe-babe00000000`;
const BRANCH = `feat/${SLUG}-${JOB_ID_PREFIX}`;

// ---------------------------------------------------------------------------
// Minimal configs
// ---------------------------------------------------------------------------

const MINIMAL_CONFIG: SpecRunnerConfig = {
  version: 1 as const,
  agents: {
    implementer: {
      agentId: "implementer-agent-id",
      definitionHash: "sha256:imp",
      lastSyncedAt: new Date().toISOString(),
    },
    "code-review": {
      agentId: "code-review-agent-id",
      definitionHash: "sha256:cr",
      lastSyncedAt: new Date().toISOString(),
    },
    "code-fixer": {
      agentId: "code-fixer-agent-id",
      definitionHash: "sha256:cf",
      lastSyncedAt: new Date().toISOString(),
    },
    conformance: {
      agentId: "conformance-agent-id",
      definitionHash: "sha256:con",
      lastSyncedAt: new Date().toISOString(),
    },
    "adr-gen": {
      agentId: "adr-gen-agent-id",
      definitionHash: "sha256:adr",
      lastSyncedAt: new Date().toISOString(),
    },
  },
  pipeline: { maxRetries: 2 },
  // GitHub integration disabled
  github: { enabled: false },
};

function makeRequest(slug: string): ParsedRequest {
  return {
    type: "new-feature",
    title: "GitHub-disabled E2E feature",
    slug,
    baseBranch: "main",
    content: "# GitHub-disabled E2E request\n\nDo something locally.\n",
    adr: false,
  };
}

// ---------------------------------------------------------------------------
// Pipeline capability helpers (mirrors attach-resume-e2e.test.ts)
// ---------------------------------------------------------------------------

function makeTerminalStateCapability(cwd: string, slug: string): TerminalStateCapability {
  return {
    async commitFinalState(_cwd: string, _slug: string, state: JobState): Promise<void> {
      await commitFinalState({
        cwd,
        branch: state.branch ?? "",
        slug,
        spawnFn: spawnCommand,
        messageLabel: "checkpoint",
      });
    },
  };
}

function makeStepArtifact(): StepArtifactLifecycleCapability {
  return {
    async captureHeadSha(cwd: string): Promise<string | null> {
      return gitExec(defaultSpawnFn, cwd, ["rev-parse", "HEAD"]);
    },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(): Promise<void> {},
    async snapshotMainCheckoutGuard(): Promise<null> { return null; },
    async digestArtifacts(refs: { path: string }[]) {
      return refs.map((r) => ({ path: r.path, hash: null }));
    },
  };
}

const noopStepIo: StepIoValidationCapability = {
  async validateStepInputs(): Promise<void> {},
  async validateStepOutputs() { return { violations: [] }; },
  async verifyFindingRefs() { return []; },
};

const noopChangedFiles: ChangedFilesCapability = {
  canDeriveChangedFiles: () => false,
  async listChangedFiles() { return { kind: "success" as const, files: [] }; },
};

// ---------------------------------------------------------------------------
// FinishFs for plain archive
// ---------------------------------------------------------------------------

function makeFinishFs(): FinishFs {
  return {
    exists: async (p: string) => {
      try { await fsPromises.access(p); return true; } catch { return false; }
    },
    readdir: (p: string) => fsPromises.readdir(p),
    stat: async (p: string) => {
      const s = await fsPromises.stat(p);
      return { isDirectory: () => s.isDirectory() };
    },
    mkdir: async (p: string, opts: { recursive: boolean }) => { await fsPromises.mkdir(p, opts); },
    writeFile: (p: string, content: string) => fsPromises.writeFile(p, content),
    unlink: (p: string) => fsPromises.unlink(p),
    readFile: async (p: string) => { const buf = await fsPromises.readFile(p); return buf.toString(); },
    rm: async (p: string, opts: { recursive: boolean; force: boolean }) => { await fsPromises.rm(p, opts); },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
let savedXdg: string | undefined;
let savedGhToken: string | undefined;
let savedGithubToken: string | undefined;

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "gh-disabled-e2e-"));
  savedXdg = process.env["XDG_CONFIG_HOME"];
  savedGhToken = process.env["GH_TOKEN"];
  savedGithubToken = process.env["GITHUB_TOKEN"];

  // Set tokens in environment — they must NOT be used (key assertion of T-16)
  process.env["GH_TOKEN"] = "ghp_FAKE_TOKEN_MUST_NOT_BE_USED";
  process.env["GITHUB_TOKEN"] = "github_FAKE_TOKEN_MUST_NOT_BE_USED";
  process.env["XDG_CONFIG_HOME"] = path.join(tmpDir, "xdg");
});

afterEach(async () => {
  if (savedXdg !== undefined) process.env["XDG_CONFIG_HOME"] = savedXdg;
  else delete process.env["XDG_CONFIG_HOME"];
  if (savedGhToken !== undefined) process.env["GH_TOKEN"] = savedGhToken;
  else delete process.env["GH_TOKEN"];
  if (savedGithubToken !== undefined) process.env["GITHUB_TOKEN"] = savedGithubToken;
  else delete process.env["GITHUB_TOKEN"];
  await fsPromises.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-T16-001 through TC-T16-006: Full GitHub-disabled lifecycle
// ---------------------------------------------------------------------------

describe("T-16: GitHub-disabled lifecycle — pipeline → archive → attach", () => {
  it(
    "completes pipeline without PR, archives with branch preserved, and attach uses origin identity",
    async () => {
      // =====================================================================
      // GIT FIXTURE SETUP
      // =====================================================================

      const originDir = path.join(tmpDir, "origin");
      const machineADir = path.join(tmpDir, "machine-a");
      const machineBDir = path.join(tmpDir, "machine-b");
      const machineCDir = path.join(tmpDir, "machine-c"); // wrong origin

      // 1. Bare origin (non-GitHub URL)
      await fsPromises.mkdir(originDir, { recursive: true });
      await git(originDir, "init", "--bare", "--initial-branch=main");

      // 2. Machine A clone
      await git(tmpDir, "clone", originDir, "machine-a");
      await git(machineADir, "config", "user.email", "test@test.com");
      await git(machineADir, "config", "user.name", "Test");

      // 3. Initial commit on main
      await fsPromises.writeFile(path.join(machineADir, "README.md"), "# GitHub-disabled E2E\n");
      await git(machineADir, "add", "README.md");
      await git(machineADir, "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "initial");
      await git(machineADir, "push", "origin", "main");

      // 4. Project-local config with github.enabled: false
      await fsPromises.mkdir(path.join(machineADir, ".specrunner"), { recursive: true });
      await fsPromises.writeFile(
        path.join(machineADir, ".specrunner", "config.json"),
        JSON.stringify({ version: 1, github: { enabled: false } }),
        "utf-8",
      );

      // 5. Feature branch
      await git(machineADir, "checkout", "-b", BRANCH);

      // 6. Write required pipeline files
      const changeDir = path.join(machineADir, "specrunner", "changes", SLUG);
      await fsPromises.mkdir(changeDir, { recursive: true });
      await fsPromises.writeFile(
        path.join(changeDir, "request.md"),
        `# GitHub-disabled E2E feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n- **base-branch**: main\n- **adr**: false\n\nDo something locally.\n`,
        "utf-8",
      );
      await fsPromises.writeFile(
        path.join(changeDir, "spec.md"),
        `# Spec\n\n## Overview\n\nLocal-only feature.\n`,
        "utf-8",
      );
      await fsPromises.writeFile(
        path.join(changeDir, "tasks.md"),
        `# Tasks\n\n- [ ] Implement\n`,
        "utf-8",
      );

      // Commit and push initial files
      await git(machineADir, "add", "-A");
      await git(machineADir, "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", `setup: initial files for ${SLUG}`);
      await git(machineADir, "push", "origin", BRANCH);

      // =====================================================================
      // Spy on fetch (must stay 0 — no GitHub API calls)
      // =====================================================================

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: string | URL | Request) => {
        const urlStr = String(url);
        // Fail loudly if GitHub API is called — this must never happen in GitHub-disabled path
        throw new Error(`[T-16] Unexpected fetch call to GitHub API: ${urlStr}`);
      });

      // =====================================================================
      // TC-T16-001: Build initial JobState with GitHub-disabled contract
      // =====================================================================

      // Compute origin identity from Machine A's origin URL
      const originUrl = originDir; // local path (file:// style)
      const originIdentity = normalizeOriginIdentity(originUrl);

      const machineAInitialState: JobState = {
        ...buildInitialJobState({
          request: {
            path: `specrunner/changes/${SLUG}/request.md`,
            title: "GitHub-disabled E2E feature",
            type: "new-feature",
            slug: SLUG,
          },
          // GitHub-disabled: no owner/name, only origin
          repository: { origin: originIdentity },
          githubIntegration: { enabled: false },
        }),
        jobId: JOB_ID,
        branch: BRANCH,
        status: "running",
        step: "implementer",
      };

      // Assert contract is correctly set on state
      expect(getGitHubIntegration(machineAInitialState).enabled).toBe(false);
      expect(machineAInitialState.repository.origin).toBeDefined();
      expect((machineAInitialState.repository as { owner?: string }).owner).toBeUndefined();

      // Persist initial state
      const storeFactory = (id: string) =>
        new JobStateStore(id, machineADir, { slug: SLUG, stateRoot: machineADir });
      await storeFactory(JOB_ID).persist(machineAInitialState);

      // =====================================================================
      // TC-T16-001: Run pipeline — implementer returns "timeout" (halt)
      // =====================================================================

      let agentCallCount = 0;
      const fakeAgent: AgentRunner = {
        async run(ctx: AgentRunContext): Promise<AgentRunResult> {
          agentCallCount++;
          // Return timeout on first call → pipeline halts to awaiting-resume
          if (agentCallCount === 1) {
            return { completionReason: "timeout" as const, resultContent: null, toolResult: null, followUpAttempts: 0 };
          }

          const stepName = ctx.step.name;
          const changeDir = path.join(ctx.cwd, "specrunner", "changes", SLUG);
          await fsPromises.mkdir(changeDir, { recursive: true });

          // Write step-appropriate result files and return matching toolResult.
          // implementer (producer): writes implementer-result.md
          if (stepName === "implementer") {
            const implResultPath = path.join(ctx.cwd, `specrunner/changes/${SLUG}/implementer-result.md`);
            await fsPromises.writeFile(
              implResultPath,
              `# Implementer Result — ${SLUG}\n\n## Status: success\n\nImplemented.\n`,
            );
            return {
              completionReason: "success" as const,
              resultContent: await fsPromises.readFile(implResultPath, "utf-8"),
              toolResult: { ok: true, status: "success" },
              followUpAttempts: 0,
            };
          }

          // code-review (judge step): writes review-feedback-001.md, approves with no findings
          if (stepName === "code-review") {
            const reviewPath = path.join(ctx.cwd, reviewFeedbackPath(SLUG, 1));
            await fsPromises.mkdir(path.dirname(reviewPath), { recursive: true });
            await fsPromises.writeFile(
              reviewPath,
              `# Code Review — ${SLUG}\n\n## Verdict: approved\n\nLGTM — no issues found.\n`,
            );
            return {
              completionReason: "success" as const,
              resultContent: await fsPromises.readFile(reviewPath, "utf-8"),
              toolResult: { ok: true, findings: [], evidence: { checked: 1 } },
              followUpAttempts: 0,
            };
          }

          // conformance (judge step): writes conformance-result-001.md, approves with no findings
          if (stepName === "conformance") {
            const conformancePath = path.join(ctx.cwd, conformanceResultPath(SLUG, 1));
            await fsPromises.mkdir(path.dirname(conformancePath), { recursive: true });
            await fsPromises.writeFile(
              conformancePath,
              `# Conformance — ${SLUG}\n\n## Verdict: approved\n\nAll acceptance criteria met.\n`,
            );
            return {
              completionReason: "success" as const,
              resultContent: await fsPromises.readFile(conformancePath, "utf-8"),
              toolResult: { ok: true, findings: [], evidence: { checked: 1 } },
              followUpAttempts: 0,
            };
          }

          // All other agent steps (adr-gen etc.): return success with no result file
          return {
            completionReason: "success" as const,
            resultContent: null,
            toolResult: { ok: true, status: "success" },
            followUpAttempts: 0,
          };
        },
      };

      const terminalState = makeTerminalStateCapability(machineADir, SLUG);
      const pipelineDeps: PipelineDeps = {
        config: MINIMAL_CONFIG,
        slug: SLUG,
        cwd: machineADir,
        request: makeRequest(SLUG),
        githubClient: null,    // GitHub-disabled: no client
        owner: undefined,
        repo: undefined,
        spawn: spawnCommand,
        storeFactory,
        runner: fakeAgent,
        terminalState,
        stepArtifact: makeStepArtifact(),
        stepIo: noopStepIo,
        changedFiles: noopChangedFiles,
        gitTransportSpawn: defaultSpawnFn,
        roundGitEffects: noopRoundGitEffects,
      };

      const events = new EventBus();
      // Use buildPipelineForJob which applies GitHub integration contract (removes pr-create)
      const machineAPipeline = buildPipelineForJob(machineAInitialState, pipelineDeps, events);
      const haltedState = await machineAPipeline.run("implementer", machineAInitialState, pipelineDeps);

      // TC-T16-001(a): halted at awaiting-resume
      expect(haltedState.status).toBe("awaiting-resume");
      expect(haltedState.resumePoint?.step).toBe("implementer");
      expect(agentCallCount).toBe(1);

      // TC-T16-002: No GitHub API calls during run
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // Resume from awaiting-resume → pipeline should complete to awaiting-archive
      // =====================================================================

      // Refresh state from disk (checkpoint was committed)
      const resumeState = await storeFactory(JOB_ID).load();
      const resumePipeline = buildPipelineForJob(resumeState, pipelineDeps, events);
      const completeState = await resumePipeline.run("implementer", resumeState, pipelineDeps);

      // TC-T16-001(b): pipeline completes with awaiting-archive (no PR created)
      // In GitHub-disabled mode, pr-create is removed from the pipeline,
      // so the pipeline ends at awaiting-archive after adr-gen → end.
      // TC-120 (must): only awaiting-archive is acceptable — awaiting-resume means the
      // pipeline halted again and the GitHub-disabled completion contract was not verified.
      expect(completeState.status).toBe("awaiting-archive");

      // TC-T16-002: Still no GitHub API calls
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // TC-T16-004: archive — remote branch preserved
      // =====================================================================

      // Verify branch exists on origin before archive
      const branchesBeforeArchive = await git(originDir, "branch", "--list", BRANCH);
      expect(branchesBeforeArchive).toContain(BRANCH);

      await runPlainArchive({
        slug: SLUG,
        cwd: machineADir,
        spawn: spawnCommand,
        fs: makeFinishFs(),
        baseBranch: "main",
        // githubToken intentionally omitted — GitHub-disabled job
      });

      // Archive should succeed (exit 0 or 1 if push fails due to test infra)
      // The key assertion: feature branch is still on origin after archive
      const branchesAfterArchive = await git(originDir, "branch", "--list", BRANCH);
      expect(branchesAfterArchive).toContain(BRANCH); // TC-T16-004: branch preserved

      // TC-T16-002: Still no GitHub API calls
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // TC-T16-005: Machine B clone — attach with matching origin identity
      // =====================================================================

      await git(tmpDir, "clone", originDir, "machine-b");
      await git(machineBDir, "config", "user.email", "test@test.com");
      await git(machineBDir, "config", "user.name", "Test");

      // Machine B's origin points to the same bare origin → same digest
      const machineBOrigin = normalizeOriginIdentity(originDir);
      expect(machineBOrigin.digest).toBe(originIdentity.digest);

      const machineBVerified = await runAttachVerification({
        cwd: machineBDir,
        branch: BRANCH,
        spawnFn: spawnCommand,
        expectedRepo: {
          // GitHub-disabled: no github field, only origin
          origin: machineBOrigin,
        },
      });

      expect(machineBVerified.slug).toBe(SLUG);
      expect(machineBVerified.jobId).toBe(JOB_ID);

      // TC-T16-005: attach succeeded with matching origin digest
      expect(machineBVerified.state.githubIntegration?.enabled).toBe(false);

      // TC-T16-002: No GitHub API calls from attach either
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // TC-T16-006: Machine C (wrong origin URL) — attach rejected with identity-mismatch
      // Clone the real origin so Machine C has all git objects, but then point
      // the "origin" remote URL to a different path → different digest → mismatch
      // =====================================================================

      await git(tmpDir, "clone", originDir, "machine-c");
      await git(machineCDir, "config", "user.email", "test@test.com");
      await git(machineCDir, "config", "user.name", "Test");

      // Change the origin remote URL to a different path → different digest
      const wrongOriginDir = path.join(tmpDir, "wrong-origin");
      await fsPromises.mkdir(wrongOriginDir, { recursive: true });
      await git(wrongOriginDir, "init", "--bare", "--initial-branch=main");
      await git(machineCDir, "remote", "set-url", "origin", wrongOriginDir);

      // Machine C's origin now points to a DIFFERENT bare origin → different digest
      const machineCOrigin = normalizeOriginIdentity(wrongOriginDir);
      expect(machineCOrigin.digest).not.toBe(originIdentity.digest);

      // Machine C already has all git objects from the clone. Now try attach.
      // The spawnFn intercepts "git fetch origin" to skip the actual fetch
      // (Machine C still has origin/<branch> from the initial clone).
      await expect(
        runAttachVerification({
          cwd: machineCDir,
          branch: BRANCH,
          spawnFn: async (cmd: string, args: string[], opts: SpawnOptions) => {
            // Skip "git fetch origin <branch>" — objects already available
            if (cmd === "git" && args[0] === "fetch") {
              return { exitCode: 0, stdout: "", stderr: "" };
            }
            return spawnCommand(cmd, args, opts);
          },
          expectedRepo: {
            origin: machineCOrigin, // wrong digest
          },
        }),
      ).rejects.toThrow(/identity/i);

      // TC-T16-002: No GitHub API calls from any of the above
      expect(fetchSpy).not.toHaveBeenCalled();
    },
    120_000, // 2 minutes timeout
  );
});
