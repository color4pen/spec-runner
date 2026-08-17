/**
 * Unit tests for src/util/copy-artifacts.ts — symlink dereference guard + consumeDraft
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
 * TC-001: consumeDraft — directory-format draft is consumed (untracked)
 * TC-002: consumeDraft — flat-format draft is consumed (untracked)
 * TC-004: consumeDraft — tracked draft is warned about, not deleted
 * TC-005: consumeDraft — non-canonical path → no canonical draft → no-op
 * TC-009: consumeDraft — no-op when no draft is present
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { rejectSymlink, copyDraftUsageToChangeFolder, consumeDraft } from "../../../src/core/artifact/copy-artifacts.js";
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
// TC-001: consumeDraft — directory-format draft is consumed (untracked)
// ---------------------------------------------------------------------------
describe("TC-001: consumeDraft — directory-format draft is consumed (untracked)", () => {
  it("deletes specrunner/drafts/<slug>/ when it exists and is untracked", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const slug = "my-slug";

    // Create directory-format draft
    const draftDir = path.join(repoRoot, "specrunner", "drafts", slug);
    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(path.join(draftDir, "request.md"), "# Draft\n");

    // spawnFn: ls-files returns empty (untracked); everything else succeeds
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await consumeDraft(repoRoot, slug, spawnFn);

    // Directory draft should be gone
    await expect(fs.access(draftDir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-002: consumeDraft — flat-format draft is consumed (untracked)
// ---------------------------------------------------------------------------
describe("TC-002: consumeDraft — flat-format draft is consumed (untracked)", () => {
  it("deletes specrunner/drafts/<slug>.md when it exists and is untracked", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const slug = "my-slug";

    // Create flat-format draft
    const draftsBase = path.join(repoRoot, "specrunner", "drafts");
    await fs.mkdir(draftsBase, { recursive: true });
    await fs.writeFile(path.join(draftsBase, `${slug}.md`), "# Flat Draft\n");

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await consumeDraft(repoRoot, slug, spawnFn);

    await expect(fs.access(path.join(draftsBase, `${slug}.md`))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-004: consumeDraft — tracked draft is warned about, not deleted
// ---------------------------------------------------------------------------
describe("TC-004: consumeDraft — tracked draft is warned about, not deleted", () => {
  it("does not delete and writes warning to stderr when ls-files returns non-empty output", async () => {
    const repoRoot = path.join(tempDir, "repo");
    const slug = "my-slug";

    // Create directory-format draft
    const draftDir = path.join(repoRoot, "specrunner", "drafts", slug);
    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(path.join(draftDir, "request.md"), "# Tracked Draft\n");

    // spawnFn: ls-files returns the relPath (tracked)
    const spawnFn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "ls-files") {
        return { exitCode: 0, stdout: args[args.length - 1] + "\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    await consumeDraft(repoRoot, slug, spawnFn);

    // Draft must still exist (not deleted)
    await expect(fs.access(draftDir)).resolves.toBeUndefined();
    // Warning must have been written
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("is tracked by git"),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-005: consumeDraft — no canonical draft exists → no-op (non-canonical path scenario)
// ---------------------------------------------------------------------------
describe("TC-005: consumeDraft — no canonical draft exists → no-op", () => {
  it("resolves without error and calls no git ls-files when no canonical draft exists", async () => {
    const repoRoot = path.join(tempDir, "repo");
    await fs.mkdir(repoRoot, { recursive: true });
    const slug = "non-canonical-slug";

    // No draft at canonical locations
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await expect(consumeDraft(repoRoot, slug, spawnFn)).resolves.toBeUndefined();

    // ls-files should not have been called (nothing to check)
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-009: consumeDraft — no-op when no draft is present
// ---------------------------------------------------------------------------
describe("TC-009: consumeDraft — no-op when no draft is present", () => {
  it("resolves without error, calls no git or fs.rm when both draft forms are absent", async () => {
    const repoRoot = path.join(tempDir, "repo");
    await fs.mkdir(repoRoot, { recursive: true });
    const slug = "absent-slug";

    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await expect(consumeDraft(repoRoot, slug, spawnFn)).resolves.toBeUndefined();
    expect(spawnFn).not.toHaveBeenCalled();
  });
});
