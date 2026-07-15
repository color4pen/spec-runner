/**
 * End-to-end integration tests for `job attach --branch` (T-09).
 *
 * Uses real git operations (bare origin + clone) — no GitHub API or auth.
 * Tests the chain: runAttachVerification → WorkspaceMaterializer →
 * liveness sidecar + worktree files.
 *
 * TC-INT-001: status=running checkpoint rejected (no worktree/sidecar created)
 * TC-INT-002: missing request.md in tree rejected (no worktree/sidecar created)
 * TC-INT-003: valid checkpoint → worktree created at feature branch HEAD using verified OID
 * TC-INT-004: sidecar has pid=null, correct jobId and worktreePath
 * TC-INT-005: after attach, resolveJobStateBySlug finds awaiting-resume state
 * TC-INT-006: publish → same OID attach (D1/D5 symmetry) — verify + materialize
 * TC-010:     origin advances after verify → materialize uses pre-advance verified OID
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnCommand } from "../../src/util/spawn.js";
import { runAttachVerification } from "../../src/core/attach/orchestrator.js";
import { WorkspaceMaterializer } from "../../src/core/runtime/workspace-materializer.js";
import type { MaterializerHost } from "../../src/core/runtime/workspace-materializer.js";
import { createWorktreeManager } from "../../src/core/worktree/manager.js";
import { resolveJobStateBySlug } from "../../src/core/resume/resolve-job.js";
import { commitFinalState } from "../../src/core/step/commit-push.js";
import { ERROR_CODES } from "../../src/errors.js";

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

const SLUG = "my-feature";
const JOB_ID = "test-job-id-12345678";
const BRANCH = `feat/${SLUG}-${JOB_ID.slice(0, 8)}`;
const EXPECTED_REPO = { owner: "acme", name: "repo" };

function makeStateJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    jobId: JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test feature",
      type: "new-feature",
      slug: SLUG,
    },
    repository: { owner: EXPECTED_REPO.owner, name: EXPECTED_REPO.name },
    session: null,
    step: "implementer",
    status: "awaiting-resume",
    branch: BRANCH,
    history: [],
    error: null,
    pipelineId: "standard",
    resumePoint: {
      step: "implementer",
      reason: "interrupted",
      iterationsExhausted: 0,
    },
    ...overrides,
  }, null, 2);
}

const EVENTS_JSONL =
  `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\n`;

/**
 * Set up a bare git origin + a source clone with a feature branch checkpoint.
 * Returns paths to { originDir, targetDir }.
 *
 * The source clone creates the feature branch, commits the checkpoint files, and pushes.
 * targetDir is a fresh clone of origin where the attach operation will run.
 */
async function setupGitFixture(
  tmpDir: string,
  stateJsonContent: string = makeStateJson(),
  includeRequestMd: boolean = true,
): Promise<{ originDir: string; targetDir: string }> {
  const originDir = path.join(tmpDir, "origin");
  const sourceDir = path.join(tmpDir, "source");
  const targetDir = path.join(tmpDir, "target");

  // 1. Create bare origin
  await fs.mkdir(originDir, { recursive: true });
  await git(originDir, "init", "--bare", "--initial-branch=main");

  // 2. Clone source (to push the checkpoint branch)
  await git(tmpDir, "clone", originDir, "source");
  await git(sourceDir, "config", "user.email", "test@test.com");
  await git(sourceDir, "config", "user.name", "Test");

  // 3. Create initial commit on main so origin has a HEAD
  await fs.writeFile(path.join(sourceDir, "README.md"), "# Test repo\n");
  await git(sourceDir, "add", "README.md");
  await git(sourceDir, "commit", "-m", "initial");
  await git(sourceDir, "push", "origin", "main");

  // 4. Create feature branch with checkpoint files
  await git(sourceDir, "checkout", "-b", BRANCH);

  const changeDir = path.join(sourceDir, "specrunner", "changes", SLUG);
  await fs.mkdir(changeDir, { recursive: true });

  await fs.writeFile(path.join(changeDir, "state.json"), stateJsonContent, "utf-8");
  await fs.writeFile(path.join(changeDir, "events.jsonl"), EVENTS_JSONL, "utf-8");
  if (includeRequestMd) {
    await fs.writeFile(
      path.join(changeDir, "request.md"),
      `# Test feature request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n`,
      "utf-8",
    );
  }
  // T-03 predicate closure: implementer.reads() requires tasks.md and spec.md
  await fs.writeFile(path.join(changeDir, "tasks.md"), `# Tasks\n\n- [ ] task 1\n`, "utf-8");
  await fs.writeFile(path.join(changeDir, "spec.md"), `# Spec\n\n## Overview\n\nTest spec.\n`, "utf-8");

  await git(sourceDir, "add", "-A");
  await git(sourceDir, "commit", "-m", `feat: checkpoint for ${SLUG}`);
  await git(sourceDir, "push", "origin", BRANCH);

  // 5. Clone target (the "attach machine")
  await git(tmpDir, "clone", originDir, "target");
  await git(targetDir, "config", "user.email", "test@test.com");
  await git(targetDir, "config", "user.name", "Test");

  return { originDir, targetDir };
}

/**
 * Build a minimal MaterializerHost suitable for the integration test.
 * Uses real worktree manager with real git + plan: { kind: "skip" }.
 */
function makeRealHost(cwd: string): MaterializerHost {
  const manager = createWorktreeManager(
    spawnCommand,
    undefined, // real fs.rm
    (ms) => new Promise((r) => setTimeout(r, ms)),
    async () => "bun" as const, // avoid real PM detection (won't run anyway with skip plan)
  );

  return {
    cwd,
    manager,
    spawnFn: spawnCommand,
    resolveSetupPlan: () => ({ kind: "skip" } as const),
    registerWorkspace: () => undefined,
    updateJobState: async () => undefined,
    writeLivenessSidecar: async (slug, jobId, worktreePath, pid) => {
      // Write the sidecar file to the expected location
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "attach-int-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-INT-001: running checkpoint rejected — no worktree/sidecar created
// ---------------------------------------------------------------------------
describe("TC-INT-001: running checkpoint → CHECKPOINT_NOT_ATTACHABLE, no side effects", () => {
  it("rejects a running checkpoint and leaves no worktree or sidecar", async () => {
    const { targetDir } = await setupGitFixture(
      tmpDir,
      makeStateJson({ status: "running" }),
    );

    await expect(
      runAttachVerification({
        cwd: targetDir,
        branch: BRANCH,
        spawnFn: spawnCommand,
        expectedRepo: EXPECTED_REPO,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE });

    // No worktree directory created
    const worktreeDir = path.join(targetDir, ".git", "specrunner-worktrees");
    const worktreeDirExists = await fs.access(worktreeDir).then(() => true).catch(() => false);
    expect(worktreeDirExists).toBe(false);

    // No sidecar created
    const sidecarDir = path.join(targetDir, ".specrunner", "local");
    const sidecarDirExists = await fs.access(sidecarDir).then(() => true).catch(() => false);
    expect(sidecarDirExists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-INT-002: missing request.md → CHECKPOINT_NOT_ATTACHABLE, no side effects
// ---------------------------------------------------------------------------
describe("TC-INT-002: missing request.md → CHECKPOINT_NOT_ATTACHABLE, no side effects", () => {
  it("rejects a checkpoint missing request.md and leaves no worktree or sidecar", async () => {
    const { targetDir } = await setupGitFixture(
      tmpDir,
      makeStateJson(),
      false, // no request.md
    );

    await expect(
      runAttachVerification({
        cwd: targetDir,
        branch: BRANCH,
        spawnFn: spawnCommand,
        expectedRepo: EXPECTED_REPO,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE });

    // No worktree directory created
    const worktreeDir = path.join(targetDir, ".git", "specrunner-worktrees");
    const worktreeDirExists = await fs.access(worktreeDir).then(() => true).catch(() => false);
    expect(worktreeDirExists).toBe(false);

    // No sidecar created
    const sidecarDir = path.join(targetDir, ".specrunner", "local");
    const sidecarDirExists = await fs.access(sidecarDir).then(() => true).catch(() => false);
    expect(sidecarDirExists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-INT-003: valid checkpoint → worktree created at feature branch HEAD
// ---------------------------------------------------------------------------
describe("TC-INT-003: valid checkpoint → worktree at feature branch HEAD with checkpoint files", () => {
  it("creates a worktree containing the checkpoint state.json and events.jsonl", async () => {
    const { targetDir } = await setupGitFixture(tmpDir);

    // Step 1: verify checkpoint
    const verified = await runAttachVerification({
      cwd: targetDir,
      branch: BRANCH,
      spawnFn: spawnCommand,
      expectedRepo: EXPECTED_REPO,
    });

    expect(verified.slug).toBe(SLUG);
    expect(verified.jobId).toBe(JOB_ID);
    expect(verified.branch).toBe(BRANCH);
    expect(verified.state.status).toBe("awaiting-resume");

    // Step 2: materialize worktree using the resolved OID (D1: no TOCTOU re-evaluation)
    const host = makeRealHost(targetDir);
    const materializer = new WorkspaceMaterializer(host);
    const workspace = await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: verified.checkpointOid,
      branchName: BRANCH,
    });

    expect(workspace).toBeDefined();
    expect(workspace.worktreePath).toBeDefined();

    // Verify the worktree exists
    const worktreePath = workspace.worktreePath!;
    const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
    expect(worktreeExists).toBe(true);

    // Verify the worktree contains the checkpoint files
    const stateJsonInWorktree = await fs.readFile(
      path.join(worktreePath, "specrunner", "changes", SLUG, "state.json"),
      "utf-8",
    );
    const parsedState = JSON.parse(stateJsonInWorktree);
    expect(parsedState.jobId).toBe(JOB_ID);
    expect(parsedState.status).toBe("awaiting-resume");

    // Verify events.jsonl is also present
    const eventsInWorktree = await fs.readFile(
      path.join(worktreePath, "specrunner", "changes", SLUG, "events.jsonl"),
      "utf-8",
    );
    expect(eventsInWorktree).toContain("interruption");

    // Clean up worktree (best effort)
    await spawnCommand("git", ["worktree", "remove", "--force", worktreePath], { cwd: targetDir }).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// TC-INT-004: sidecar has pid=null, correct jobId and worktreePath
// ---------------------------------------------------------------------------
describe("TC-INT-004: sidecar has pid=null, correct jobId and worktreePath", () => {
  it("liveness.json has pid=null, correct jobId and worktreePath after attach", async () => {
    const { targetDir } = await setupGitFixture(tmpDir);

    // Verify + materialize
    const verified = await runAttachVerification({
      cwd: targetDir,
      branch: BRANCH,
      spawnFn: spawnCommand,
      expectedRepo: EXPECTED_REPO,
    });

    const host = makeRealHost(targetDir);
    const materializer = new WorkspaceMaterializer(host);
    const workspace = await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: verified.checkpointOid,
      branchName: verified.branch,
    });

    // Verify sidecar
    const sidecarPath = path.join(targetDir, ".specrunner", "local", SLUG, "liveness.json");
    const sidecarExists = await fs.access(sidecarPath).then(() => true).catch(() => false);
    expect(sidecarExists).toBe(true);

    const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf-8"));
    expect(sidecar.pid).toBeNull();
    expect(sidecar.jobId).toBe(JOB_ID);
    expect(sidecar.worktreePath).toBe(workspace.worktreePath!);

    // Clean up worktree
    await spawnCommand("git", ["worktree", "remove", "--force", workspace.worktreePath!], { cwd: targetDir }).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// TC-INT-005: attach → resolveJobStateBySlug finds awaiting-resume
// ---------------------------------------------------------------------------
describe("TC-INT-005: attach → resolveJobStateBySlug finds the attached state", () => {
  it("state is discoverable by slug after attach", async () => {
    const { targetDir } = await setupGitFixture(tmpDir);

    // Verify + materialize
    const verified = await runAttachVerification({
      cwd: targetDir,
      branch: BRANCH,
      spawnFn: spawnCommand,
      expectedRepo: EXPECTED_REPO,
    });

    const host = makeRealHost(targetDir);
    const materializer = new WorkspaceMaterializer(host);
    const workspace = await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: verified.checkpointOid,
      branchName: verified.branch,
    });

    // resolveJobStateBySlug is the exact discovery path `job resume <slug>` uses.
    // JobCatalog.list scans local worktrees (.git/specrunner-worktrees/*) AND the
    // machine-local sidecar supplement — both populated by attach — so the attached
    // awaiting-resume job must be discoverable by slug (acceptance criterion #5).
    const worktreePath5 = workspace.worktreePath!;
    const resolved = await resolveJobStateBySlug(SLUG, targetDir);
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("awaiting-resume");
    expect(resolved!.jobId).toBe(JOB_ID);

    // Sidecar records the worktree path for resume to use
    const sidecarPath = path.join(targetDir, ".specrunner", "local", SLUG, "liveness.json");
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf-8"));
    expect(sidecar.worktreePath).toBe(worktreePath5);
    expect(sidecar.pid).toBeNull();

    // Clean up
    await spawnCommand("git", ["worktree", "remove", "--force", worktreePath5], { cwd: targetDir }).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// TC-INT-006: T-09 publish → OID match — commitFinalState produces the OID that attach verifies
// ---------------------------------------------------------------------------
describe("TC-INT-006: publish → same OID attach (D1/D5 symmetry)", () => {
  it("checkpointOid from runAttachVerification matches the commit OID that commitFinalState pushed", async () => {
    const originDir = path.join(tmpDir, "origin");
    const sourceDir = path.join(tmpDir, "source");
    const targetDir = path.join(tmpDir, "target");

    // 1. Create bare origin
    await fs.mkdir(originDir, { recursive: true });
    await git(originDir, "init", "--bare", "--initial-branch=main");

    // 2. Create source clone (simulates Machine A)
    await git(tmpDir, "clone", originDir, "source");
    await git(sourceDir, "config", "user.email", "test@test.com");
    await git(sourceDir, "config", "user.name", "Test");

    // 3. Initial commit on main so origin has a HEAD
    await fs.writeFile(path.join(sourceDir, "README.md"), "# Test\n");
    await git(sourceDir, "add", "README.md");
    await git(sourceDir, "commit", "-m", "initial");
    await git(sourceDir, "push", "origin", "main");

    // 4. Machine A: create feature branch + checkpoint files (uncommitted, in working tree)
    await git(sourceDir, "checkout", "-b", BRANCH);
    const changeDir = path.join(sourceDir, "specrunner", "changes", SLUG);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "state.json"), makeStateJson(), "utf-8");
    await fs.writeFile(path.join(changeDir, "events.jsonl"), EVENTS_JSONL, "utf-8");
    await fs.writeFile(path.join(changeDir, "request.md"),
      `# Test feature request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n`, "utf-8");
    await fs.writeFile(path.join(changeDir, "tasks.md"), `# Tasks\n\n- [ ] task 1\n`, "utf-8");
    await fs.writeFile(path.join(changeDir, "spec.md"), `# Spec\n\nTest.\n`, "utf-8");

    // 5. Machine A: publish checkpoint via commitFinalState (simulates the D5 publisher seam)
    // This is the single-seam awaiting-resume publish from pipeline.ts after the while loop.
    await commitFinalState({
      cwd: sourceDir,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: spawnCommand,
      messageLabel: "checkpoint",
    });

    // 6. Capture the OID that commitFinalState pushed (HEAD of feature branch in source)
    const sourceOid = (await git(sourceDir, "rev-parse", "HEAD")).trim();
    expect(sourceOid).toMatch(/^[0-9a-f]{40}$/);

    // 7. Machine B: clone origin and run runAttachVerification
    await git(tmpDir, "clone", originDir, "target");
    await git(targetDir, "config", "user.email", "test@test.com");
    await git(targetDir, "config", "user.name", "Test");

    const verified = await runAttachVerification({
      cwd: targetDir,
      branch: BRANCH,
      spawnFn: spawnCommand,
      expectedRepo: EXPECTED_REPO,
    });

    // 8. D1/D5 symmetry: Machine B must verify + materialize the EXACT OID Machine A published
    expect(verified.checkpointOid).toBe(sourceOid);
    expect(verified.slug).toBe(SLUG);
    expect(verified.jobId).toBe(JOB_ID);
    expect(verified.state.status).toBe("awaiting-resume");

    // 9. T-09 acceptance: materialize using the verified OID and confirm worktree HEAD matches
    const host = makeRealHost(targetDir);
    const materializer = new WorkspaceMaterializer(host);
    const workspace = await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: verified.checkpointOid,
      branchName: BRANCH,
    });

    // T-09: "publish された checkpoint の commit OID と materialize した commit OID が一致する"
    const worktreeHead = (await git(workspace.worktreePath!, "rev-parse", "HEAD")).trim();
    expect(worktreeHead).toBe(sourceOid);

    // Clean up worktree
    await spawnCommand("git", ["worktree", "remove", "--force", workspace.worktreePath!], { cwd: targetDir }).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// TC-010: origin advances after verify → materialize still uses verified OID
// ---------------------------------------------------------------------------
describe("TC-010: origin advances after verify — materialize uses pre-advance verified OID", () => {
  it("worktree HEAD is the pre-advance OID even when origin branch moved after runAttachVerification", async () => {
    const originDir = path.join(tmpDir, "origin");
    const sourceDir = path.join(tmpDir, "source");
    const targetDir = path.join(tmpDir, "target");

    // 1. Create bare origin
    await fs.mkdir(originDir, { recursive: true });
    await git(originDir, "init", "--bare", "--initial-branch=main");

    // 2. Create source clone (simulates Machine A)
    await git(tmpDir, "clone", originDir, "source");
    await git(sourceDir, "config", "user.email", "test@test.com");
    await git(sourceDir, "config", "user.name", "Test");

    // 3. Initial commit on main
    await fs.writeFile(path.join(sourceDir, "README.md"), "# Test\n");
    await git(sourceDir, "add", "README.md");
    await git(sourceDir, "commit", "-m", "initial");
    await git(sourceDir, "push", "origin", "main");

    // 4. Machine A: create feature branch + checkpoint files and push
    await git(sourceDir, "checkout", "-b", BRANCH);
    const changeDir = path.join(sourceDir, "specrunner", "changes", SLUG);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "state.json"), makeStateJson(), "utf-8");
    await fs.writeFile(path.join(changeDir, "events.jsonl"), EVENTS_JSONL, "utf-8");
    await fs.writeFile(
      path.join(changeDir, "request.md"),
      `# Test feature request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: ${SLUG}\n`,
      "utf-8",
    );
    await fs.writeFile(path.join(changeDir, "tasks.md"), `# Tasks\n\n- [ ] task 1\n`, "utf-8");
    await fs.writeFile(path.join(changeDir, "spec.md"), `# Spec\n\nTest.\n`, "utf-8");
    await git(sourceDir, "add", "-A");
    await git(sourceDir, "commit", "-m", `feat: checkpoint for ${SLUG}`);
    await git(sourceDir, "push", "origin", BRANCH);

    // 5. Machine B: clone origin and verify — locks in the pre-advance OID
    await git(tmpDir, "clone", originDir, "target");
    await git(targetDir, "config", "user.email", "test@test.com");
    await git(targetDir, "config", "user.name", "Test");

    const verified = await runAttachVerification({
      cwd: targetDir,
      branch: BRANCH,
      spawnFn: spawnCommand,
      expectedRepo: EXPECTED_REPO,
    });
    const preAdvanceOid = verified.checkpointOid;
    expect(preAdvanceOid).toMatch(/^[0-9a-f]{40}$/);

    // 6. Machine A pushes another commit AFTER Machine B already verified
    await fs.writeFile(path.join(changeDir, "extra.md"), "# Extra\n", "utf-8");
    await git(sourceDir, "add", "-A");
    await git(sourceDir, "commit", "-m", "advance: post-verify commit");
    await git(sourceDir, "push", "origin", BRANCH);

    // 6b. Machine B fetches again — origin/BRANCH in targetDir now points to the advanced OID.
    // This opens the TOCTOU window: if materialize re-evaluated origin/BRANCH it would get
    // the wrong (advanced) commit. Since materialize uses verified.checkpointOid instead,
    // the pre-advance OID is used.
    await git(targetDir, "fetch", "origin", BRANCH);
    const advancedOid = (await git(targetDir, "rev-parse", `origin/${BRANCH}`)).trim();
    expect(advancedOid).not.toBe(preAdvanceOid);

    // 7. Machine B: materialize using the verified OID (NOT the re-evaluated symbolic ref)
    const host = makeRealHost(targetDir);
    const materializer = new WorkspaceMaterializer(host);
    const workspace = await materializer.materialize(SLUG, JOB_ID, {
      kind: "attach-from-checkpoint",
      checkpointRef: verified.checkpointOid,
      branchName: BRANCH,
    });

    // TC-010: worktree HEAD is the pre-advance OID, not the advanced one
    const worktreeHeadTc010 = (await git(workspace.worktreePath!, "rev-parse", "HEAD")).trim();
    expect(worktreeHeadTc010).toBe(preAdvanceOid);
    expect(worktreeHeadTc010).not.toBe(advancedOid);

    // Clean up
    await spawnCommand("git", ["worktree", "remove", "--force", workspace.worktreePath!], { cwd: targetDir }).catch(() => undefined);
  });
});
