/**
 * E2E tests for quarantinePartialCanon — real git repo operations (T-06).
 *
 * TC-023: quarantinePartialCanon — untracked canon path を退避してから除去する
 * TC-024: quarantinePartialCanon — 退避書き込み失敗時は throw し削除しない (evidence-first / fail-closed)
 * TC-025 (should): quarantinePartialCanon — canonPaths 空で no-op を返す
 * TC-026: reconcileWorktreeArtifacts の外部シグネチャと動作が不変（後方互換、sabotage record）
 *
 * Tests are intentionally RED until T-01 adds quarantinePartialCanon to reconcile-worktree.ts.
 * Uses real git repos in $TMPDIR (no mocking of git operations).
 * Mirrors the patterns in resume-worktree-reconciliation-e2e.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import * as reconcileModule from "../src/core/resume/reconcile-worktree.js";
import { detectCanonDirtyPaths } from "../src/core/resume/apply-canon.js";
import { defaultSpawnFn } from "../src/util/git-exec.js";
import type { ReconcileResult } from "../src/core/resume/reconcile-worktree.js";

// ---------------------------------------------------------------------------
// Cast to access not-yet-implemented export (T-01)
// After implementation, quarantinePartialCanon will be a named export.
// ---------------------------------------------------------------------------

const { quarantinePartialCanon } = reconcileModule as unknown as {
  quarantinePartialCanon: (
    slug: string,
    worktreePath: string,
    canonPaths: string[],
    spawnFn: typeof defaultSpawnFn,
  ) => Promise<ReconcileResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "canon-quarantine-e2e-test-slug";
const CHANGE_FOLDER = `specrunner/changes/${SLUG}`;

// ---------------------------------------------------------------------------
// Git sync helpers (mirrored from resume-worktree-reconciliation-e2e.test.ts)
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
  gitSync(["config", "user.email", "e2e-quarantine@spec-runner.local"], dir);
  gitSync(["config", "user.name", "Canon Quarantine E2E Test"], dir);
}

async function makeInitialCommit(repoDir: string): Promise<void> {
  const readmePath = path.join(repoDir, "README.md");
  await fs.writeFile(readmePath, "# Canon Quarantine E2E Test\n", "utf-8");
  gitSync(["add", "README.md"], repoDir);
  gitSync(["commit", "-m", "initial: test repo setup"], repoDir);
}

/** Get the current worktree status as a map of path → XY code. */
function getWorktreeStatus(repoDir: string): Map<string, string> {
  const result = spawnSync("git", ["status", "--porcelain", "-uall"], {
    cwd: repoDir,
    encoding: "utf8",
  });
  const statusMap = new Map<string, string>();
  for (const line of (result.stdout ?? "").split("\n").filter(Boolean)) {
    const xy = line.slice(0, 2);
    const filePath = line.slice(3);
    statusMap.set(filePath, xy);
  }
  return statusMap;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "canon-quarantine-e2e-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-023: quarantinePartialCanon — untracked canon path を退避してから除去する
// ---------------------------------------------------------------------------

describe("TC-023: quarantinePartialCanon — untracked / tracked-modified canon path を退避してから除去する", () => {
  it(
    "TC-023 (untracked): untracked design.md is quarantined with readable evidence and removed from worktree",
    async () => {
      // ── Setup ────────────────────────────────────────────────────────────
      const repoDir = path.join(tempDir, "untracked-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `change/${SLUG}`], repoDir);

      // Commit change folder (request.md so it's a valid change folder)
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      await fs.writeFile(
        path.join(repoDir, `${CHANGE_FOLDER}/request.md`),
        "# Request\n",
        "utf-8",
      );
      gitSync(["add", `${CHANGE_FOLDER}/request.md`], repoDir);
      gitSync(["commit", "-m", `init: change folder for ${SLUG}`], repoDir);

      // Leave untracked design.md (simulates interrupted design step)
      const designPath = `${CHANGE_FOLDER}/design.md`;
      const designContent = "# Partial Design (interrupted)\nThis was written before the kill.\n";
      await fs.writeFile(path.join(repoDir, designPath), designContent, "utf-8");

      // Verify precondition: design.md is untracked
      const statusBefore = getWorktreeStatus(repoDir);
      expect(statusBefore.has(designPath), "design.md must be untracked before quarantine").toBe(true);

      // ── WHEN ─────────────────────────────────────────────────────────────
      const result = await quarantinePartialCanon(SLUG, repoDir, [designPath], defaultSpawnFn);

      // ── THEN: result contains the quarantined path ────────────────────────
      expect(result.reconciled).toContain(designPath);
      expect(result.quarantineDir).not.toBeNull();

      // ── THEN: design.md no longer exists in worktree ─────────────────────
      const designExists = await fs.access(path.join(repoDir, designPath)).then(() => true).catch(() => false);
      expect(designExists, "design.md must be removed from worktree after quarantine").toBe(false);

      // ── THEN: quarantine dir contains readable evidence ───────────────────
      const quarantineDir = result.quarantineDir!;
      const evidenceFiles = await fs.readdir(quarantineDir);
      expect(evidenceFiles.length, "at least one evidence file must exist in quarantine dir").toBeGreaterThan(0);

      // Evidence must contain the partial design content
      let foundEvidence = false;
      for (const file of evidenceFiles) {
        const content = await fs.readFile(path.join(quarantineDir, file), "utf-8");
        if (content.includes("Partial Design (interrupted)") || content.includes(designPath)) {
          foundEvidence = true;
          break;
        }
      }
      expect(foundEvidence, "quarantine evidence must contain readable content from the partial design").toBe(true);

      // ── THEN: git status shows design.md as clean (not in status output) ──
      const statusAfter = getWorktreeStatus(repoDir);
      expect(statusAfter.has(designPath), "design.md must not appear in git status after quarantine").toBe(false);
    },
    30000,
  );

  it(
    "TC-023 (tracked-modified): modified tracked design.md is quarantined and restored to HEAD content",
    async () => {
      // ── Setup ────────────────────────────────────────────────────────────
      const repoDir = path.join(tempDir, "tracked-modified-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `change/${SLUG}`], repoDir);

      // Commit change folder with design.md (original content)
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      const designPath = `${CHANGE_FOLDER}/design.md`;
      const originalContent = "# Original Design (committed)\n";
      await fs.writeFile(path.join(repoDir, designPath), originalContent, "utf-8");
      gitSync(["add", designPath], repoDir);
      gitSync(["commit", "-m", `design: committed design.md for ${SLUG}`], repoDir);

      // Partially modify design.md (simulates interrupted design step that wrote partial output)
      const partialContent = "# Partial Design (written during interrupted attempt)\n";
      await fs.writeFile(path.join(repoDir, designPath), partialContent, "utf-8");

      // Verify precondition: design.md is tracked-modified
      const statusBefore = getWorktreeStatus(repoDir);
      expect(statusBefore.has(designPath), "design.md must be tracked-modified before quarantine").toBe(true);

      // ── WHEN ─────────────────────────────────────────────────────────────
      const result = await quarantinePartialCanon(SLUG, repoDir, [designPath], defaultSpawnFn);

      // ── THEN: result contains the path ───────────────────────────────────
      expect(result.reconciled).toContain(designPath);
      expect(result.quarantineDir).not.toBeNull();

      // ── THEN: design.md restored to HEAD content ──────────────────────────
      const restoredContent = await fs.readFile(path.join(repoDir, designPath), "utf-8");
      expect(
        restoredContent,
        "design.md must be restored to HEAD content after quarantine",
      ).toBe(originalContent);

      // ── THEN: evidence contains partial content (diff readable) ──────────
      const quarantineDir = result.quarantineDir!;
      const evidenceFiles = await fs.readdir(quarantineDir);
      let foundPartialContent = false;
      for (const file of evidenceFiles) {
        const content = await fs.readFile(path.join(quarantineDir, file), "utf-8");
        if (content.includes("Partial Design") || content.includes(designPath)) {
          foundPartialContent = true;
          break;
        }
      }
      expect(
        foundPartialContent,
        "quarantine evidence must capture the partial content (diff or raw content)",
      ).toBe(true);

      // ── THEN: git status shows design.md as clean ────────────────────────
      const statusAfter = getWorktreeStatus(repoDir);
      expect(statusAfter.has(designPath), "design.md must be clean in git status after restoration").toBe(false);
    },
    30000,
  );

  it(
    "TC-023 (idempotency): detectCanonDirtyPaths returns [] after quarantine (冪等性確認)",
    async () => {
      // ── Setup ────────────────────────────────────────────────────────────
      const repoDir = path.join(tempDir, "idempotency-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `change/${SLUG}`], repoDir);

      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      await fs.writeFile(
        path.join(repoDir, `${CHANGE_FOLDER}/request.md`),
        "# Request\n", "utf-8",
      );
      gitSync(["add", `${CHANGE_FOLDER}/request.md`], repoDir);
      gitSync(["commit", "-m", `init: ${SLUG}`], repoDir);

      // Leave untracked design.md
      const designPath = `${CHANGE_FOLDER}/design.md`;
      await fs.writeFile(path.join(repoDir, designPath), "# Partial\n", "utf-8");

      // WHEN: quarantine runs
      await quarantinePartialCanon(SLUG, repoDir, [designPath], defaultSpawnFn);

      // THEN: detectCanonDirtyPaths returns [] (no more dirty canon — idempotent)
      const dirtyAfter = await detectCanonDirtyPaths(SLUG, repoDir, defaultSpawnFn);
      expect(
        dirtyAfter,
        "detectCanonDirtyPaths must return [] after quarantine (idempotency confirmed)",
      ).toEqual([]);
    },
    30000,
  );
});

// ---------------------------------------------------------------------------
// TC-024: quarantinePartialCanon — 退避書き込み失敗時は throw し削除しない
// ---------------------------------------------------------------------------

describe("TC-024: quarantinePartialCanon — 退避書き込み失敗時は throw し削除しない (evidence-first / fail-closed)", () => {
  it(
    "TC-024: throws when quarantine dir mkdir fails; canon path remains in worktree (evidence preserved)",
    async () => {
      // ── Setup ────────────────────────────────────────────────────────────
      const repoDir = path.join(tempDir, "quarantine-fail-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `change/${SLUG}`], repoDir);

      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      await fs.writeFile(
        path.join(repoDir, `${CHANGE_FOLDER}/request.md`),
        "# Request\n", "utf-8",
      );
      gitSync(["add", `${CHANGE_FOLDER}/request.md`], repoDir);
      gitSync(["commit", "-m", `init: ${SLUG}`], repoDir);

      // Leave untracked design.md (the partial output to quarantine)
      const designPath = `${CHANGE_FOLDER}/design.md`;
      const designContent = "# Partial Design (must survive quarantine failure)\n";
      await fs.writeFile(path.join(repoDir, designPath), designContent, "utf-8");

      // Block quarantine dir creation: create .specrunner/local as a regular FILE
      // so mkdir(.specrunner/local/<slug>) fails
      await fs.mkdir(path.join(repoDir, ".specrunner"), { recursive: true });
      await fs.writeFile(
        path.join(repoDir, ".specrunner", "local"),
        "NOT A DIRECTORY — blocks quarantine mkdir",
        "utf-8",
      );

      // ── WHEN ─────────────────────────────────────────────────────────────
      let threw = false;
      try {
        await quarantinePartialCanon(SLUG, repoDir, [designPath], defaultSpawnFn);
      } catch {
        threw = true;
      }

      // ── THEN: must throw (fail-closed) ───────────────────────────────────
      expect(
        threw,
        "quarantinePartialCanon must throw when quarantine dir cannot be created (fail-closed)",
      ).toBe(true);

      // ── THEN: design.md is STILL present (evidence-first: nothing was deleted) ─
      const designExists = await fs.access(path.join(repoDir, designPath)).then(() => true).catch(() => false);
      expect(
        designExists,
        "design.md must NOT be removed when quarantine fails (evidence-first invariant)",
      ).toBe(true);

      // ── THEN: design.md content is unchanged ────────────────────────────
      const actualContent = await fs.readFile(path.join(repoDir, designPath), "utf-8");
      expect(actualContent).toBe(designContent);

      // ── THEN: git status still shows design.md as untracked ─────────────
      const statusAfter = getWorktreeStatus(repoDir);
      expect(
        statusAfter.has(designPath),
        "design.md must remain in git status after quarantine failure (not removed)",
      ).toBe(true);
    },
    30000,
  );
});

// ---------------------------------------------------------------------------
// TC-025 (should): quarantinePartialCanon — canonPaths 空で no-op を返す
// ---------------------------------------------------------------------------

describe("TC-025 (should): quarantinePartialCanon — canonPaths=[] で no-op を返す", () => {
  it(
    "TC-025: returns { reconciled: [], quarantineDir: null } when canonPaths is empty",
    async () => {
      // ── Setup ────────────────────────────────────────────────────────────
      const repoDir = path.join(tempDir, "empty-paths-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);

      // ── WHEN: canonPaths is empty ─────────────────────────────────────────
      const result = await quarantinePartialCanon(SLUG, repoDir, [], defaultSpawnFn);

      // ── THEN: no-op result ────────────────────────────────────────────────
      expect(result).toEqual({ reconciled: [], quarantineDir: null });

      // ── THEN: no quarantine directory created ────────────────────────────
      const sidecarBase = path.join(repoDir, ".specrunner", "local", SLUG);
      const sidecarExists = await fs.access(sidecarBase).then(() => true).catch(() => false);
      if (sidecarExists) {
        const entries = await fs.readdir(sidecarBase).catch(() => []);
        const canonQuarantineDirs = entries.filter((e) => e.startsWith("canon-quarantine-"));
        expect(canonQuarantineDirs, "no canon-quarantine dirs should be created for empty canonPaths").toHaveLength(0);
      }
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-026: reconcileWorktreeArtifacts の外部シグネチャと動作が不変（後方互換）
// ---------------------------------------------------------------------------

describe("TC-026: reconcileWorktreeArtifacts の外部シグネチャと動作が不変（後方互換 sabotage record）", () => {
  /**
   * TC-026 SABOTAGE RECORD:
   *
   * T-01 refactors reconcile-worktree.ts by extracting an internal quarantine core,
   * but MUST keep reconcileWorktreeArtifacts' external behavior unchanged.
   *
   * The following existing test suites are the mechanical teeth that enforce this:
   *   - src/core/resume/__tests__/reconcile-worktree.test.ts
   *   - src/core/command/__tests__/resume-reconcile.test.ts
   *   - tests/resume-worktree-reconciliation-e2e.test.ts
   *
   * If reconcileWorktreeArtifacts changes behavior after the T-01 refactor,
   * those existing tests will fail. This is the design — they are the load-bearing
   * tests for backward compat.
   *
   * This TC-026 test serves as inline documentation:
   * The EXISTENCE of the 3 existing test suites (running and green) IS the
   * backward-compat guarantee. TC-026 does not add new test code.
   */
  it("TC-026: reconcileWorktreeArtifacts is still exported with the same signature after T-01 refactor", async () => {
    // Verify that reconcileWorktreeArtifacts is still exported from the module
    const { reconcileWorktreeArtifacts } = await import("../src/core/resume/reconcile-worktree.js");
    expect(
      typeof reconcileWorktreeArtifacts,
      "reconcileWorktreeArtifacts must remain exported after T-01 refactor",
    ).toBe("function");
  });

  it("TC-026: quarantinePartialCanon uses 'canon-quarantine-' prefix (distinct from reconcile 'reconcile-')", async () => {
    /**
     * The prefix distinguishes the two quarantine directories in .specrunner/local/<slug>/.
     * reconcile-worktree uses 'reconcile-<timestamp>' for non-canon residue.
     * quarantinePartialCanon must use 'canon-quarantine-<timestamp>' for canon partial output.
     * This test documents the naming contract.
     */
    const repoDir = path.join(tempDir, "prefix-check-repo");
    await fs.mkdir(repoDir, { recursive: true });
    await createGitRepo(repoDir);
    await makeInitialCommit(repoDir);
    gitSync(["checkout", "-b", `change/${SLUG}`], repoDir);

    await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
    const designPath = `${CHANGE_FOLDER}/design.md`;
    await fs.writeFile(path.join(repoDir, designPath), "# Partial\n", "utf-8");

    await fs.writeFile(
      path.join(repoDir, `${CHANGE_FOLDER}/request.md`),
      "# Request\n", "utf-8",
    );
    gitSync(["add", `${CHANGE_FOLDER}/request.md`], repoDir);
    gitSync(["commit", "-m", `init: ${SLUG}`], repoDir);

    const result = await quarantinePartialCanon(SLUG, repoDir, [designPath], defaultSpawnFn);

    // The quarantineDir must contain 'canon-quarantine-' prefix
    expect(result.quarantineDir).not.toBeNull();
    const dirName = path.basename(result.quarantineDir!);
    expect(
      dirName,
      "quarantineDir must use 'canon-quarantine-' prefix to distinguish from 'reconcile-' dirs",
    ).toMatch(/^canon-quarantine-/);
  }, 30000);
});
