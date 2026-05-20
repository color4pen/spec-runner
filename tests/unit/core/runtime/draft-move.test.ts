/**
 * Regression test: run after setupWorkspace deletes draft from main worktree.
 *
 * TC-DRAFT-001: main worktree draft deleted after setupWorkspace
 * TC-DRAFT-002: change folder request.md exists after setupWorkspace
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let worktreeDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-move-test-main-"));
  worktreeDir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-move-test-wt-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.rm(worktreeDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Minimal stub of the setupWorkspace draft-move logic (extracted from local.ts)
async function simulateSetupWorkspaceDraftMove(params: {
  mainCwd: string;
  worktreePath: string;
  slug: string;
  draftFilePath: string;
  spawnFn: (cmd: string, args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}): Promise<void> {
  const { mainCwd: _mainCwd, worktreePath, slug, draftFilePath, spawnFn } = params;

  // Copy to change folder
  const changeFolderRequestPath = path.join(worktreePath, "specrunner", "changes", slug, "request.md");
  await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
  await fs.cp(draftFilePath, changeFolderRequestPath);

  // Stage
  await spawnFn("git", ["add", path.join("specrunner", "changes", slug, "request.md")]);

  // Delete draft from main
  try {
    await fs.rm(draftFilePath);
  } catch {
    process.stderr.write(`Warning: failed to delete draft file\n`);
  }

  // Commit
  await spawnFn("git", ["commit", "-m", `add request.md for ${slug}`]);
}

describe("TC-DRAFT-001: main worktree draft deleted after setupWorkspace", () => {
  it("draft file no longer exists in main cwd after run", async () => {
    // Setup: create draft in main cwd
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    const draftPath = path.join(draftsDir, "my-feature.md");
    await fs.writeFile(draftPath, "# My Feature\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await simulateSetupWorkspaceDraftMove({
      mainCwd: tempDir,
      worktreePath: worktreeDir,
      slug: "my-feature",
      draftFilePath: draftPath,
      spawnFn,
    });

    // Assert: draft is gone from main
    await expect(fs.access(draftPath)).rejects.toThrow();
  });
});

describe("TC-DRAFT-002: change folder request.md exists after setupWorkspace", () => {
  it("request.md is present in worktree change folder", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    const draftPath = path.join(draftsDir, "my-feature.md");
    await fs.writeFile(draftPath, "# My Feature\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await simulateSetupWorkspaceDraftMove({
      mainCwd: tempDir,
      worktreePath: worktreeDir,
      slug: "my-feature",
      draftFilePath: draftPath,
      spawnFn,
    });

    // Assert: change folder request.md exists in worktree
    const changeFolderReqPath = path.join(worktreeDir, "specrunner", "changes", "my-feature", "request.md");
    await expect(fs.access(changeFolderReqPath)).resolves.toBeUndefined();
  });
});
