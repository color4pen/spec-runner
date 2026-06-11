/**
 * Unit tests for ensureDotSpecrunnerGitignore().
 *
 * TC-GI-01: Appends .specrunner/* + !.specrunner/config.json to existing .gitignore that does not contain them
 * TC-GI-02: Idempotent — does not change if both new-format lines already present
 * TC-GI-03: Creates .gitignore with 2-line format if it does not exist
 * TC-GI-04: Handles empty .gitignore file — writes 2-line format
 * TC-GI-05: Does not treat a commented .specrunner/ line as presence — still appends
 * TC-GI-06: Adds newline before entries when file does not end with newline
 * TC-GI-07: Migrates old format (.specrunner/) to new 2-line format
 * TC-GI-08: Idempotent when new 2-line format already present (explicit check)
 * TC-GI-09: Adds missing exception line when only .specrunner/* present
 * TC-GI-10: Adds .specrunner/* before existing !.specrunner/config.json
 * TC-GI-11: Deduplicates multiple old-format .specrunner/ lines to 2-line format
 * TC-GI-12: Deduplicates multiple !.specrunner/config.json lines to a single line
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
  it("TC-GI-01: appends .specrunner/* and !.specrunner/config.json to existing .gitignore that does not contain them", async () => {
    await writeGitignore("node_modules/\ndist/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    expect(lines.some((l) => l.trim() === ".specrunner/*")).toBe(true);
    expect(lines.some((l) => l.trim() === "!.specrunner/config.json")).toBe(true);
  });

  it("TC-GI-02: is idempotent — does not change file if new-format 2 lines already present", async () => {
    const initial = "node_modules/\n.specrunner/*\n!.specrunner/config.json\ndist/\n";
    await writeGitignore(initial);
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content).toBe(initial);
  });

  it("TC-GI-03: creates .gitignore with 2-line format if it does not exist", async () => {
    // No .gitignore in tempDir
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    expect(lines.some((l) => l.trim() === ".specrunner/*")).toBe(true);
    expect(lines.some((l) => l.trim() === "!.specrunner/config.json")).toBe(true);
  });

  it("TC-GI-04: handles empty .gitignore file — writes 2-line format", async () => {
    await writeGitignore("");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    expect(lines.some((l) => l.trim() === ".specrunner/*")).toBe(true);
    expect(lines.some((l) => l.trim() === "!.specrunner/config.json")).toBe(true);
  });

  it("TC-GI-05: does not treat a commented line as presence — still appends", async () => {
    await writeGitignore("# .specrunner/\nnode_modules/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const nonCommentGlob = content.split("\n").filter((l) => !l.trim().startsWith("#") && l.trim() === ".specrunner/*");
    const exception = content.split("\n").filter((l) => l.trim() === "!.specrunner/config.json");
    expect(nonCommentGlob.length).toBe(1);
    expect(exception.length).toBe(1);
  });

  it("TC-GI-06: adds a newline before entries when file does not end with newline", async () => {
    await writeGitignore("node_modules/");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content).toBe("node_modules/\n.specrunner/*\n!.specrunner/config.json\n");
  });

  it("TC-GI-07: migrates old format (.specrunner/) to new 2-line format", async () => {
    await writeGitignore("node_modules/\n.specrunner/\ndist/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    // Old line must be gone
    expect(lines.some((l) => !l.trim().startsWith("#") && l.trim() === ".specrunner/")).toBe(false);
    // New lines must be present
    expect(lines.some((l) => l.trim() === ".specrunner/*")).toBe(true);
    expect(lines.some((l) => l.trim() === "!.specrunner/config.json")).toBe(true);
    // Other content preserved
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
  });

  it("TC-GI-08: is idempotent — calling twice produces the same result as calling once", async () => {
    await writeGitignore("node_modules/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const afterFirst = await readGitignore();
    await ensureDotSpecrunnerGitignore(tempDir);
    const afterSecond = await readGitignore();
    expect(afterSecond).toBe(afterFirst);
  });

  it("TC-GI-09: adds missing !.specrunner/config.json immediately after .specrunner/*", async () => {
    await writeGitignore("node_modules/\n.specrunner/*\ndist/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    const globIdx = lines.findIndex((l) => l.trim() === ".specrunner/*");
    const exceptionIdx = lines.findIndex((l) => l.trim() === "!.specrunner/config.json");
    expect(globIdx).toBeGreaterThanOrEqual(0);
    // Exception must appear immediately after glob (= no intervening lines)
    expect(exceptionIdx).toBe(globIdx + 1);
  });

  it("TC-GI-10: adds .specrunner/* immediately before existing !.specrunner/config.json", async () => {
    await writeGitignore("node_modules/\n!.specrunner/config.json\ndist/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    const globIdx = lines.findIndex((l) => l.trim() === ".specrunner/*");
    const exceptionIdx = lines.findIndex((l) => l.trim() === "!.specrunner/config.json");
    expect(globIdx).toBeGreaterThanOrEqual(0);
    // Glob must appear immediately before exception (= no intervening lines)
    expect(globIdx).toBe(exceptionIdx - 1);
  });

  it("TC-GI-11: deduplicates multiple old-format .specrunner/ lines and produces 2-line format", async () => {
    await writeGitignore(".specrunner/\nnode_modules/\n.specrunner/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    // Exactly one glob line
    const globLines = lines.filter((l) => !l.trim().startsWith("#") && l.trim() === ".specrunner/*");
    expect(globLines.length).toBe(1);
    // Exception line present
    expect(lines.some((l) => l.trim() === "!.specrunner/config.json")).toBe(true);
    // No old-format line
    expect(lines.some((l) => !l.trim().startsWith("#") && l.trim() === ".specrunner/")).toBe(false);
  });

  it("TC-GI-12: deduplicates multiple !.specrunner/config.json lines to a single line", async () => {
    await writeGitignore(".specrunner/*\n!.specrunner/config.json\nnode_modules/\n!.specrunner/config.json\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    const exceptionLines = lines.filter((l) => l.trim() === "!.specrunner/config.json");
    expect(exceptionLines.length).toBe(1);
  });

  it("TC-GI-NM-01: creates node_modules/ entry when .gitignore does not exist", async () => {
    // No .gitignore in tempDir
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    expect(lines.some((l) => l.trim() === "node_modules/")).toBe(true);
  });

  it("TC-GI-NM-02: does not duplicate node_modules/ when already present", async () => {
    await writeGitignore("node_modules/\n.specrunner/*\n!.specrunner/config.json\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const count = content.split("\n").filter((l) => l.trim() === "node_modules/").length;
    expect(count).toBe(1);
  });

  it("TC-GI-NM-03: adds node_modules/ as non-comment line when only a comment line exists", async () => {
    await writeGitignore("# node_modules/\n.specrunner/*\n!.specrunner/config.json\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    const lines = content.split("\n");
    const nonCommentNodeModules = lines.filter((l) => !l.trim().startsWith("#") && l.trim() === "node_modules/");
    expect(nonCommentNodeModules.length).toBe(1);
  });

  it("TC-GI-NM-04: is idempotent — calling twice produces the same result", async () => {
    await writeGitignore("dist/\n");
    await ensureDotSpecrunnerGitignore(tempDir);
    const afterFirst = await readGitignore();
    await ensureDotSpecrunnerGitignore(tempDir);
    const afterSecond = await readGitignore();
    expect(afterSecond).toBe(afterFirst);
  });

  it("preserves existing content when appending", async () => {
    const original = "node_modules/\ndist/\n.env\n";
    await writeGitignore(original);
    await ensureDotSpecrunnerGitignore(tempDir);
    const content = await readGitignore();
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
    expect(content).toContain(".env");
    expect(content).toContain(".specrunner/*");
    expect(content).toContain("!.specrunner/config.json");
  });
});
