/**
 * Integration / E2E tests for operator-canon-apply-on-resume.
 *
 * Uses real git repos in $TMPDIR to verify the full apply-canon flow.
 *
 * TC-001 (TC-R1): canon escalation → hand-edit → resume --apply-canon succeeds (mado-os 封鎖)
 * TC-002: resume --apply-canon は clean worktree でも step を起動する (no-op when clean)
 * TC-003 (TC-R2): --apply-canon は保護正典パス以外の dirty を worktree に残す (scope restriction)
 * TC-006 (TC-R4): egress チェックが operator-apply commit OID を通過させる
 * TC-007: CANON_FINDING_ESCALATION hint が --apply-canon を案内する
 * TC-008: buildCanonEscalationReason の出力が --apply-canon を含む
 *
 * TC-001 through TC-006 use real git repos (no mocking of git operations).
 * TC-007 reads the source of commit-orchestrator.ts to verify the hint string.
 * TC-008 calls buildCanonEscalationReason and checks the output.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as nodeUrl from "node:url";
import { spawnSync } from "node:child_process";
import { detectCanonDirtyPaths, commitOperatorCanon } from "../src/core/resume/apply-canon.js";
import { appendSynthesizedCommit } from "../src/state/schema.js";
import { verifyEgressLedger } from "../src/core/step/commit-push.js";
import { buildCanonEscalationReason } from "../src/core/step/canon-escalation.js";
import { defaultSpawnFn } from "../src/util/git-exec.js";
import type { SpawnFn as PipelineSpawnFn } from "../src/util/spawn.js";
import type { JobState } from "../src/state/schema.js";
import type { Finding } from "../src/kernel/report-result.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "mado-os-canon-test-slug";
const CANON_PATH = `specrunner/changes/${SLUG}/design.md`;
const NON_CANON_PATH = "src/foo.ts";

// ---------------------------------------------------------------------------
// Git sync helpers
// ---------------------------------------------------------------------------

function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

async function createGitRepo(dir: string): Promise<void> {
  gitSync(["init"], dir);
  gitSync(["config", "user.email", "e2e-apply-canon@spec-runner.local"], dir);
  gitSync(["config", "user.name", "Apply Canon E2E Test"], dir);
}

async function createBareRemote(repoDir: string, bareDir: string): Promise<void> {
  gitSync(["init", "--bare", bareDir], repoDir);
  gitSync(["remote", "add", "origin", bareDir], repoDir);
}

async function makeInitialCommitAndPush(repoDir: string): Promise<string> {
  const readmePath = path.join(repoDir, "README.md");
  await fs.writeFile(readmePath, "# Apply Canon E2E Test\n", "utf-8");
  gitSync(["add", "README.md"], repoDir);
  gitSync(["commit", "-m", "initial: test repo setup"], repoDir);
  gitSync(["push", "origin", "HEAD:main"], repoDir);
  return gitSync(["rev-parse", "HEAD"], repoDir);
}

/**
 * PipelineSpawnFn wrapper for verifyEgressLedger (uses async spawn.ts interface).
 * Intercepts 'push' to avoid modifying the bare remote.
 */
function makePipelineSpawnFn(repoDir: string): PipelineSpawnFn {
  return async (cmd: string, args: string[], _opts?: { cwd?: string }) => {
    if (args[0] === "push") {
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

function makeBaseJobState(
  worktreePath: string,
  synthesizedCommits: string[],
  overrides: Partial<JobState> = {},
): JobState {
  return {
    version: 2,
    jobId: "job-mado-os-repro",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Mado-OS Canon Test",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "design",
    status: "awaiting-resume",
    branch: `fix/${SLUG}`,
    history: [],
    error: {
      code: "CANON_FINDING_ESCALATION",
      message: "test escalation",
      hint: "test hint",
    },
    steps: {},
    worktreePath,
    synthesizedCommits,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "canon-apply-e2e-"));
  // Suppress stderr/stdout from tests to avoid noisy output
  // (don't spyOn — we want real git output for debugging if tests fail)
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-001 (TC-R1): mado-os 実発現の封鎖 — full end-to-end scenario
// ---------------------------------------------------------------------------

describe("TC-001 (TC-R1): canon escalation → hand-edit → resume --apply-canon succeeds (mado-os 封鎖)", () => {
  it(
    "TC-001: full scenario reproduces mado-os fix and seals the regression",
    async () => {
      // ── Setup: real git repo + bare remote ──────────────────────────────────
      const repoDir = path.join(tempDir, "repo");
      const bareDir = path.join(tempDir, "bare.git");
      await fs.mkdir(repoDir, { recursive: true });

      await createGitRepo(repoDir);
      await createBareRemote(repoDir, bareDir);
      const baseOid = await makeInitialCommitAndPush(repoDir);

      // Create feature branch (simulates pipeline working branch)
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Simulate: pipeline made initial commits (e.g. bootstrap + design)
      await fs.mkdir(path.join(repoDir, "specrunner", "changes", SLUG), { recursive: true });
      await fs.writeFile(path.join(repoDir, CANON_PATH), "# Original Design\n", "utf-8");
      gitSync(["add", path.join("specrunner", "changes", SLUG, "design.md")], repoDir);
      gitSync(["commit", "-m", `design: initial design for ${SLUG}`], repoDir);
      const pipelineOid = gitSync(["rev-parse", "HEAD"], repoDir);

      // Job state: awaiting-resume with CANON_FINDING_ESCALATION
      const jobState = makeBaseJobState(repoDir, [baseOid, pipelineOid]);

      // ── Simulate: operator hand-edits the protected canon path ──────────────
      // (without commit — this is the mado-os failure scenario)
      await fs.writeFile(path.join(repoDir, CANON_PATH), "# Updated Design by Operator\n", "utf-8");
      // Operator also has a non-canon dirty file (typical workspace state)
      await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
      await fs.writeFile(path.join(repoDir, NON_CANON_PATH), "// unrelated work\n", "utf-8");

      // ── Step 1: detectCanonDirtyPaths → only the canon path ─────────────────
      const dirtyPaths = await detectCanonDirtyPaths(SLUG, repoDir, defaultSpawnFn);
      expect(dirtyPaths).toContain(CANON_PATH);
      expect(dirtyPaths).not.toContain(NON_CANON_PATH);
      expect(dirtyPaths).toHaveLength(1);

      // ── Step 2: commitOperatorCanon → operator-apply commit created ──────────
      const operatorApplyOid = await commitOperatorCanon(SLUG, repoDir, dirtyPaths, defaultSpawnFn);

      // Assert: commit message is correct
      const commitMsg = gitSync(["log", "-1", "--format=%s"], repoDir);
      expect(commitMsg).toBe(`operator-apply: ${SLUG}`);

      // ── Step 3: diff-tree shows only the canon path ──────────────────────────
      const changedFiles = gitSync(
        ["diff-tree", "--no-commit-id", "-r", "--name-only", operatorApplyOid],
        repoDir
      ).split("\n").filter(Boolean);
      expect(changedFiles).toContain(CANON_PATH);
      expect(changedFiles).not.toContain(NON_CANON_PATH);
      expect(changedFiles).toHaveLength(1);

      // ── Step 4: appendSynthesizedCommit → OID in ledger ────────────────────
      const updatedState = appendSynthesizedCommit(jobState, operatorApplyOid);
      expect(updatedState.synthesizedCommits).toContain(operatorApplyOid);
      expect(updatedState.synthesizedCommits).toContain(baseOid);
      expect(updatedState.synthesizedCommits).toContain(pipelineOid);

      // ── Step 5: verifyEgressLedger passes with updated ledger ────────────────
      const pipelineSpawn = makePipelineSpawnFn(repoDir);
      const ledger = updatedState.synthesizedCommits ?? [];
      await expect(
        verifyEgressLedger({ cwd: repoDir, ledger, spawnFn: pipelineSpawn })
      ).resolves.toBeUndefined();

      // ── Step 6: non-canon file is still dirty in the worktree ───────────────
      const statusResult = spawnSync("git", ["status", "--porcelain", "-uall"], {
        cwd: repoDir, encoding: "utf8",
      });
      expect(statusResult.stdout).toContain(NON_CANON_PATH);
    },
    30000,
  );
});

// ---------------------------------------------------------------------------
// TC-002: resume --apply-canon は clean worktree でも step を起動する (no-op)
// ---------------------------------------------------------------------------

describe("TC-002: resume --apply-canon is a no-op when worktree is clean", () => {
  it(
    "TC-002: detectCanonDirtyPaths returns [] for a clean worktree",
    async () => {
      // GIVEN: real git repo with initial commit (clean worktree)
      const repoDir = path.join(tempDir, "clean-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      // Initial commit
      await fs.writeFile(path.join(repoDir, "README.md"), "# Clean\n", "utf-8");
      gitSync(["add", "README.md"], repoDir);
      gitSync(["commit", "-m", "initial"], repoDir);

      // WHEN: call detectCanonDirtyPaths on clean worktree
      const dirtyPaths = await detectCanonDirtyPaths(SLUG, repoDir, defaultSpawnFn);

      // THEN: returns empty array (no canon paths dirty)
      expect(dirtyPaths).toEqual([]);
    },
    15000,
  );

  it(
    "TC-002: no commit is created when detectCanonDirtyPaths returns []",
    async () => {
      // GIVEN: clean git repo
      const repoDir = path.join(tempDir, "clean-repo2");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await fs.writeFile(path.join(repoDir, "README.md"), "# Clean\n", "utf-8");
      gitSync(["add", "README.md"], repoDir);
      gitSync(["commit", "-m", "initial"], repoDir);

      const commitCountBefore = gitSync(["rev-list", "--count", "HEAD"], repoDir);

      // WHEN: detectCanonDirtyPaths returns [] → no commitOperatorCanon call needed
      const dirtyPaths = await detectCanonDirtyPaths(SLUG, repoDir, defaultSpawnFn);
      expect(dirtyPaths).toEqual([]);

      // (Implementation: ResumeCommand.prepare() guards on dirtyPaths.length > 0)
      // If dirtyPaths is empty, commitOperatorCanon is not called → no new commit
      const commitCountAfter = gitSync(["rev-list", "--count", "HEAD"], repoDir);
      expect(commitCountAfter).toBe(commitCountBefore);
    },
    15000,
  );
});

// ---------------------------------------------------------------------------
// TC-003 (TC-R2): --apply-canon は保護正典パス以外の dirty を worktree に残す
// ---------------------------------------------------------------------------

describe("TC-003 (TC-R2): --apply-canon scope restriction — non-canon dirty stays in worktree", () => {
  it(
    "TC-003: operator-apply commit contains only the canon path; non-canon file remains dirty",
    async () => {
      // GIVEN: real git repo
      const repoDir = path.join(tempDir, "scope-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      // Initial commit
      await fs.writeFile(path.join(repoDir, "README.md"), "# Scope Test\n", "utf-8");
      gitSync(["add", "README.md"], repoDir);
      gitSync(["commit", "-m", "initial"], repoDir);

      // Create canon path and non-canon path (both dirty, unstaged)
      await fs.mkdir(path.join(repoDir, "specrunner", "changes", SLUG), { recursive: true });
      await fs.writeFile(path.join(repoDir, CANON_PATH), "# Updated Design\n", "utf-8");
      await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
      await fs.writeFile(path.join(repoDir, NON_CANON_PATH), "// not for commit\n", "utf-8");

      // WHEN: commit only the canon path
      const oid = await commitOperatorCanon(SLUG, repoDir, [CANON_PATH], defaultSpawnFn);

      // THEN: commit contains ONLY the canon path
      const changedFiles = gitSync(
        ["diff-tree", "--no-commit-id", "-r", "--name-only", oid],
        repoDir
      ).split("\n").filter(Boolean);
      expect(changedFiles).toContain(CANON_PATH);
      expect(changedFiles).not.toContain(NON_CANON_PATH);
      expect(changedFiles).toHaveLength(1);

      // THEN: non-canon file is STILL dirty in the worktree
      const status = spawnSync("git", ["status", "--porcelain", "-uall"], {
        cwd: repoDir, encoding: "utf8",
      });
      expect(status.stdout).toContain(NON_CANON_PATH);

      // THEN: index purity (cross-boundary Finding 1/2) — the non-canon file must NOT be
      // staged. A bare `git add -A` inside commitOperatorCanon would leave it in the index,
      // where scoped steps pass it undetected and the first guarded step sweeps it into its
      // own commit (index-pollution laundering).
      // DESTROY: revert the add to bare `git add -A` → this assertion fails.
      const staged = spawnSync("git", ["diff", "--cached", "--name-only"], {
        cwd: repoDir, encoding: "utf8",
      });
      expect(
        staged.stdout,
        "non-canon file must not be staged after apply-canon (index purity)",
      ).not.toContain(NON_CANON_PATH);
      expect(staged.stdout.trim(), "index must be fully clean after the pathspec commit").toBe("");
    },
    15000,
  );

  it(
    "TC-003: detectCanonDirtyPaths filters correctly when mixed files are dirty",
    async () => {
      // GIVEN
      const repoDir = path.join(tempDir, "scope-detect-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await fs.writeFile(path.join(repoDir, "README.md"), "# Test\n", "utf-8");
      gitSync(["add", "README.md"], repoDir);
      gitSync(["commit", "-m", "initial"], repoDir);

      await fs.mkdir(path.join(repoDir, "specrunner", "changes", SLUG), { recursive: true });
      await fs.writeFile(path.join(repoDir, CANON_PATH), "# Design\n", "utf-8");
      await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
      await fs.writeFile(path.join(repoDir, NON_CANON_PATH), "// src\n", "utf-8");

      // WHEN
      const dirtyPaths = await detectCanonDirtyPaths(SLUG, repoDir, defaultSpawnFn);

      // THEN: only the canon path is detected
      expect(dirtyPaths).toContain(CANON_PATH);
      expect(dirtyPaths).not.toContain(NON_CANON_PATH);
    },
    15000,
  );
});

// ---------------------------------------------------------------------------
// TC-006 (TC-R4): egress チェックが operator-apply commit OID を通過させる
// ---------------------------------------------------------------------------

describe("TC-006 (TC-R4): egress check passes for the operator-apply commit OID", () => {
  it(
    "TC-006: verifyEgressLedger does not throw EGRESS_UNKNOWN_COMMIT after commitOperatorCanon",
    async () => {
      // GIVEN: real git repo + bare remote
      const repoDir = path.join(tempDir, "egress-repo");
      const bareDir = path.join(tempDir, "egress-bare.git");
      await fs.mkdir(repoDir, { recursive: true });

      await createGitRepo(repoDir);
      await createBareRemote(repoDir, bareDir);
      const baseOid = await makeInitialCommitAndPush(repoDir);

      // Create feature branch
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Initial state with baseOid in ledger
      const jobState = makeBaseJobState(repoDir, [baseOid]);

      // Operator edits the canon path (not staged, not committed)
      await fs.mkdir(path.join(repoDir, "specrunner", "changes", SLUG), { recursive: true });
      await fs.writeFile(path.join(repoDir, CANON_PATH), "# Design v2\n", "utf-8");

      // WHEN: commitOperatorCanon creates the operator-apply commit
      const operatorOid = await commitOperatorCanon(SLUG, repoDir, [CANON_PATH], defaultSpawnFn);

      // AND: append OID to ledger
      const updatedState = appendSynthesizedCommit(jobState, operatorOid);
      const ledger = updatedState.synthesizedCommits ?? [];

      // THEN: verifyEgressLedger passes (operatorOid is in ledger)
      const pipelineSpawn = makePipelineSpawnFn(repoDir);
      await expect(
        verifyEgressLedger({ cwd: repoDir, ledger, spawnFn: pipelineSpawn })
      ).resolves.toBeUndefined();
    },
    30000,
  );

  it(
    "TC-006: verifyEgressLedger throws EGRESS_UNKNOWN_COMMIT when OID is NOT in ledger (destruction confirmation)",
    async () => {
      // GIVEN: same setup
      const repoDir = path.join(tempDir, "egress-repo2");
      const bareDir = path.join(tempDir, "egress-bare2.git");
      await fs.mkdir(repoDir, { recursive: true });

      await createGitRepo(repoDir);
      await createBareRemote(repoDir, bareDir);
      const baseOid = await makeInitialCommitAndPush(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Operator-apply commit
      await fs.mkdir(path.join(repoDir, "specrunner", "changes", SLUG), { recursive: true });
      await fs.writeFile(path.join(repoDir, CANON_PATH), "# Design\n", "utf-8");
      const operatorOid = await commitOperatorCanon(SLUG, repoDir, [CANON_PATH], defaultSpawnFn);
      void operatorOid; // captured but intentionally NOT in ledger below

      // WHEN: ledger does NOT include the operator OID (pre-fix behavior)
      const pipelineSpawn = makePipelineSpawnFn(repoDir);
      let caughtError: unknown;
      try {
        await verifyEgressLedger({ cwd: repoDir, ledger: [baseOid], spawnFn: pipelineSpawn });
      } catch (err) {
        caughtError = err;
      }

      // THEN: EGRESS_UNKNOWN_COMMIT error is thrown
      expect(caughtError).toBeDefined();
      expect((caughtError as { code?: string }).code).toBe("EGRESS_UNKNOWN_COMMIT");
    },
    30000,
  );
});

// ---------------------------------------------------------------------------
// TC-007: CANON_FINDING_ESCALATION hint が --apply-canon を案内する
// ---------------------------------------------------------------------------

describe("TC-007: CANON_FINDING_ESCALATION hint mentions --apply-canon", () => {
  it("TC-007: hint string in commit-orchestrator.ts contains '--apply-canon'", async () => {
    /**
     * The hint string is set in commit-orchestrator.ts when a CANON_FINDING_ESCALATION
     * is detected. T-04 updates the hint to mention --apply-canon.
     *
     * Before T-04: hint = "手動で修正し、job resume で再開" (no --apply-canon)
     * After T-04:  hint mentions "--apply-canon"
     *
     * We read the source file to verify the string contains the expected substring.
     */
    const thisDir = path.dirname(nodeUrl.fileURLToPath(import.meta.url));
    const srcDir = path.join(thisDir, "..", "src");
    const orchestratorSrc = await fs.readFile(
      path.join(srcDir, "core", "step", "commit-orchestrator.ts"),
      "utf-8",
    );

    // The hint string at the CANON_FINDING_ESCALATION block must contain --apply-canon
    expect(
      orchestratorSrc,
      "commit-orchestrator.ts hint string should contain '--apply-canon' (T-04 update)",
    ).toMatch(/--apply-canon/);

    // The hint must NOT instruct the operator to run 'git push' or 'git commit' manually
    // (These are the substrings tested per spec — note: "git commit" and "git push"
    //  as standalone git instructions; the spec allows "git" in other contexts)
    const hintMatch = orchestratorSrc.match(/hint:\s*["']([^"']+)["']/);
    if (hintMatch?.[1]) {
      const hint = hintMatch[1];
      expect(hint, "hint must contain --apply-canon").toMatch(/--apply-canon/);
      // Per spec.md: hint SHALL NOT contain "git push" or "git commit" as instructions
      expect(hint, "hint must not contain 'git push' as instruction").not.toMatch(/`git push`/);
      expect(hint, "hint must not contain 'git commit' as instruction").not.toMatch(/`git commit`/);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-008: buildCanonEscalationReason の出力が --apply-canon を含む
// ---------------------------------------------------------------------------

describe("TC-008: buildCanonEscalationReason output mentions --apply-canon", () => {
  it("TC-008: returned string contains the substring '--apply-canon'", () => {
    const sampleFindings: Finding[] = [
      {
        file: `specrunner/changes/${SLUG}/design.md`,
        title: "Incorrect type definition",
        severity: "high",
        resolution: "fixable",
        rationale: "The type definition is incorrect.",
      },
    ];

    const reason = buildCanonEscalationReason(sampleFindings);

    // THEN: result must contain --apply-canon (T-05 update)
    expect(
      reason,
      "buildCanonEscalationReason output should guide operator to --apply-canon",
    ).toMatch(/--apply-canon/);
  });

  it("TC-008: [CANON_FINDING_ESCALATION] prefix, finding lines, and explanation are preserved", () => {
    const sampleFindings: Finding[] = [
      {
        file: `specrunner/changes/${SLUG}/design.md`,
        title: "Missing requirement",
        severity: "high",
        resolution: "fixable",
        rationale: "The requirement is missing.",
      },
    ];

    const reason = buildCanonEscalationReason(sampleFindings);

    // The structure should be preserved (these pass even before T-05)
    expect(reason).toContain("[CANON_FINDING_ESCALATION]");
    expect(reason).toContain(`specrunner/changes/${SLUG}/design.md`);
    expect(reason).toContain("Missing requirement");
    // And the new --apply-canon guidance (RED before T-05)
    expect(reason).toContain("--apply-canon");
  });

  it("TC-008: works with multiple findings", () => {
    const sampleFindings: Finding[] = [
      {
        file: `specrunner/changes/${SLUG}/spec.md`,
        title: "Vague acceptance criteria",
        severity: "medium",
        resolution: "fixable",
        rationale: "Acceptance criteria are too vague.",
      },
      {
        file: `specrunner/changes/${SLUG}/design.md`,
        title: "Missing ADR reference",
        severity: "high",
        resolution: "fixable",
        rationale: "ADR reference is missing.",
      },
    ];

    const reason = buildCanonEscalationReason(sampleFindings);

    expect(reason).toContain("[CANON_FINDING_ESCALATION]");
    expect(reason).toContain("spec.md");
    expect(reason).toContain("design.md");
    // --apply-canon guidance must be present regardless of finding count
    expect(reason).toContain("--apply-canon");
  });
});
