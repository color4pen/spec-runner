/**
 * TC-009: bun:* / Bun.* import 禁止 — grep テスト
 *
 * Asserts that no file under src/ imports bun:* or uses Bun.*.
 * runner.ts must use node:child_process instead.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SRC_DIR = path.resolve(__dirname, "../src");

/** Recursively collect all .ts files under a directory. */
async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("TC-009: src/ に bun:* / Bun.* の import がないことを検証", () => {
  it("no file under src/ imports from 'bun:*' or 'bun'", async () => {
    const tsFiles = await collectTsFiles(SRC_DIR);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        // Match: from "bun:" or from "bun" or require("bun") / require("bun:...")
        if (/from\s+["']bun(:|["'])/.test(line) || /require\(["']bun(:|["'])/.test(line)) {
          violations.push({ file: path.relative(SRC_DIR, filePath), line: i + 1, content: line.trim() });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(`Found bun:* / bun imports in src/ (forbidden):\n${report}`);
    }

    expect(violations.length).toBe(0);
  });

  it("no file under src/ uses Bun.spawn or other Bun.* global APIs", async () => {
    const tsFiles = await collectTsFiles(SRC_DIR);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        // Match: Bun.spawn, Bun.file, Bun.write, etc. — but not inside strings/comments
        // Simple heuristic: look for Bun. followed by a method name
        if (/\bBun\.\w+/.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
          violations.push({ file: path.relative(SRC_DIR, filePath), line: i + 1, content: line.trim() });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(`Found Bun.* global API usage in src/ (forbidden):\n${report}`);
    }

    expect(violations.length).toBe(0);
  });

  it("src/core/verification/runner.ts imports from 'node:child_process'", async () => {
    const runnerPath = path.join(SRC_DIR, "core", "verification", "runner.ts");
    const content = await fs.readFile(runnerPath, "utf-8");

    expect(content).toContain("node:child_process");
  });
});
