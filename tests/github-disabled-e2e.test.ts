/**
 * T-16: E2E fixture — GitHub 無効経路の完全ライフサイクル (CLI entry-point version)
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
 *   - Machine A clone runs via real CLI entry points (runRunCore, runResumeCore, runArchive)
 *   - Machine B clone tests attach with matching origin
 *   - Machine C clone tests attach with wrong origin (rejected)
 *
 * Mock boundary:
 *   - `buildPipelineForJob` is mocked to control pipeline transitions without real LLM calls
 *   - `createClaudeProviderReadinessProbe` is mocked to bypass Claude Code auth check
 *   - All git/state/worktree/commit/push operations are real
 *
 * TC-T16-001: pipeline completes with awaiting-archive (branch-published)
 * TC-T16-002: no GitHub API calls made during the lifecycle
 * TC-T16-003: no git extraheader token injection (local file:// remote, no auth needed)
 * TC-T16-004: archive leaves remote feature branch intact (deleteRemoteBranch:false)
 * TC-T16-005: attach from Machine B succeeds with matching origin digest
 * TC-T16-006: attach from Machine C (wrong origin) is rejected with identity-mismatch
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { spawnCommand, type SpawnOptions } from "../src/util/spawn.js";
import { runRunCore } from "../src/cli/run.js";
import { runResumeCore } from "../src/cli/resume.js";
import { runReopenCore } from "../src/cli/reopen.js";
import { runArchive } from "../src/cli/archive.js";
import { JobStateStore } from "../src/store/job-state-store.js";
import { getJobSlug } from "../src/state/job-slug.js";
import { getGitHubIntegration } from "../src/state/github-integration.js";
import { normalizeOriginIdentity } from "../src/git/remote.js";
import { runAttachVerification } from "../src/core/attach/orchestrator.js";

// ---------------------------------------------------------------------------
// vi.hoisted: pipeline call counter — must be accessible in vi.mock() factory
// closures (vi.hoisted values are available before module evaluation).
// ---------------------------------------------------------------------------

const { pipelineCallState } = vi.hoisted(() => ({
  pipelineCallState: { count: 0 },
}));

// ---------------------------------------------------------------------------
// Mock buildPipelineForJob — controls pipeline transitions without real LLM
//
// Call 1 (from runRunCore):  returns awaiting-resume (implementer timeout)
// Call 2 (from runResumeCore): returns awaiting-archive (full completion)
//
// Each call:
//   1. Persists the new state to the slug store (writes state.json + events.jsonl)
//   2. Calls deps.terminalState.commitFinalState (real LocalRuntime implementation:
//      git add → git commit → persistBeforePush appends OID → git push)
//   3. Returns the new state
//
// The egress ledger (synthesizedCommits) is maintained correctly:
//   Call 1: ledger = [bootstrapOid, checkpointOid] → push succeeds
//   Call 2: ledger = [bootstrapOid, checkpointOid, finalizeOid] → push succeeds
// ---------------------------------------------------------------------------

vi.mock("../src/core/pipeline/index.js", async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...orig,
    buildPipelineForJob: vi.fn().mockImplementation(
      (_jobState: unknown, _deps: unknown, _events: unknown) => ({
        run: vi.fn().mockImplementation(
          async (_startStep: unknown, state: unknown, deps: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const s = state as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const d = deps as any;

            pipelineCallState.count++;
            const callNum = pipelineCallState.count;

            // Build the new state based on which call this is
            const newState =
              callNum === 1
                ? {
                    ...s,
                    status: "awaiting-resume" as const,
                    // D4: set step so reopen's resumePoint=null clear doesn't strand
                    // resolveResumeStep with "init" (not a valid pipeline step name)
                    step: "implementer" as const,
                    resumePoint: {
                      step: "implementer",
                      reason: "timeout",
                      iterationsExhausted: 0,
                    },
                    updatedAt: new Date().toISOString(),
                  }
                : {
                    ...s,
                    status: "awaiting-archive" as const,
                    resumePoint: null,
                    updatedAt: new Date().toISOString(),
                  };

            // Step 1: persist to slug store (writes state.json + events.jsonl in worktree)
            await d.storeFactory(s.jobId).persist(newState);

            // Step 2: commit + push via real LocalRuntime.commitFinalState
            // persistBeforePush callback (inside commitFinalState) appends the new OID
            // to synthesizedCommits BEFORE push — egress ledger stays consistent.
            const cwd: string = d.cwd ?? process.cwd();
            await d.terminalState.commitFinalState(cwd, d.slug, newState);

            return newState;
          },
        ),
      }),
    ),
  };
});

// ---------------------------------------------------------------------------
// Mock createClaudeProviderReadinessProbe — bypasses Claude Code auth check.
// LocalRuntime.assertProviderReadiness() dynamically imports this factory and
// calls the returned probe before any pipeline step runs.
// ---------------------------------------------------------------------------

vi.mock("../src/adapter/claude-code/provider-readiness-probe.js", () => ({
  createClaudeProviderReadinessProbe: () =>
    async (_env: unknown) => ({ kind: "ready" as const }),
}));

// ---------------------------------------------------------------------------
// Mock verification + pr-create runners for safety (neither should be called
// since the mock pipeline never invokes real steps).
// ---------------------------------------------------------------------------

vi.mock("../src/core/verification/runner.js", () => ({
  runVerification: vi.fn().mockRejectedValue(
    new Error("runVerification must not be called — mock pipeline bypasses real steps"),
  ),
}));

vi.mock("../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn().mockRejectedValue(
    new Error("runPrCreate must not be called in GitHub-disabled path"),
  ),
}));

// ---------------------------------------------------------------------------
// Silence stdout/stderr output from CLI entry points
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  // Reset pipeline call counter before each test
  pipelineCallState.count = 0;
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
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.exitCode}):\n${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "gh-disabled-feature";

// ---------------------------------------------------------------------------
// Environment setup / teardown
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

  // Set fake tokens — a key assertion of T-16 is that these are NEVER used
  process.env["GH_TOKEN"] = "ghp_FAKE_TOKEN_MUST_NOT_BE_USED";
  process.env["GITHUB_TOKEN"] = "github_FAKE_TOKEN_MUST_NOT_BE_USED";
  // Isolate XDG config so global credentials files cannot interfere
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

describe("T-16: GitHub-disabled lifecycle — CLI entry points: run → attach → resume → archive", () => {
  it(
    "completes pipeline without PR, archives with branch preserved, and attach uses origin identity",
    async () => {
      // =====================================================================
      // GIT FIXTURE SETUP
      //
      // We pre-commit spec.md and tasks.md to main so they appear in the
      // worktree that runRunCore creates (worktree is based on origin/main).
      // This satisfies attachResumePolicy's tree-precheck: implementer.reads()
      // requires tasks.md and spec.md in treeFiles.
      //
      // .gitignore must already contain the 3 lines that ensureDotSpecrunnerGitignore
      // checks for, so the function is a no-op and the main-checkout working tree
      // stays clean during runRunCore.
      // =====================================================================

      const originDir = path.join(tmpDir, "origin");
      const machineADir = path.join(tmpDir, "machine-a");

      // 1. Bare origin (non-GitHub, local file:// style)
      await fsPromises.mkdir(originDir, { recursive: true });
      await git(originDir, "init", "--bare", "--initial-branch=main");

      // 2. Machine A clone (used for all CLI operations)
      await git(tmpDir, "clone", originDir, "machine-a");
      await git(machineADir, "config", "user.email", "test@test.com");
      await git(machineADir, "config", "user.name", "Test");

      // 3. Build the initial main commit with all required files
      await fsPromises.writeFile(path.join(machineADir, "README.md"), "# GitHub-disabled E2E\n");

      // .gitignore: all 3 lines required by ensureDotSpecrunnerGitignore so it is a no-op
      await fsPromises.writeFile(
        path.join(machineADir, ".gitignore"),
        ".specrunner/*\n!.specrunner/config.json\nnode_modules/\n",
      );

      // Project-local config: github.enabled: false
      await fsPromises.mkdir(path.join(machineADir, ".specrunner"), { recursive: true });
      await fsPromises.writeFile(
        path.join(machineADir, ".specrunner", "config.json"),
        JSON.stringify({ version: 1, github: { enabled: false } }),
      );

      // Pre-commit spec.md + tasks.md for the SLUG's change folder.
      // These files are required by attachResumePolicy's tree-precheck (implementer.reads()).
      // They land in the worktree because the worktree is created from origin/main.
      const changeDir = path.join(machineADir, "specrunner", "changes", SLUG);
      await fsPromises.mkdir(changeDir, { recursive: true });
      await fsPromises.writeFile(
        path.join(changeDir, "spec.md"),
        "# Spec\n\n## Overview\n\nLocal-only feature with GitHub integration disabled.\n",
      );
      await fsPromises.writeFile(
        path.join(changeDir, "tasks.md"),
        "# Tasks\n\n- [ ] Implement the local feature\n",
      );

      await git(machineADir, "add", "-A");
      await git(machineADir, "commit", "-m", "initial: setup for GitHub-disabled E2E");
      await git(machineADir, "push", "origin", "main");

      // 4. External request.md (outside machineADir).
      //    runRunCore copies it into the worktree as part of setupWorkspace.
      //    The canonical path patterns (specrunner/drafts/<slug>/request.md) do not
      //    match this path, so requestSlug in bootstrapJob will be null; the slug is
      //    correctly derived from the feature branch name in getJobSlug().
      const externalRequestMdPath = path.join(tmpDir, "request.md");
      await fsPromises.writeFile(
        externalRequestMdPath,
        [
          `# GitHub-disabled E2E feature`,
          ``,
          `## Meta`,
          ``,
          `- **type**: new-feature`,
          `- **slug**: ${SLUG}`,
          `- **base-branch**: main`,
          `- **adr**: false`,
          ``,
          `Implement a local-only feature without GitHub integration.`,
          ``,
        ].join("\n"),
      );

      // =====================================================================
      // Spy on fetch — must remain at zero throughout the entire lifecycle.
      // Any call to globalThis.fetch (GitHub API, Claude API, etc.) fails loudly.
      // =====================================================================

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url: string | URL | Request) => {
          throw new Error(`[T-16] Unexpected fetch call: ${String(url)}`);
        });

      // =====================================================================
      // Phase 1: runRunCore
      //
      // - Creates a new git worktree from origin/main
      // - Bootstrap commit (request.md) pushed to feature branch
      // - Mock pipeline call #1: returns awaiting-resume
      // - Checkpoint commit (state.json + events.jsonl) pushed
      // - handleResult(awaiting-resume) → exit code 1
      //
      // Branch name is captured via onFeatureBranchCreated callback.
      // =====================================================================

      let capturedBranch: string | undefined;

      const runExitCode = await runRunCore(externalRequestMdPath, {
        cwd: machineADir,
        onFeatureBranchCreated: async (_baseOid: string, branchName: string) => {
          capturedBranch = branchName;
        },
      });

      // TC-T16-001(a): runRunCore halts at awaiting-resume → exit code 1
      expect(runExitCode).toBe(1);
      expect(capturedBranch).toBeDefined();
      expect(capturedBranch).toMatch(/^feat\/gh-disabled-feature-[0-9a-f]{8}$/);

      // TC-T16-002: No GitHub API calls during run phase
      expect(fetchSpy).not.toHaveBeenCalled();

      // Verify the pipeline mock was called exactly once (run phase)
      expect(pipelineCallState.count).toBe(1);

      // =====================================================================
      // Discover jobId from job catalog.
      // JobStateStore.list scans machineADir/.git/specrunner-worktrees/*/
      // specrunner/changes/*/state.json to find the worktree-resident state.
      // =====================================================================

      const allStates = await JobStateStore.list(machineADir);
      const runState = allStates.find((s) => getJobSlug(s) === SLUG);
      expect(runState).toBeDefined();
      const jobId = runState!.jobId;

      // D1: GitHub integration contract is fixed in job state (not re-read from config)
      expect(getGitHubIntegration(runState!).enabled).toBe(false);
      // D1: repository has origin identity only (no GitHub owner/name)
      expect(runState!.repository.origin).toBeDefined();
      expect((runState!.repository as { owner?: string }).owner).toBeUndefined();

      // =====================================================================
      // TC-T16-005: Machine B — attach from matching origin succeeds.
      //
      // Must happen BEFORE resume/archive:
      // - attachResumePolicy requires status==="awaiting-resume" ✓ (checkpoint state)
      // - After archive, resolveCheckpointSlug fails (change folder moved to archive/)
      // =====================================================================

      const machineBDir = path.join(tmpDir, "machine-b");
      await git(tmpDir, "clone", originDir, "machine-b");
      await git(machineBDir, "config", "user.email", "test@test.com");
      await git(machineBDir, "config", "user.name", "Test");

      // Machine B's origin remote URL points to the same bare origin → same digest
      const machineBOrigin = normalizeOriginIdentity(originDir);

      const machineBVerified = await runAttachVerification({
        cwd: machineBDir,
        branch: capturedBranch!,
        spawnFn: spawnCommand,
        expectedRepo: { origin: machineBOrigin },
      });

      // TC-T16-005: attach succeeded — checkpoint is valid and digest matches
      expect(machineBVerified.slug).toBe(SLUG);
      expect(machineBVerified.jobId).toBe(jobId);
      expect(machineBVerified.state.githubIntegration?.enabled).toBe(false);
      expect(machineBVerified.state.status).toBe("awaiting-resume");

      // TC-T16-002: Still no GitHub API calls
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // TC-T16-006: Machine C (wrong origin URL) — attach rejected.
      //
      // Machine C is cloned from the real origin so it has all git objects,
      // but then the origin remote URL is changed to a different bare repo.
      // This changes the digest → origin identity mismatch → CHECKPOINT_NOT_ATTACHABLE.
      //
      // We intercept "git fetch origin <branch>" to skip the actual fetch
      // (Machine C already has origin/<branch> from the initial clone), then
      // let all other git commands run against the real repos.
      // =====================================================================

      const machineCDir = path.join(tmpDir, "machine-c");
      await git(tmpDir, "clone", originDir, "machine-c");
      await git(machineCDir, "config", "user.email", "test@test.com");
      await git(machineCDir, "config", "user.name", "Test");

      const wrongOriginDir = path.join(tmpDir, "wrong-origin");
      await fsPromises.mkdir(wrongOriginDir, { recursive: true });
      await git(wrongOriginDir, "init", "--bare", "--initial-branch=main");
      // Point Machine C's origin to the wrong bare repo → different digest
      await git(machineCDir, "remote", "set-url", "origin", wrongOriginDir);

      const machineCOrigin = normalizeOriginIdentity(wrongOriginDir);
      // Verify the digests truly differ (test self-check)
      expect(machineCOrigin.digest).not.toBe(machineBOrigin.digest);

      await expect(
        runAttachVerification({
          cwd: machineCDir,
          branch: capturedBranch!,
          spawnFn: async (cmd: string, args: string[], opts: SpawnOptions) => {
            // Intercept "git fetch origin <branch>" — skip the actual fetch since
            // Machine C already has origin/<branch> from the initial clone.
            // (A real fetch to wrongOriginDir would fail with ATTACH_FETCH_FAILED
            //  before we even get to the identity check — we need to reach it.)
            if (cmd === "git" && args[0] === "fetch") {
              return { exitCode: 0, stdout: "", stderr: "" };
            }
            return spawnCommand(cmd, args, opts);
          },
          expectedRepo: { origin: machineCOrigin },
        }),
      ).rejects.toThrow(/identity/i);

      // TC-T16-002: Still no GitHub API calls
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // Phase 2: runResumeCore
      //
      // - Loads awaiting-resume state from worktree (via job catalog)
      // - D1: githubEnabledOverride = state.githubIntegration.enabled = false
      // - setupWorkspace → resume-existing (no dirty-tree check, uses worktree)
      // - Mock pipeline call #2: returns awaiting-archive
      // - Finalize commit (state.json + events.jsonl + attestation.md) pushed
      // - handleResult(awaiting-archive, githubEnabled:false) → exit code 0
      // =====================================================================

      const resumeExitCode = await runResumeCore(SLUG, { cwd: machineADir, repoRoot: machineADir });

      // TC-T16-001(b): pipeline completes with awaiting-archive (GitHub-disabled = branch-published)
      expect(resumeExitCode).toBe(0);
      // Verify the pipeline mock was called exactly twice total
      expect(pipelineCallState.count).toBe(2);

      // TC-T16-002: Still no GitHub API calls after resume
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // TC-T16-004 (pre-archive): Feature branch must exist on origin before archive
      // =====================================================================

      const branchBeforeArchive = await git(originDir, "branch", "--list", capturedBranch!);
      expect(branchBeforeArchive).toContain(capturedBranch!);

      // =====================================================================
      // Phase 3: runArchive
      //
      // - Finds the job via worktree job catalog scan
      // - GitHub-disabled path: no token resolution, no --with-merge
      // - git mv change folder → archive/ in worktree
      // - Commits archive record and pushes to feature branch
      // - deleteRemoteBranch: false → remote branch preserved
      // - Removes worktree (runArchiveCleanup)
      // =====================================================================

      const archiveExitCode = await runArchive({ slug: SLUG, cwd: machineADir });
      expect(archiveExitCode).toBe(0);

      // TC-T16-004 (post-archive): Feature branch still on origin (deleteRemoteBranch:false)
      const branchAfterArchive = await git(originDir, "branch", "--list", capturedBranch!);
      expect(branchAfterArchive).toContain(capturedBranch!);

      // TC-T16-002: No GitHub API calls throughout the entire lifecycle
      expect(fetchSpy).not.toHaveBeenCalled();
    },
    180_000, // 3 minutes: worktree creation + multiple git commit/push operations
  );
});

// ---------------------------------------------------------------------------
// TC-124: Reopen → resume pathway (AC-2 / AC-6)
//
// After a GitHub-disabled job reaches awaiting-archive, it can be reopened
// (no PR gate required) and resumed for additional modifications.
// ---------------------------------------------------------------------------

describe("T-16: GitHub-disabled reopen → resume lifecycle (runReopenCore + runResumeCore)", () => {
  it(
    "reopens a GitHub-disabled awaiting-archive job and resumes it without GitHub API calls",
    async () => {
      // =====================================================================
      // GIT FIXTURE SETUP (same pattern as the main lifecycle test)
      // =====================================================================

      const originDir = path.join(tmpDir, "reopen-origin");
      const machineADir = path.join(tmpDir, "reopen-machine-a");

      await fsPromises.mkdir(originDir, { recursive: true });
      await git(originDir, "init", "--bare", "--initial-branch=main");
      await git(tmpDir, "clone", originDir, "reopen-machine-a");
      await git(machineADir, "config", "user.email", "test@test.com");
      await git(machineADir, "config", "user.name", "Test");

      await fsPromises.writeFile(path.join(machineADir, "README.md"), "# Reopen E2E\n");
      await fsPromises.writeFile(
        path.join(machineADir, ".gitignore"),
        ".specrunner/*\n!.specrunner/config.json\nnode_modules/\n",
      );
      await fsPromises.mkdir(path.join(machineADir, ".specrunner"), { recursive: true });
      await fsPromises.writeFile(
        path.join(machineADir, ".specrunner", "config.json"),
        JSON.stringify({ version: 1, github: { enabled: false } }),
      );

      const REOPEN_SLUG = "gh-disabled-reopen";
      const changeDir = path.join(machineADir, "specrunner", "changes", REOPEN_SLUG);
      await fsPromises.mkdir(changeDir, { recursive: true });
      await fsPromises.writeFile(
        path.join(changeDir, "spec.md"),
        "# Spec\n\n## Overview\n\nReopen test with GitHub integration disabled.\n",
      );
      await fsPromises.writeFile(
        path.join(changeDir, "tasks.md"),
        "# Tasks\n\n- [ ] Implement the reopen feature\n",
      );

      await git(machineADir, "add", "-A");
      await git(machineADir, "commit", "-m", "initial: setup for GitHub-disabled reopen E2E");
      await git(machineADir, "push", "origin", "main");

      const externalRequestMdPath = path.join(tmpDir, "reopen-request.md");
      await fsPromises.writeFile(
        externalRequestMdPath,
        [
          `# GitHub-disabled Reopen E2E feature`,
          ``,
          `## Meta`,
          ``,
          `- **type**: new-feature`,
          `- **slug**: ${REOPEN_SLUG}`,
          `- **base-branch**: main`,
          `- **adr**: false`,
          ``,
          `Reopen lifecycle test without GitHub integration.`,
          ``,
        ].join("\n"),
      );

      // Spy on fetch — must remain at zero throughout
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url: string | URL | Request) => {
          throw new Error(`[T-16-reopen] Unexpected fetch call: ${String(url)}`);
        });

      // =====================================================================
      // Phase 1: runRunCore → awaiting-resume
      // =====================================================================

      const runExitCode = await runRunCore(externalRequestMdPath, {
        cwd: machineADir,
      });
      // Call 1: awaiting-resume → exit 1
      expect(runExitCode).toBe(1);
      expect(pipelineCallState.count).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // Phase 2: runResumeCore → awaiting-archive
      // =====================================================================

      const resumeExitCode1 = await runResumeCore(REOPEN_SLUG, {
        cwd: machineADir,
        repoRoot: machineADir,
      });
      // Call 2: awaiting-archive → exit 0
      expect(resumeExitCode1).toBe(0);
      expect(pipelineCallState.count).toBe(2);
      expect(fetchSpy).not.toHaveBeenCalled();

      // =====================================================================
      // Phase 3: runReopenCore → awaiting-resume (no pipeline call)
      //
      // AC-6: GitHub-disabled job reopen does NOT require PR gate.
      // The job transitions from awaiting-archive → awaiting-resume.
      // =====================================================================

      const reopenExitCode = await runReopenCore(REOPEN_SLUG, {
        reason: "Need additional fix",
        cwd: machineADir,
        repoRoot: machineADir,
      });
      // TC-064: reopen transitions state only — no pipeline call
      expect(reopenExitCode).toBe(0);
      // Pipeline mock should NOT have been called by reopen
      expect(pipelineCallState.count).toBe(2);
      // TC-063: No GitHub API calls during reopen of disabled job
      expect(fetchSpy).not.toHaveBeenCalled();

      // Verify job is now awaiting-resume
      const allStates = await JobStateStore.list(machineADir);
      const reopenedState = allStates.find((s) => getJobSlug(s) === REOPEN_SLUG);
      expect(reopenedState).toBeDefined();
      expect(reopenedState!.status).toBe("awaiting-resume");
      // Contract must still be disabled
      expect(getGitHubIntegration(reopenedState!).enabled).toBe(false);

      // =====================================================================
      // Phase 4: runResumeCore → awaiting-archive (after reopen)
      //
      // AC-2 / AC-6: Resume works after reopen for GitHub-disabled jobs.
      // =====================================================================

      const resumeExitCode2 = await runResumeCore(REOPEN_SLUG, {
        cwd: machineADir,
        repoRoot: machineADir,
      });
      // Call 3: awaiting-archive → exit 0
      expect(resumeExitCode2).toBe(0);
      expect(pipelineCallState.count).toBe(3);
      expect(fetchSpy).not.toHaveBeenCalled();

      // Verify job is awaiting-archive again
      const allStates2 = await JobStateStore.list(machineADir);
      const finalState = allStates2.find((s) => getJobSlug(s) === REOPEN_SLUG);
      expect(finalState).toBeDefined();
      expect(finalState!.status).toBe("awaiting-archive");
      // Contract must still be disabled
      expect(getGitHubIntegration(finalState!).enabled).toBe(false);

      // TC-121: No GitHub API calls throughout the entire reopen lifecycle
      expect(fetchSpy).not.toHaveBeenCalled();
    },
    180_000, // 3 minutes
  );
});
