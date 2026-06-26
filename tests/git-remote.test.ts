import { describe, it, expect } from "vitest";
import { parseRemoteUrl } from "../src/git/remote.js";

// TC-008: HTTPS URL から owner/name 解決
describe("TC-008: HTTPS URL parsing", () => {
  it("parses https://github.com/owner/repo.git", () => {
    const result = parseRemoteUrl("https://github.com/color4pen/spec-runner.git");
    expect(result).toEqual({ owner: "color4pen", name: "spec-runner" });
  });
});

// TC-009: HTTPS URL（.git suffix なし）
describe("TC-009: HTTPS URL without .git suffix", () => {
  it("parses https://github.com/owner/repo without .git", () => {
    const result = parseRemoteUrl("https://github.com/color4pen/spec-runner");
    expect(result).toEqual({ owner: "color4pen", name: "spec-runner" });
  });
});

// TC-010: SSH URL から owner/name 解決
describe("TC-010: SSH URL parsing", () => {
  it("parses git@github.com:owner/repo.git", () => {
    const result = parseRemoteUrl("git@github.com:color4pen/spec-runner.git");
    expect(result).toEqual({ owner: "color4pen", name: "spec-runner" });
  });
});

// TC-011: credentials 付き HTTPS URL
describe("TC-011: HTTPS URL with credentials", () => {
  it("strips credentials from https URL", () => {
    const result = parseRemoteUrl("https://x-access-token:abc@github.com/o/r.git");
    expect(result).toEqual({ owner: "o", name: "r" });
  });
});

// TC-012: GitHub 以外の remote はエラー
describe("TC-012: non-GitHub remote", () => {
  it("throws REMOTE_NOT_GITHUB for gitlab.com", () => {
    expect(() => parseRemoteUrl("https://gitlab.com/u/r.git")).toThrow(
      "'origin' must point to github.com.",
    );
  });

  it("throws with code REMOTE_NOT_GITHUB", () => {
    try {
      parseRemoteUrl("https://gitlab.com/u/r.git");
      expect.fail("should throw");
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("REMOTE_NOT_GITHUB");
    }
  });
});

// TC-013: git 未初期化 — getOriginInfo throws NOT_GIT_REPO for a non-repo directory
describe("TC-013: getOriginInfo with no git repo", () => {
  it("throws NOT_GIT_REPO when run in a non-git directory", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-no-git-"));
    try {
      const { getOriginInfo } = await import("../src/git/remote.js");
      await expect(getOriginInfo(tmpDir)).rejects.toMatchObject({ code: "NOT_GIT_REPO" });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// TC-016: GHES host — HTTPS and SSH parsing
describe("TC-016: GHES host parsing", () => {
  it("parses GHES HTTPS URL with custom host", () => {
    const result = parseRemoteUrl(
      "https://ghes.corp.example.com/o/r.git",
      "ghes.corp.example.com",
    );
    expect(result).toEqual({ owner: "o", name: "r" });
  });

  it("parses GHES SSH URL with custom host", () => {
    const result = parseRemoteUrl(
      "git@ghes.corp.example.com:o/r.git",
      "ghes.corp.example.com",
    );
    expect(result).toEqual({ owner: "o", name: "r" });
  });

  it("throws REMOTE_NOT_GITHUB when github.com URL is parsed with GHES host", () => {
    expect(() =>
      parseRemoteUrl("https://github.com/o/r.git", "ghes.example.com"),
    ).toThrow();
  });
});

// TC-015: shell-injection safety — remote.ts uses the git-exec seam (arg-array, shell:false)
describe("TC-015: remote.ts routes through git-exec seam (no string-shell exec)", () => {
  it("git/remote.ts imports from util/git-exec.js and contains no string-shell exec(", async () => {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(
      new URL("../src/git/remote.ts", import.meta.url).pathname,
      "utf-8",
    );
    // Must import from the seam.
    expect(content).toContain("util/git-exec.js");
    // Must NOT import node:child_process directly.
    expect(content).not.toMatch(/from\s*["']node:child_process["']/);
    // Forbid string-shell child_process.exec / { exec } patterns (shell injection risk).
    expect(content).not.toMatch(/child_process["']\)?\.exec\s*\(/);
    expect(content).not.toMatch(/\{[^}]*\bexec\b[^}]*\}\s*=\s*require\(["']node:child_process/);
    expect(content).not.toMatch(/\bimport\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*["']node:child_process["']/);
  });
});
