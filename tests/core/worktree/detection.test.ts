import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { detectWorktree, detectSpecrunnerWorktree } from "../../../src/core/worktree/detection.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-detection-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("detectWorktree", () => {
  it("returns isWorktree: false when .git is a directory (main worktree)", async () => {
    await fs.mkdir(path.join(tmpDir, ".git"));

    const result = await detectWorktree(tmpDir);

    expect(result.isWorktree).toBe(false);
    expect(result.mainWorktreePath).toBeUndefined();
  });

  it("returns isWorktree: true with correct mainWorktreePath when .git is a file (linked worktree)", async () => {
    // Simulate a linked worktree: .git file points to the main repo's .git internals
    // e.g. /some/repo/.git/specrunner-worktrees/foo-12345678
    const fakeMainRepo = path.join(tmpDir, "main-repo");
    const fakeGitDir = path.join(fakeMainRepo, ".git", "specrunner-worktrees", "foo-12345678");
    await fs.mkdir(fakeGitDir, { recursive: true });

    // The worktree lives at tmpDir/worktree
    const worktreeDir = path.join(tmpDir, "worktree");
    await fs.mkdir(worktreeDir);

    // .git file content: relative path from worktree to the gitdir
    const relativePath = path.relative(worktreeDir, fakeGitDir);
    await fs.writeFile(path.join(worktreeDir, ".git"), `gitdir: ${relativePath}\n`);

    const result = await detectWorktree(worktreeDir);

    expect(result.isWorktree).toBe(true);
    // mainWorktreePath should be the parent of `.git` in the path
    expect(result.mainWorktreePath).toBe(fakeMainRepo);
  });

  it("returns isWorktree: false when .git does not exist (not a git repo)", async () => {
    // No .git at all
    const result = await detectWorktree(tmpDir);

    expect(result.isWorktree).toBe(false);
    expect(result.mainWorktreePath).toBeUndefined();
  });

  it("returns isWorktree: false when .git file has no gitdir line", async () => {
    // Malformed .git file
    await fs.writeFile(path.join(tmpDir, ".git"), "not a valid gitdir file\n");

    const result = await detectWorktree(tmpDir);

    expect(result.isWorktree).toBe(false);
  });

  it("parses absolute gitdir path correctly", async () => {
    // Some git implementations write absolute paths in the .git file
    const fakeMainRepo = path.join(tmpDir, "abs-main");
    const fakeGitDir = path.join(fakeMainRepo, ".git", "worktrees", "my-worktree");
    await fs.mkdir(fakeGitDir, { recursive: true });

    const worktreeDir = path.join(tmpDir, "abs-worktree");
    await fs.mkdir(worktreeDir);

    // Absolute path in .git file
    await fs.writeFile(path.join(worktreeDir, ".git"), `gitdir: ${fakeGitDir}\n`);

    const result = await detectWorktree(worktreeDir);

    expect(result.isWorktree).toBe(true);
    expect(result.mainWorktreePath).toBe(fakeMainRepo);
  });
});

// ---------------------------------------------------------------------------
// TC-005 & TC-006: detectSpecrunnerWorktree
// ---------------------------------------------------------------------------

describe("detectSpecrunnerWorktree", () => {
  // TC-005: specrunner-worktrees 配下の cwd を「内側」と判定し main root を返す
  it("TC-005: specrunner-worktrees 配下の cwd を isSpecrunnerWorktree: true と判定し mainCheckoutPath を返す", async () => {
    // Create a real directory that looks like a specrunner job worktree
    // Structure: <tmpDir>/.git/specrunner-worktrees/<slug>-<id>
    const worktreeDir = path.join(tmpDir, ".git", "specrunner-worktrees", "test-slug-abc12345");
    await fs.mkdir(worktreeDir, { recursive: true });

    const result = await detectSpecrunnerWorktree(worktreeDir);

    expect(result.isSpecrunnerWorktree).toBe(true);
    // mainCheckoutPath should be tmpDir (resolved via realpath to handle macOS /private symlink)
    const expectedMainPath = await fs.realpath(tmpDir);
    expect(result.mainCheckoutPath).toBe(expectedMainPath);
  });

  // TC-006: main checkout の cwd を「内側でない」と判定する
  it("TC-006: .git/specrunner-worktrees/ を含まない main checkout cwd を isSpecrunnerWorktree: false と判定する", async () => {
    // tmpDir is a plain directory — not inside specrunner-worktrees
    const result = await detectSpecrunnerWorktree(tmpDir);

    expect(result.isSpecrunnerWorktree).toBe(false);
    expect(result.mainCheckoutPath).toBeUndefined();
  });

  // TC-007: 無関係パスを「内側でない」と判定する
  it("TC-007: .git/specrunner-worktrees/ を含まない無関係パスを isSpecrunnerWorktree: false と判定する", async () => {
    // A directory with a path that has no .git/specrunner-worktrees/ segment
    const unrelatedDir = path.join(tmpDir, "some", "unrelated", "path");
    await fs.mkdir(unrelatedDir, { recursive: true });

    const result = await detectSpecrunnerWorktree(unrelatedDir);

    expect(result.isSpecrunnerWorktree).toBe(false);
    expect(result.mainCheckoutPath).toBeUndefined();
  });

  // TC-009: realpath 失敗時は fail-open（内側でない）を返す
  it("TC-009: 存在しないパスを cwd として与えると isSpecrunnerWorktree: false を返す（fail-open）", async () => {
    const nonexistentPath = "/nonexistent/path/that/does/not/exist/specrunner-test";

    const result = await detectSpecrunnerWorktree(nonexistentPath);

    expect(result.isSpecrunnerWorktree).toBe(false);
    expect(result.mainCheckoutPath).toBeUndefined();
  });
});
