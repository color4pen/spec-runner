/**
 * E2E tests for halt-checkpoint-restack (T-07).
 *
 * Uses real git repos (bare remote + Machine A clone) in $TMPDIR.
 * No GitHub API calls. No subprocess agents.
 *
 * TC-001: push-rejected → restack commit published on origin/<branch>
 * TC-003: unpublished work commit changes absent from restack commit tree
 * TC-005: Machine B clone → runAttachVerification passes with attachResumePolicy
 * TC-007: events.jsonl in restack commit contains checkpoint-restack record with correct OIDs
 * TC-011: graft → restackedOid is ancestor of local HEAD
 * TC-027: synthesizedCommits contains both restack OID and graft merge OID
 * TC-009 (partial): all-reject path → commitFinalState does not throw
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

import { spawnCommand } from "../src/util/spawn.js";
import type { SpawnFn, SpawnOptions } from "../src/util/spawn.js";
import { commitFinalState } from "../src/core/step/commit-push.js";
import { buildInitialJobState, JobStateStore } from "../src/store/job-state-store.js";
import { runAttachVerification } from "../src/core/attach/orchestrator.js";
import { attachResumePolicy } from "../src/core/attach/checkpoint-policy.js";
import type { CheckpointRestackRecord } from "../src/store/event-journal.js";

// ─────────────────────────────────────────────────────────────────────────────
// Git helpers
// ─────────────────────────────────────────────────────────────────────────────

const GIT_USER_ENV = {
  GIT_AUTHOR_NAME: "E2E Test",
  GIT_AUTHOR_EMAIL: "e2e@halt-checkpoint-restack.local",
  GIT_COMMITTER_NAME: "E2E Test",
  GIT_COMMITTER_EMAIL: "e2e@halt-checkpoint-restack.local",
};

/**
 * Run a git command synchronously with user identity env; throw on non-zero exit.
 * Returns trimmed stdout.
 */
function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_USER_ENV },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (cwd=${cwd}):\n${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

/**
 * SpawnFn wrapper that passes all git commands through to real git EXCEPT
 * `git push -u origin <branch>` (commitFinalState direct pushes), which are
 * rejected with exit 1 to simulate a pre-receive hook blocking workflow files.
 *
 * Restack pushes (`git push origin <oid>:refs/heads/<branch>`) are allowed
 * through so the restack commit can be published.
 */
function makeRejectDirectPushSpawnFn(_repoDir: string): SpawnFn {
  return async (cmd: string, args: string[], opts: SpawnOptions) => {
    // Intercept: git push -u origin <branch> — the commitFinalState direct push
    if (cmd === "git" && args[0] === "push" && args.includes("-u")) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "remote: error: push rejected by pre-receive hook (workflow file changes not allowed)",
      };
    }
    // Pass everything else (including restack pushes) through to real git
    return spawnCommand(cmd, args, opts);
  };
}

/**
 * SpawnFn that rejects ALL push commands (simulates pre-receive rejecting everything).
 */
function makeRejectAllPushesSpawnFn(_repoDir: string): SpawnFn {
  return async (cmd: string, args: string[], opts: SpawnOptions) => {
    if (cmd === "git" && args[0] === "push") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "remote: error: push rejected by pre-receive hook",
      };
    }
    return spawnCommand(cmd, args, opts);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test constants
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "restack-e2e-slug";
const JOB_ID = "e2e00000-0000-0000-0000-000000000001";
const BRANCH = `feat/${SLUG}-e2e00000`;
const EXPECTED_REPO = { owner: "acme", name: "e2e-test-repo" };

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "halt-restack-e2e-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-001 / TC-003 / TC-007 / TC-011 / TC-027 + TC-005 (Machine B)
// ─────────────────────────────────────────────────────────────────────────────

describe(
  "TC-001 / TC-003 / TC-007 / TC-011 / TC-027 / TC-005: halt checkpoint restack E2E happy path",
  () => {
    it(
      "pushes restacked checkpoint to origin when direct push is rejected",
      async () => {
        // =======================================================================
        // ── 1. Git fixture: bare remote + Machine A clone ──────────────────────
        // =======================================================================

        const bareDir = path.join(tempDir, "origin.git");
        const repoDir = path.join(tempDir, "machine-a");
        const machineBDir = path.join(tempDir, "machine-b");

        await fs.mkdir(bareDir, { recursive: true });
        await fs.mkdir(repoDir, { recursive: true });

        gitSync(["init", "--bare", "--initial-branch=main"], bareDir);
        gitSync(["init", "--initial-branch=main"], repoDir);
        gitSync(["config", "user.email", "e2e@halt-checkpoint-restack.local"], repoDir);
        gitSync(["config", "user.name", "E2E Test"], repoDir);
        gitSync(["remote", "add", "origin", bareDir], repoDir);

        // Initial commit on main
        await fs.writeFile(path.join(repoDir, "README.md"), "# E2E test\n");
        gitSync(["add", "README.md"], repoDir);
        gitSync(["commit", "-m", "initial: test repo"], repoDir);
        gitSync(["push", "origin", "HEAD:main"], repoDir);

        // Create feature branch
        gitSync(["checkout", "-b", BRANCH], repoDir);

        // =======================================================================
        // ── 2. Publish initial checkpoint (awaiting-resume) to origin ──────────
        // =======================================================================

        // 2a. Write change folder files required by attachResumePolicy + implementer reads()
        const changeDir = path.join(repoDir, "specrunner", "changes", SLUG);
        await fs.mkdir(changeDir, { recursive: true });

        await fs.writeFile(
          path.join(changeDir, "request.md"),
          [
            `# E2E Restack Test`,
            ``,
            `## Meta`,
            ``,
            `- **type**: new-feature`,
            `- **slug**: ${SLUG}`,
            `- **base-branch**: main`,
            `- **adr**: false`,
            ``,
            `Test request for halt-checkpoint-restack E2E.`,
          ].join("\n"),
        );
        await fs.writeFile(
          path.join(changeDir, "spec.md"),
          "# Spec\n\n## Overview\n\nTest spec.\n",
        );
        await fs.writeFile(
          path.join(changeDir, "tasks.md"),
          "# Tasks\n\n- [ ] Implement the feature\n",
        );

        // 2b. Build valid state.json + events.jsonl via real JobStateStore
        const store = new JobStateStore(JOB_ID, repoDir, { slug: SLUG, stateRoot: repoDir });

        const baseState = {
          ...buildInitialJobState({
            request: {
              path: `specrunner/changes/${SLUG}/request.md`,
              title: "E2E Restack Test",
              type: "new-feature" as const,
              slug: SLUG,
            },
            repository: EXPECTED_REPO,
          }),
          jobId: JOB_ID,
          branch: BRANCH,
        };

        // Persist initial state (creates state.json + events.jsonl with correct _journal counters)
        await store.persist(baseState);

        // Update to running implementer (adds history entry)
        const runningState = await store.update(baseState, {
          status: "running",
          step: "implementer",
        });

        // Update to awaiting-resume (checkpoint halt)
        const awaitingState = await store.update(runningState, {
          status: "awaiting-resume",
          step: "implementer",
          resumePoint: { step: "implementer", reason: "timeout", iterationsExhausted: 1 },
        });

        // 2c. Stage change folder + commit + push (creates "published tip")
        gitSync(
          ["add", "--", path.join("specrunner", "changes", SLUG)],
          repoDir,
        );
        gitSync(["commit", "-m", `checkpoint: ${SLUG}`], repoDir);
        const publishedTipOid = gitSync(["rev-parse", "HEAD"], repoDir);
        gitSync(["push", "origin", BRANCH], repoDir);

        // =======================================================================
        // ── 3. Create local work commits (simulate implementer step output) ─────
        // =======================================================================

        // These commits touch .github/workflows/ — the pre-receive hook rejects them
        await fs.mkdir(path.join(repoDir, ".github", "workflows"), { recursive: true });
        await fs.writeFile(
          path.join(repoDir, ".github", "workflows", "ci.yml"),
          "# CI\nname: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n",
        );
        await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
        await fs.writeFile(
          path.join(repoDir, "src", "impl.ts"),
          "// Implementation created by the implementer step\nexport function impl(): void {}\n",
        );
        gitSync(["add", ".github", "src"], repoDir);
        gitSync(["commit", "-m", "feat: add workflow and implementation"], repoDir);
        const workCommitOid = gitSync(["rev-parse", "HEAD"], repoDir);

        // =======================================================================
        // ── 4. Update state.json + events.jsonl to simulate second halt ─────────
        // =======================================================================
        // This makes state.json + events.jsonl dirty relative to git index,
        // so commitFinalState will find staged changes and create a checkpoint commit.

        const state2 = await store.update(awaitingState, {
          status: "awaiting-resume",
          step: "implementer",
          resumePoint: { step: "implementer", reason: "timeout", iterationsExhausted: 1 },
        });
        // Note: store.update always updates updatedAt, making state.json dirty.

        // =======================================================================
        // ── 5. Call commitFinalState with push-intercepting spawnFn ─────────────
        // =======================================================================

        // Track callbacks
        const persistedOids: string[] = [];
        const restackRecords: CheckpointRestackRecord[] = [];

        const spawnFn = makeRejectDirectPushSpawnFn(repoDir);

        await commitFinalState({
          cwd: repoDir,
          branch: BRANCH,
          slug: SLUG,
          spawnFn,
          messageLabel: "checkpoint",
          // Work commit OID is "known" to the pipeline (would normally be in synthesizedCommits
          // after commitAndPush adds it). Required for egress check to pass.
          synthesizedCommits: [workCommitOid],
          persistBeforePush: async (oid: string) => {
            persistedOids.push(oid);
          },
          recordRestack: async (record: CheckpointRestackRecord) => {
            restackRecords.push(record);
            // Also write to the real journal so hash-object picks it up
            const s = new JobStateStore(JOB_ID, repoDir, { slug: SLUG, stateRoot: repoDir });
            await s.appendCheckpointRestack(record);
          },
        });

        // =======================================================================
        // ── 6. Assert: origin/<branch> tip is the restack commit ─────────────
        // =======================================================================

        // TC-001: restack commit was published to origin
        const newOriginTip = gitSync(
          ["rev-parse", `refs/remotes/origin/${BRANCH}`],
          repoDir,
        );
        expect(
          newOriginTip,
          "origin/<branch> should have advanced beyond the published tip",
        ).not.toBe(publishedTipOid);

        // TC-001: the restack commit's parent is the original published tip
        const restackedParent = gitSync(
          ["rev-parse", `${newOriginTip}^`],
          repoDir,
        );
        expect(restackedParent).toBe(publishedTipOid);

        // Record the restack OID for subsequent assertions
        const restackedOid = newOriginTip;

        // TC-003: git diff --name-only <parent> <restacked> shows only change folder paths
        const diffOutput = gitSync(
          ["diff", "--name-only", publishedTipOid, restackedOid],
          repoDir,
        );
        const diffPaths = diffOutput.split("\n").map((s) => s.trim()).filter(Boolean);
        const changeFolder = `specrunner/changes/${SLUG}/`;
        for (const p of diffPaths) {
          expect(
            p.startsWith(changeFolder),
            `Path '${p}' outside change folder should not appear in restack commit diff`,
          ).toBe(true);
        }

        // TC-003: work commit's .github/workflows/ci.yml is NOT in origin/<branch> history
        const originHistory = gitSync(
          ["rev-list", newOriginTip],
          repoDir,
        );
        expect(
          originHistory.split("\n").map((s) => s.trim()).filter(Boolean),
          "work commit should not appear in origin/<branch> history",
        ).not.toContain(workCommitOid);

        // TC-007: events.jsonl in restack commit contains checkpoint-restack record
        const eventsInRestack = gitSync(
          ["show", `${restackedOid}:specrunner/changes/${SLUG}/events.jsonl`],
          repoDir,
        );
        const restackRecordInJournal = eventsInRestack
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try { return JSON.parse(line); } catch { return null; }
          })
          .filter((r) => r !== null && r.type === "checkpoint-restack");

        expect(
          restackRecordInJournal.length,
          "events.jsonl in restack commit should contain exactly one checkpoint-restack record",
        ).toBeGreaterThanOrEqual(1);

        const journalRecord = restackRecordInJournal[0];
        expect(journalRecord.parentOid).toBe(publishedTipOid);
        expect(journalRecord.slug).toBe(SLUG);
        expect(journalRecord.branch).toBe(BRANCH);
        expect(journalRecord.unpublishedCommits).toContain(workCommitOid);

        // TC-011: graft — restackedOid is ancestor of local HEAD
        const mergeBaseResult = spawnSync(
          "git",
          ["merge-base", "--is-ancestor", restackedOid, "HEAD"],
          { cwd: repoDir, env: { ...process.env, ...GIT_USER_ENV } },
        );
        expect(
          mergeBaseResult.status,
          "restackedOid should be an ancestor of local HEAD after graft",
        ).toBe(0);

        // TC-027: synthesizedCommits in persistedOids contains restack OID + graft merge OID
        // persistBeforePush was called with: the checkpoint commit OID, then restack OID, then graft merge OID
        expect(persistedOids.length).toBeGreaterThanOrEqual(2);
        expect(persistedOids).toContain(restackedOid);

        // TC-027: local HEAD (graft merge commit) must be unconditionally in persistedOids
        const localTip = gitSync(["rev-parse", "HEAD"], repoDir);
        expect(
          persistedOids,
          "graft merge commit (local HEAD) should be recorded in synthesizedCommits",
        ).toContain(localTip);

        // TC-007: the recordRestack callback was invoked with a record containing the correct OIDs
        expect(restackRecords.length).toBeGreaterThanOrEqual(1);
        const capturedRecord = restackRecords[0]!;
        expect(capturedRecord.type).toBe("checkpoint-restack");
        expect(capturedRecord.parentOid).toBe(publishedTipOid);
        expect(capturedRecord.slug).toBe(SLUG);
        expect(capturedRecord.branch).toBe(BRANCH);
        expect(capturedRecord.unpublishedCommits).toContain(workCommitOid);

        // =======================================================================
        // ── 7. Machine B: runAttachVerification passes (TC-005) ─────────────────
        // =======================================================================
        // Clone from bare remote to simulate a clean environment
        gitSync(["clone", bareDir, machineBDir], tempDir);
        gitSync(["config", "user.email", "machine-b@e2e.local"], machineBDir);
        gitSync(["config", "user.name", "Machine B"], machineBDir);

        const machineBSpawnFn: SpawnFn = (cmd, args, opts) =>
          spawnCommand(cmd, args, opts);

        const verifiedCheckpoint = await runAttachVerification({
          cwd: machineBDir,
          branch: BRANCH,
          spawnFn: machineBSpawnFn,
          expectedRepo: EXPECTED_REPO,
          policy: attachResumePolicy,
        });

        expect(verifiedCheckpoint.state.status).toBe("awaiting-resume");
        // AC-2: resume must restart from the halted step — assert the resolved resume step explicitly
        expect(verifiedCheckpoint.state.resumePoint?.step).toBe("implementer");
        expect(verifiedCheckpoint.checkpointOid).toBe(restackedOid);
        expect(verifiedCheckpoint.slug).toBe(SLUG);
        expect(verifiedCheckpoint.branch).toBe(BRANCH);
        expect(verifiedCheckpoint.jobId).toBe(JOB_ID);

        // State should NOT contain the work commit's .github/workflows/ changes
        // (confirmed by TC-003 diff assertion above — the restack commit only has change folder)

        // TC-027 final: confirm synthesizedCommits contains restack OID
        // We've already asserted persistedOids.contains(restackedOid) above.
        // In real LocalRuntime, persistedOids are added to state.synthesizedCommits.
        // Here we just confirm the callback was called with the right OID.
        expect(persistedOids).toContain(restackedOid);

        // =======================================================================
        // ── 8. State validity: assert state2 was not corrupted by restack ───────
        // =======================================================================
        // The local branch state.json should still be valid (restack does not modify it)
        const localStateJson = await fs.readFile(
          path.join(repoDir, "specrunner", "changes", SLUG, "state.json"),
          "utf-8",
        );
        const localState = JSON.parse(localStateJson) as { status: string; jobId: string };
        expect(localState.status).toBe("awaiting-resume");
        expect(localState.jobId).toBe(JOB_ID);
        void state2; // suppress unused warning
      },
      60000,
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// TC-009 partial: all pushes rejected → commitFinalState does not throw
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-009: all-reject path — commitFinalState never throws", () => {
  it(
    "commitFinalState resolves without throwing when all pushes (direct + restack) are rejected",
    async () => {
      // Minimal git fixture
      const bareDir = path.join(tempDir, "origin-all-reject.git");
      const repoDir = path.join(tempDir, "repo-all-reject");

      await fs.mkdir(bareDir, { recursive: true });
      await fs.mkdir(repoDir, { recursive: true });

      gitSync(["init", "--bare", "--initial-branch=main"], bareDir);
      gitSync(["init", "--initial-branch=main"], repoDir);
      gitSync(["config", "user.email", "e2e@halt-checkpoint-restack.local"], repoDir);
      gitSync(["config", "user.name", "E2E Test"], repoDir);
      gitSync(["remote", "add", "origin", bareDir], repoDir);

      await fs.writeFile(path.join(repoDir, "README.md"), "# All-reject test\n");
      gitSync(["add", "README.md"], repoDir);
      gitSync(["commit", "-m", "initial"], repoDir);
      gitSync(["push", "origin", "HEAD:main"], repoDir);
      gitSync(["checkout", "-b", BRANCH], repoDir);

      // Create change folder with required files
      const changeDir = path.join(repoDir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, "request.md"), `# Request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n- **base-branch**: main\n- **adr**: false\n\nTest.\n`);
      await fs.writeFile(path.join(changeDir, "spec.md"), "# Spec\n\n## Overview\nTest spec.\n");
      await fs.writeFile(path.join(changeDir, "tasks.md"), "# Tasks\n\n- [ ] Do something\n");

      const store = new JobStateStore(JOB_ID, repoDir, { slug: SLUG, stateRoot: repoDir });
      const baseState = {
        ...buildInitialJobState({
          request: {
            path: `specrunner/changes/${SLUG}/request.md`,
            title: "All-reject Test",
            type: "new-feature" as const,
            slug: SLUG,
          },
          repository: EXPECTED_REPO,
        }),
        jobId: JOB_ID,
        branch: BRANCH,
      };
      await store.persist(baseState);
      const runningState = await store.update(baseState, { status: "running", step: "implementer" });
      const awaitingState = await store.update(runningState, {
        status: "awaiting-resume",
        step: "implementer",
        resumePoint: { step: "implementer", reason: "timeout", iterationsExhausted: 1 },
      });

      // Commit + push initial checkpoint
      gitSync(["add", "--", path.join("specrunner", "changes", SLUG)], repoDir);
      gitSync(["commit", "-m", `checkpoint: ${SLUG}`], repoDir);
      const publishedTipOid = gitSync(["rev-parse", "HEAD"], repoDir);
      gitSync(["push", "origin", BRANCH], repoDir);

      // Local work commit
      await fs.mkdir(path.join(repoDir, ".github", "workflows"), { recursive: true });
      await fs.writeFile(path.join(repoDir, ".github", "workflows", "ci.yml"), "# CI\n");
      gitSync(["add", ".github"], repoDir);
      gitSync(["commit", "-m", "feat: workflow"], repoDir);
      const workCommitOid = gitSync(["rev-parse", "HEAD"], repoDir);

      // Make state dirty
      await store.update(awaitingState, {
        status: "awaiting-resume",
        step: "implementer",
        resumePoint: { step: "implementer", reason: "timeout", iterationsExhausted: 1 },
      });

      // Use all-reject spawnFn
      const spawnFn = makeRejectAllPushesSpawnFn(repoDir);

      // TC-009: commitFinalState must NOT throw even when all pushes fail
      await expect(
        commitFinalState({
          cwd: repoDir,
          branch: BRANCH,
          slug: SLUG,
          spawnFn,
          messageLabel: "checkpoint",
          synthesizedCommits: [workCommitOid],
        }),
      ).resolves.toBeUndefined();

      // origin/<branch> should still be at publishedTipOid (no push succeeded)
      const originTip = gitSync(["rev-parse", `refs/remotes/origin/${BRANCH}`], repoDir);
      expect(originTip).toBe(publishedTipOid);

      // Local branch tip is the checkpoint commit + (possibly) graft merge commit
      // The local tip should NOT be the same as publishedTipOid
      const localTip = gitSync(["rev-parse", "HEAD"], repoDir);
      expect(localTip).not.toBe(publishedTipOid);
    },
    60000,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-038: 別 runner 先行時に remote state を上書きしない（E2E）
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-038: remote divergence (runner B先行) → restack skips without overwriting remote", () => {
  it(
    "restack skips with remote-diverged when origin/<branch> has been advanced by another runner",
    async () => {
      // =======================================================================
      // ── 1. Git fixture: bare remote + Runner A clone + Runner B clone ───────
      // =======================================================================

      const bareDir = path.join(tempDir, "origin-tc038.git");
      const runnerADir = path.join(tempDir, "runner-a");
      const runnerBDir = path.join(tempDir, "runner-b");

      await fs.mkdir(bareDir, { recursive: true });
      await fs.mkdir(runnerADir, { recursive: true });
      await fs.mkdir(runnerBDir, { recursive: true });

      gitSync(["init", "--bare", "--initial-branch=main"], bareDir);

      // Initialize runner A
      gitSync(["init", "--initial-branch=main"], runnerADir);
      gitSync(["config", "user.email", "runner-a@e2e.local"], runnerADir);
      gitSync(["config", "user.name", "Runner A"], runnerADir);
      gitSync(["remote", "add", "origin", bareDir], runnerADir);

      // Initial commit on main
      await fs.writeFile(path.join(runnerADir, "README.md"), "# TC-038\n");
      gitSync(["add", "README.md"], runnerADir);
      gitSync(["commit", "-m", "initial"], runnerADir);
      gitSync(["push", "origin", "HEAD:main"], runnerADir);

      // Create feature branch on runner A
      gitSync(["checkout", "-b", BRANCH], runnerADir);

      // =======================================================================
      // ── 2. Runner A: publish initial checkpoint ──────────────────────────────
      // =======================================================================

      const changeDir = path.join(runnerADir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      await fs.writeFile(
        path.join(changeDir, "request.md"),
        `# TC-038 Test\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n- **base-branch**: main\n- **adr**: false\n\nTest.\n`,
      );
      await fs.writeFile(path.join(changeDir, "spec.md"), "# Spec\n\nTest spec.\n");
      await fs.writeFile(path.join(changeDir, "tasks.md"), "# Tasks\n\n- [ ] Do something\n");

      const storeA = new JobStateStore(JOB_ID, runnerADir, { slug: SLUG, stateRoot: runnerADir });
      const baseStateA = {
        ...buildInitialJobState({
          request: { path: `specrunner/changes/${SLUG}/request.md`, title: "TC-038", type: "new-feature" as const, slug: SLUG },
          repository: EXPECTED_REPO,
        }),
        jobId: JOB_ID,
        branch: BRANCH,
      };
      await storeA.persist(baseStateA);
      const runningA = await storeA.update(baseStateA, { status: "running", step: "implementer" });
      await storeA.update(runningA, {
        status: "awaiting-resume",
        step: "implementer",
        resumePoint: { step: "implementer", reason: "timeout", iterationsExhausted: 1 },
      });

      gitSync(["add", "--", path.join("specrunner", "changes", SLUG)], runnerADir);
      gitSync(["commit", "-m", `checkpoint: ${SLUG}`], runnerADir);
      const initialTipA = gitSync(["rev-parse", "HEAD"], runnerADir);
      gitSync(["push", "origin", BRANCH], runnerADir);

      // =======================================================================
      // ── 3. Runner B: clone and advance origin/<branch> to R1 ─────────────
      // =======================================================================

      gitSync(["clone", bareDir, runnerBDir], tempDir);
      gitSync(["config", "user.email", "runner-b@e2e.local"], runnerBDir);
      gitSync(["config", "user.name", "Runner B"], runnerBDir);
      gitSync(["checkout", "-b", BRANCH, `origin/${BRANCH}`], runnerBDir);

      // Runner B advances change folder (simulates next step completion)
      const changeDirB = path.join(runnerBDir, "specrunner", "changes", SLUG);
      await fs.writeFile(
        path.join(changeDirB, "design.md"),
        "# Design\n\nRunner B designed this.\n",
      );
      gitSync(["add", "--", path.join("specrunner", "changes", SLUG)], runnerBDir);
      gitSync(["commit", "-m", `design: ${SLUG}`], runnerBDir);
      const r1Oid = gitSync(["rev-parse", "HEAD"], runnerBDir);
      gitSync(["push", "origin", BRANCH], runnerBDir);

      // Verify R1 is now the remote tip
      const remoteTipAfterB = gitSync(["rev-parse", `refs/remotes/origin/${BRANCH}`], runnerADir.replace("/runner-a", "/runner-a") ?? runnerADir);
      // Actually fetch on runner A to see the new remote tip
      gitSync(["fetch", "origin"], runnerADir);
      const remoteTipA = gitSync(["rev-parse", `refs/remotes/origin/${BRANCH}`], runnerADir);
      expect(remoteTipA).toBe(r1Oid);

      // =======================================================================
      // ── 4. Runner A: add work commit on old local tip ────────────────────
      // =======================================================================
      // Runner A's local HEAD is still at initialTipA, which is NOT an ancestor of R1.
      // (R1 is a child of initialTipA from Runner B's perspective, but Runner A's local
      // branch hasn't been updated.)
      // Wait - R1 IS a child of initialTipA. Let me reconsider...
      //
      // Actually the scenario is: runner A is at initialTipA, runner B pushed R1 on top.
      // R1's parent IS initialTipA, so R1 is a descendant of initialTipA.
      // merge-base --is-ancestor <R1> <initialTipA> → exit 1 (R1 is NOT an ancestor of initialTipA)
      //
      // But the check is: merge-base --is-ancestor <parentOid=remoteTip=R1> <localTipOid=initialTipA>
      // → is R1 an ancestor of initialTipA? No! → exit 1 → remote-diverged ✓
      //
      // So as long as runner A's local branch is still at initialTipA (behind R1),
      // the divergence check correctly fires.

      // Make state dirty on runner A (so there's something to commit)
      const runningA2 = await storeA.update(runningA, { status: "running", step: "spec-review" });
      await storeA.update(runningA2, {
        status: "awaiting-resume",
        step: "spec-review",
        resumePoint: { step: "spec-review", reason: "timeout", iterationsExhausted: 1 },
      });

      // =======================================================================
      // ── 5. Runner A: commitFinalState with all-reject spawnFn ──────────────
      // =======================================================================
      // We use makeRejectAllPushesSpawnFn so the direct push fails,
      // then restack fires and should detect divergence (R1 is not ancestor of initialTipA)
      // and return remote-diverged.

      const spawnFn = makeRejectAllPushesSpawnFn(runnerADir);

      // Capture restack records to verify none were written
      const restackRecords: CheckpointRestackRecord[] = [];

      await commitFinalState({
        cwd: runnerADir,
        branch: BRANCH,
        slug: SLUG,
        spawnFn,
        messageLabel: "checkpoint",
        synthesizedCommits: [initialTipA],
        recordRestack: async (record: CheckpointRestackRecord) => {
          restackRecords.push(record);
        },
      });

      // TC-038: origin/<branch> tip must still be R1 (runner B's commit unchanged)
      // Fetch to see latest remote state
      gitSync(["fetch", "origin"], runnerADir);
      const finalRemoteTip = gitSync(["rev-parse", `refs/remotes/origin/${BRANCH}`], runnerADir);
      expect(
        finalRemoteTip,
        "origin/<branch> should still be R1 after remote-diverged skip",
      ).toBe(r1Oid);

      // TC-038: recordRestack must NOT have been called (remote-diverged fires before journaling)
      expect(
        restackRecords.length,
        "No checkpoint-restack record should have been appended when remote-diverged",
      ).toBe(0);

      // TC-038: runner A's change folder at R1 must be unchanged
      const r1Tree = gitSync(["show", `${r1Oid}:specrunner/changes/${SLUG}/design.md`], runnerADir);
      expect(r1Tree).toContain("Runner B designed this");

      void remoteTipAfterB; // suppress unused warning
      void r1Oid;
    },
    60000,
  );
});
