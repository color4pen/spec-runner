/**
 * Unit tests for resolveRequestPath()
 *
 * TC-RRP-001: non-draft path → returns statePath as-is
 * TC-RRP-002: legacy draft path + worktreePath present (local runtime) → worktree candidate
 * TC-RRP-003: legacy draft path + worktreePath null (managed runtime) → cwd candidate
 * TC-RRP-004: legacy draft path + both candidates absent → returns original statePath (ENOENT fallback)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveRequestPath } from "../../../../src/core/resume/resolve-request-path.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-request-path-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("TC-RRP-001: non-draft path → returns statePath as-is", () => {
  it("returns statePath unchanged when path does not contain /specrunner/drafts/", () => {
    const statePath = "/repo/specrunner/changes/my-slug/request.md";
    const result = resolveRequestPath(statePath, "my-slug", null, "/repo");
    expect(result).toBe(statePath);
  });

  it("returns statePath unchanged for a path that only contains 'drafts' but not /specrunner/drafts/", () => {
    const statePath = "/repo/other/drafts/my-slug/request.md";
    const result = resolveRequestPath(statePath, "my-slug", null, "/repo");
    expect(result).toBe(statePath);
  });
});

describe("TC-RRP-002: legacy draft path + worktreePath present (local runtime)", () => {
  it("returns worktreePath-based candidate when file exists there", async () => {
    const slug = "my-slug";
    const worktreePath = path.join(tempDir, "worktree");
    const requestFile = path.join(worktreePath, "specrunner", "changes", slug, "request.md");
    await fs.mkdir(path.dirname(requestFile), { recursive: true });
    await fs.writeFile(requestFile, "# request");

    const statePath = `/repo/specrunner/drafts/${slug}/request.md`;
    const result = resolveRequestPath(statePath, slug, worktreePath, "/cwd");
    expect(result).toBe(requestFile);
  });

  it("falls through to cwd candidate when worktreePath file does not exist", async () => {
    const slug = "my-slug";
    const worktreePath = path.join(tempDir, "worktree"); // directory exists but no request.md inside
    const cwd = path.join(tempDir, "cwd");
    const cwdFile = path.join(cwd, "specrunner", "changes", slug, "request.md");
    await fs.mkdir(path.dirname(cwdFile), { recursive: true });
    await fs.writeFile(cwdFile, "# request");

    const statePath = `/repo/specrunner/drafts/${slug}/request.md`;
    const result = resolveRequestPath(statePath, slug, worktreePath, cwd);
    expect(result).toBe(cwdFile);
  });
});

describe("TC-RRP-003: legacy draft path + worktreePath null (managed runtime)", () => {
  it("returns cwd-based candidate when worktreePath is null and cwd file exists", async () => {
    const slug = "my-slug";
    const cwd = path.join(tempDir, "cwd");
    const requestFile = path.join(cwd, "specrunner", "changes", slug, "request.md");
    await fs.mkdir(path.dirname(requestFile), { recursive: true });
    await fs.writeFile(requestFile, "# request");

    const statePath = `/repo/specrunner/drafts/${slug}/request.md`;
    const result = resolveRequestPath(statePath, slug, null, cwd);
    expect(result).toBe(requestFile);
  });

  it("returns cwd-based candidate when worktreePath is undefined and cwd file exists", async () => {
    const slug = "my-slug";
    const cwd = path.join(tempDir, "cwd");
    const requestFile = path.join(cwd, "specrunner", "changes", slug, "request.md");
    await fs.mkdir(path.dirname(requestFile), { recursive: true });
    await fs.writeFile(requestFile, "# request");

    const statePath = `/repo/specrunner/drafts/${slug}/request.md`;
    const result = resolveRequestPath(statePath, slug, undefined, cwd);
    expect(result).toBe(requestFile);
  });
});

describe("TC-RRP-004: legacy draft path + both candidates absent (full ENOENT fallback)", () => {
  it("returns original statePath when neither worktreePath nor cwd candidate exist", () => {
    const slug = "my-slug";
    const statePath = `/repo/specrunner/drafts/${slug}/request.md`;
    const result = resolveRequestPath(
      statePath,
      slug,
      "/nonexistent/worktree",
      "/nonexistent/cwd",
    );
    expect(result).toBe(statePath);
  });

  it("returns original statePath when worktreePath is null and cwd candidate does not exist", () => {
    const slug = "my-slug";
    const statePath = `/repo/specrunner/drafts/${slug}/request.md`;
    const result = resolveRequestPath(statePath, slug, null, "/nonexistent/cwd");
    expect(result).toBe(statePath);
  });
});
