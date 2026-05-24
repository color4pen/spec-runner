/**
 * Unit tests for ensureDotSpecrunnerGitignore().
 *
 * TC-GI-01: Appends .specrunner/ to existing .gitignore that does not contain it
 * TC-GI-02: Idempotent — does not append if .specrunner/ already present
 * TC-GI-03: Creates .gitignore if it does not exist
 * TC-GI-04: Handles empty .gitignore file
 * TC-GI-05: Does not add duplicate when .specrunner/ is a comment line
 * TC-GI-06: Adds newline before entry when file does not end with newline
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ensureDotSpecrunnerGitignore } from "../../../src/util/gitignore.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gitignore-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function readGitignore(): Promise<string> {
  return fs.readFile(path.join(tempDir, ".gitignore"), "utf-8");
}

async function writeGitignore(content: string): Promise<void> {
  await fs.writeFile(path.join(tempDir, ".gitignore"), content, "utf-8");
}

describe("ensureDotSpecrunnerGitignore", () => {
  it("TC-GI-01: appends .specrunner/ to existing .gitignore that does not contain it", async () => {
    await writeGitignore("node_modules/\ndist/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content).toContain(".specrunner/");
    const lines = content.split("\n");
    expect(lines.some((l) => l.trim() === ".specrunner/")).toBe(true);
  });

  it("TC-GI-02: is idempotent — does not append if .specrunner/ already present", async () => {
    await writeGitignore("node_modules/\n.specrunner/\ndist/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    // Should appear exactly once
    const occurrences = content.split("\n").filter((l) => l.trim() === ".specrunner/").length;
    expect(occurrences).toBe(1);
    // Content unchanged
    expect(content).toBe("node_modules/\n.specrunner/\ndist/\n");
  });

  it("TC-GI-03: creates .gitignore if it does not exist", async () => {
    // No .gitignore in tempDir
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content.trim()).toBe(".specrunner/");
  });

  it("TC-GI-04: handles empty .gitignore file", async () => {
    await writeGitignore("");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content.trim()).toBe(".specrunner/");
  });

  it("TC-GI-05: does not treat a commented line as presence — still appends", async () => {
    await writeGitignore("# .specrunner/\nnode_modules/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const nonCommentLines = content.split("\n").filter((l) => !l.trim().startsWith("#") && l.trim() === ".specrunner/");
    expect(nonCommentLines.length).toBe(1);
  });

  it("TC-GI-06: adds a newline before entry when file does not end with newline", async () => {
    await writeGitignore("node_modules/");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content).toBe("node_modules/\n.specrunner/\n");
  });

  it("preserves existing content when appending", async () => {
    const original = "node_modules/\ndist/\n.env\n";
    await writeGitignore(original);
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content.startsWith(original)).toBe(true);
    expect(content).toContain(".specrunner/");
  });
});
