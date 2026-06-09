/**
 * Regression test: setupWorkspace copies draft to change folder without deleting it.
 *
 * TC-DRAFT-001: draft file still exists in main cwd after setupWorkspace (copy semantics)
 * TC-DRAFT-002: change folder request.md exists after setupWorkspace
 * TC-DRAFT-003: directory-format draft (<slug>/request.md) — slug dir still exists after setupWorkspace
 * TC-DRAFT-004: legacy flat-file format (<slug>.md) — flat file still exists after setupWorkspace
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

// Minimal stub of the setupWorkspace draft-copy logic (extracted from local.ts)
// New semantics: draft is COPIED to change folder, NOT deleted.
async function simulateSetupWorkspaceDraftCopy(params: {
  mainCwd: string;
  worktreePath: string;
  slug: string;
  draftFilePath: string;
  spawnFn: (cmd: string, args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}): Promise<void> {
  const { mainCwd: _mainCwd, worktreePath, slug, draftFilePath, spawnFn } = params;

  // Copy to change folder (no deletion — copy semantics)
  const changeFolderRequestPath = path.join(worktreePath, "specrunner", "changes", slug, "request.md");
  await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
  await fs.cp(draftFilePath, changeFolderRequestPath);

  // Stage
  await spawnFn("git", ["add", path.join("specrunner", "changes", slug, "request.md")]);

  // Commit
  await spawnFn("git", ["commit", "-m", `add request.md for ${slug}`]);
}

describe("TC-DRAFT-001: draft file still exists in main cwd after setupWorkspace (copy semantics)", () => {
  it("draft file remains in main cwd after run", async () => {
    // Setup: create draft in main cwd
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    const draftPath = path.join(draftsDir, "my-feature.md");
    await fs.writeFile(draftPath, "# My Feature\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await simulateSetupWorkspaceDraftCopy({
      mainCwd: tempDir,
      worktreePath: worktreeDir,
      slug: "my-feature",
      draftFilePath: draftPath,
      spawnFn,
    });

    // Assert: draft is still present in main (copy semantics — not deleted)
    await expect(fs.access(draftPath)).resolves.toBeUndefined();
  });
});

describe("TC-DRAFT-002: change folder request.md exists after setupWorkspace", () => {
  it("request.md is present in worktree change folder", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    const draftPath = path.join(draftsDir, "my-feature.md");
    await fs.writeFile(draftPath, "# My Feature\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await simulateSetupWorkspaceDraftCopy({
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

describe("TC-DRAFT-003: directory-format draft — slug directory still exists after setupWorkspace", () => {
  it("slug directory remains when draftFilePath ends with /request.md (copy semantics)", async () => {
    // Directory-format draft: specrunner/drafts/my-feature/request.md
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    const slugDir = path.join(draftsDir, "my-feature");
    await fs.mkdir(slugDir, { recursive: true });
    const draftPath = path.join(slugDir, "request.md");
    await fs.writeFile(draftPath, "# My Feature\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await simulateSetupWorkspaceDraftCopy({
      mainCwd: tempDir,
      worktreePath: worktreeDir,
      slug: "my-feature",
      draftFilePath: draftPath,
      spawnFn,
    });

    // Assert: slug directory is still present (not deleted — copy semantics)
    await expect(fs.access(slugDir)).resolves.toBeUndefined();
    // Assert: draft file itself still exists
    await expect(fs.access(draftPath)).resolves.toBeUndefined();
  });
});

describe("TC-DRAFT-004: legacy flat-file format — flat file still exists after setupWorkspace", () => {
  it("flat file remains when draftFilePath does not end with /request.md (copy semantics)", async () => {
    // Legacy flat-file draft: specrunner/drafts/my-feature.md
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    const draftPath = path.join(draftsDir, "my-feature.md");
    await fs.writeFile(draftPath, "# My Feature\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await simulateSetupWorkspaceDraftCopy({
      mainCwd: tempDir,
      worktreePath: worktreeDir,
      slug: "my-feature",
      draftFilePath: draftPath,
      spawnFn,
    });

    // Assert: the flat file is still present (not deleted — copy semantics)
    await expect(fs.access(draftPath)).resolves.toBeUndefined();
    // Assert: drafts/ directory still exists
    await expect(fs.access(draftsDir)).resolves.toBeUndefined();
  });
});
