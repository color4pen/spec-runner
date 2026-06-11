/**
 * Unit tests for src/util/copy-artifacts.ts — symlink dereference guard
 *
 * TC-SYM-001: rejectSymlink — 通常ファイルはエラーなし
 * TC-SYM-002: rejectSymlink — symlink なら SpecRunnerError を throw
 * TC-SYM-003: rejectSymlink — ファイルが存在しない（ENOENT）は素通り
 * TC-SYM-006: SYMLINK_REJECTED のエラーコードと終了コード
 * TC-SYM-011: copyDraftUsageToChangeFolder — symlink な usage.json は SpecRunnerError
 * TC-SYM-012: copyDraftUsageToChangeFolder — SpecRunnerError が try/catch で swallow されない
 * TC-SYM-013: copyDraftUsageToChangeFolder — usage.json が存在しない場合は正常終了
 * TC-SYM-014: copyDraftUsageToChangeFolder — 通常ファイルの usage.json は正常コピー
 * TC-SYM-015: rejectSymlink — 共通ユーティリティとして export されている
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { rejectSymlink, copyDraftUsageToChangeFolder, recopyDraftToChangeFolder } from "../../../src/core/artifact/copy-artifacts.js";
import { SpecRunnerError, ERROR_CODES, EXIT_CODE } from "../../../src/errors.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "copy-artifacts-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-SYM-001
// ---------------------------------------------------------------------------
describe("TC-SYM-001: rejectSymlink — 通常ファイルはエラーなし", () => {
  it("resolves without throwing for a regular file", async () => {
    const filePath = path.join(tempDir, "request.md");
    await fs.writeFile(filePath, "# request\n");

    await expect(rejectSymlink(filePath)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-002
// ---------------------------------------------------------------------------
describe("TC-SYM-002: rejectSymlink — symlink なら SpecRunnerError を throw", () => {
  it("throws SpecRunnerError with SYMLINK_REJECTED when path is a symlink", async () => {
    const target = path.join(tempDir, "real.md");
    const symlinkPath = path.join(tempDir, "request.md");
    await fs.writeFile(target, "real content\n");
    await fs.symlink(target, symlinkPath);

    await expect(rejectSymlink(symlinkPath)).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof SpecRunnerError &&
        err.code === "SYMLINK_REJECTED" &&
        err.message.includes(symlinkPath) &&
        err.hint.includes("Remove the symlink")
      );
    });
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-003
// ---------------------------------------------------------------------------
describe("TC-SYM-003: rejectSymlink — ファイルが存在しない（ENOENT）は素通り", () => {
  it("resolves without throwing when file does not exist", async () => {
    const missingPath = path.join(tempDir, "nonexistent.md");

    await expect(rejectSymlink(missingPath)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-006
// ---------------------------------------------------------------------------
describe("TC-SYM-006: SYMLINK_REJECTED のエラーコードと終了コード", () => {
  it("ERROR_CODES.SYMLINK_REJECTED equals 'SYMLINK_REJECTED'", () => {
    expect(ERROR_CODES.SYMLINK_REJECTED).toBe("SYMLINK_REJECTED");
  });

  it("SpecRunnerError created with SYMLINK_REJECTED has exitCode 2 (ARG_ERROR)", () => {
    const err = new SpecRunnerError(
      ERROR_CODES.SYMLINK_REJECTED,
      "Remove the symlink and use a regular file.",
      "some/path is a symbolic link.",
    );
    expect(err.exitCode).toBe(EXIT_CODE.ARG_ERROR);
    expect(err.exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-011
// ---------------------------------------------------------------------------
describe("TC-SYM-011: copyDraftUsageToChangeFolder — symlink な usage.json は SpecRunnerError", () => {
  it("throws SpecRunnerError(SYMLINK_REJECTED) without calling fs.cp", async () => {
    const draftDir = path.join(tempDir, "drafts", "my-slug");
    await fs.mkdir(draftDir, { recursive: true });
    const draftRequestFilePath = path.join(draftDir, "request.md");
    await fs.writeFile(draftRequestFilePath, "# request\n");

    const realFile = path.join(tempDir, "real-usage.json");
    await fs.writeFile(realFile, "{}");
    const usageSymlink = path.join(draftDir, "usage.json");
    await fs.symlink(realFile, usageSymlink);

    const targetCwd = path.join(tempDir, "repo");
    await fs.mkdir(targetCwd, { recursive: true });
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await expect(
      copyDraftUsageToChangeFolder(draftRequestFilePath, targetCwd, "my-slug", spawnFn),
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof SpecRunnerError && err.code === "SYMLINK_REJECTED";
    });

    // spawnFn (git add) must not have been called
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-012
// ---------------------------------------------------------------------------
describe("TC-SYM-012: copyDraftUsageToChangeFolder — SpecRunnerError が try/catch で swallow されない", () => {
  it("SpecRunnerError propagates out of the function (not swallowed by internal catch)", async () => {
    const draftDir = path.join(tempDir, "drafts", "my-slug");
    await fs.mkdir(draftDir, { recursive: true });
    const draftRequestFilePath = path.join(draftDir, "request.md");
    await fs.writeFile(draftRequestFilePath, "# request\n");

    const realFile = path.join(tempDir, "real-usage.json");
    await fs.writeFile(realFile, "{}");
    const usageSymlink = path.join(draftDir, "usage.json");
    await fs.symlink(realFile, usageSymlink);

    const targetCwd = path.join(tempDir, "repo");
    await fs.mkdir(targetCwd, { recursive: true });
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    let caught: unknown;
    try {
      await copyDraftUsageToChangeFolder(draftRequestFilePath, targetCwd, "my-slug", spawnFn);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SpecRunnerError);
    expect((caught as SpecRunnerError).code).toBe("SYMLINK_REJECTED");
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-013
// ---------------------------------------------------------------------------
describe("TC-SYM-013: copyDraftUsageToChangeFolder — usage.json が存在しない場合は正常終了", () => {
  it("resolves without error when usage.json is absent from draft folder", async () => {
    const draftDir = path.join(tempDir, "drafts", "my-slug");
    await fs.mkdir(draftDir, { recursive: true });
    const draftRequestFilePath = path.join(draftDir, "request.md");
    await fs.writeFile(draftRequestFilePath, "# request\n");
    // No usage.json created

    const targetCwd = path.join(tempDir, "repo");
    await fs.mkdir(targetCwd, { recursive: true });
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await expect(
      copyDraftUsageToChangeFolder(draftRequestFilePath, targetCwd, "my-slug", spawnFn),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-014
// ---------------------------------------------------------------------------
describe("TC-SYM-014: copyDraftUsageToChangeFolder — 通常ファイルの usage.json は正常コピー", () => {
  it("copies usage.json to change folder and calls git add", async () => {
    const draftDir = path.join(tempDir, "drafts", "my-slug");
    await fs.mkdir(draftDir, { recursive: true });
    const draftRequestFilePath = path.join(draftDir, "request.md");
    await fs.writeFile(draftRequestFilePath, "# request\n");
    const usageSrc = path.join(draftDir, "usage.json");
    await fs.writeFile(usageSrc, '{"tokens":42}');

    const targetCwd = path.join(tempDir, "repo");
    // Pre-create the destination directory so fs.cp can write the file
    await fs.mkdir(path.join(targetCwd, "specrunner", "changes", "my-slug"), { recursive: true });
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await copyDraftUsageToChangeFolder(draftRequestFilePath, targetCwd, "my-slug", spawnFn);

    const destPath = path.join(targetCwd, "specrunner", "changes", "my-slug", "usage.json");
    const content = await fs.readFile(destPath, "utf8");
    expect(content).toBe('{"tokens":42}');

    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      ["add", "specrunner/changes/my-slug/usage.json"],
      { cwd: targetCwd },
    );
  });
});

// ---------------------------------------------------------------------------
// TC-SYM-015
// ---------------------------------------------------------------------------
describe("TC-SYM-015: rejectSymlink — 共通ユーティリティとして export されている", () => {
  it("rejectSymlink is a named export from copy-artifacts", () => {
    expect(typeof rejectSymlink).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-RECOPY-001: recopyDraftToChangeFolder — draft exists → file written + git add called
// ---------------------------------------------------------------------------
describe("TC-RECOPY-001: recopyDraftToChangeFolder — draft exists → file written and git add called", () => {
  it("copies draft request.md to change folder and calls git add with cwd=targetCwd", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const targetCwd = path.join(tempDir, "worktree");
    const slug = "my-slug";

    // Create draft at specrunner/drafts/<slug>/request.md
    const draftDir = path.join(repoRoot, "specrunner", "drafts", slug);
    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(path.join(draftDir, "request.md"), "# Draft Content\n");

    // Pre-create target change folder dir
    await fs.mkdir(path.join(targetCwd, "specrunner", "changes", slug), { recursive: true });

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await recopyDraftToChangeFolder(repoRoot, targetCwd, slug, spawnFn);

    // Assert: change folder request.md has the draft content
    const destPath = path.join(targetCwd, "specrunner", "changes", slug, "request.md");
    const content = await fs.readFile(destPath, "utf8");
    expect(content).toBe("# Draft Content\n");

    // Assert: git add was called with the right relative path and cwd
    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      ["add", `specrunner/changes/${slug}/request.md`],
      { cwd: targetCwd },
    );
  });
});

// ---------------------------------------------------------------------------
// TC-RECOPY-002: recopyDraftToChangeFolder — overwrites existing changeDest content
// ---------------------------------------------------------------------------
describe("TC-RECOPY-002: recopyDraftToChangeFolder — overwrites existing change folder request.md", () => {
  it("overwrites stale change folder content with updated draft", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const targetCwd = path.join(tempDir, "worktree");
    const slug = "my-slug";

    // Create draft
    const draftDir = path.join(repoRoot, "specrunner", "drafts", slug);
    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(path.join(draftDir, "request.md"), "# Updated Draft\n");

    // Pre-create change folder with stale content
    const changeFolderDir = path.join(targetCwd, "specrunner", "changes", slug);
    await fs.mkdir(changeFolderDir, { recursive: true });
    await fs.writeFile(path.join(changeFolderDir, "request.md"), "# Stale Content\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await recopyDraftToChangeFolder(repoRoot, targetCwd, slug, spawnFn);

    const destPath = path.join(targetCwd, "specrunner", "changes", slug, "request.md");
    const content = await fs.readFile(destPath, "utf8");
    expect(content).toBe("# Updated Draft\n");
  });
});

// ---------------------------------------------------------------------------
// TC-RECOPY-003: recopyDraftToChangeFolder — draft absent → no-op, no error
// ---------------------------------------------------------------------------
describe("TC-RECOPY-003: recopyDraftToChangeFolder — draft absent → no-op, no error", () => {
  it("resolves without error and does not call git add when draft is absent", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const targetCwd = path.join(tempDir, "worktree");
    const slug = "my-slug";

    // No draft file created
    await fs.mkdir(repoRoot, { recursive: true });
    await fs.mkdir(targetCwd, { recursive: true });

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await expect(recopyDraftToChangeFolder(repoRoot, targetCwd, slug, spawnFn)).resolves.toBeUndefined();

    // Assert: git add was NOT called (no draft to copy)
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RECOPY-004: recopyDraftToChangeFolder — symlink at draft path → SpecRunnerError(SYMLINK_REJECTED)
// ---------------------------------------------------------------------------
describe("TC-RECOPY-004: recopyDraftToChangeFolder — symlink at draft path → SpecRunnerError", () => {
  it("throws SpecRunnerError(SYMLINK_REJECTED) when draft path is a symlink", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const targetCwd = path.join(tempDir, "worktree");
    const slug = "my-slug";

    // Create a symlink at the draft path
    const draftDir = path.join(repoRoot, "specrunner", "drafts", slug);
    await fs.mkdir(draftDir, { recursive: true });
    const realFile = path.join(tempDir, "real-request.md");
    await fs.writeFile(realFile, "# Real\n");
    await fs.symlink(realFile, path.join(draftDir, "request.md"));

    await fs.mkdir(targetCwd, { recursive: true });
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await expect(recopyDraftToChangeFolder(repoRoot, targetCwd, slug, spawnFn)).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === "SYMLINK_REJECTED",
    );

    // Assert: git add was NOT called
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RECOPY-005: recopyDraftToChangeFolder — target dir created when absent
// ---------------------------------------------------------------------------
describe("TC-RECOPY-005: recopyDraftToChangeFolder — target directory created when absent", () => {
  it("creates the change folder directory if it does not exist before copying", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const targetCwd = path.join(tempDir, "worktree");
    const slug = "my-slug";

    // Create draft
    const draftDir = path.join(repoRoot, "specrunner", "drafts", slug);
    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(path.join(draftDir, "request.md"), "# Draft\n");

    // Target cwd exists but change folder directory does NOT
    await fs.mkdir(targetCwd, { recursive: true });

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await recopyDraftToChangeFolder(repoRoot, targetCwd, slug, spawnFn);

    // Assert: change folder and file were created
    const destPath = path.join(targetCwd, "specrunner", "changes", slug, "request.md");
    await expect(fs.access(destPath).then(() => undefined)).resolves.toBeUndefined();
  });
});
