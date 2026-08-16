/**
 * TC-013: Dead guidance prevention — grep tests
 *
 * Asserts that no file under src/ contains the deprecated login --provider
 * guidance strings that were replaced by credentials set commands.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SRC_DIR = path.resolve(__dirname, "../src");

/** Recursively collect production .ts files under a directory (excludes test files). */
async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "__tests__") {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("TC-013: src/ に dead guidance (login --provider ...) が存在しないこと", () => {
  it("no file under src/ contains 'login --provider anthropic'", async () => {
    const tsFiles = await collectTsFiles(SRC_DIR);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (line.includes("login --provider anthropic")) {
          violations.push({
            file: path.relative(SRC_DIR, filePath),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(
        `Found dead guidance 'login --provider anthropic' in src/ (forbidden):\n${report}`,
      );
    }

    expect(violations.length).toBe(0);
  });

  it("no file under src/ contains 'login --provider claude'", async () => {
    const tsFiles = await collectTsFiles(SRC_DIR);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (line.includes("login --provider claude")) {
          violations.push({
            file: path.relative(SRC_DIR, filePath),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(
        `Found dead guidance 'login --provider claude' in src/ (forbidden):\n${report}`,
      );
    }

    expect(violations.length).toBe(0);
  });
});
