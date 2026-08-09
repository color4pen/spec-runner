/**
 * Gate tests that verify source code constraints enforced by the
 * regression-gate-false-loop change.
 *
 * TC-006: code-fixer prompt に severity 再フィルタ行が存在しない
 *         verification: `grep -rn "Ignore LOW severity" src/` が 0 件
 * TC-007: regression-gate-system.ts に「修正した findings」記述が残っていない
 *         verification: ledger 説明が実装の実態と一致する
 *
 * These tests read the actual source files and fail (red) until the implementation
 * removes the strings. They will pass (green) after the implementer step runs.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve src/ relative to this test file
const __filename = fileURLToPath(import.meta.url);
// file → __tests__/ → step/ → core/ → src/
const SRC_ROOT = path.resolve(__filename, "../../../..");

// ---------------------------------------------------------------------------
// TC-006: code-fixer prompt に severity 再フィルタ行が存在しない
// ---------------------------------------------------------------------------

describe("TC-006: code-fixer prompt に severity 再フィルタ行が存在しない", () => {
  it("TC-006: src/ 配下に 'Ignore LOW severity' が 0 件であること（全 5 変種から削除済）", () => {
    // verification command: `grep -rn "Ignore LOW severity" src/` が exit 0 かつ出力 0 件
    // This test walks src/ and checks no TypeScript/JS file contains the forbidden string.
    const matches = grepRecursive(SRC_ROOT, "Ignore LOW severity");
    if (matches.length > 0) {
      // Show which files still contain the string to aid debugging
      const detail = matches.map((m) => `  ${m.file}:${m.line}: ${m.text.trim()}`).join("\n");
      expect.fail(
        `TC-006 FAILED: 'Ignore LOW severity' が src/ 内に ${matches.length} 件残っています:\n${detail}\n` +
        `実装後は code-fixer.ts の prompt 全 5 変種からこの行を削除すること。`,
      );
    }
    expect(matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-007: regression-gate-system.ts に「修正した findings」記述が残っていない
// ---------------------------------------------------------------------------

describe("TC-007: regression-gate-system.ts に「修正した findings」記述が残っていない", () => {
  it("TC-007: regression-gate-system.ts に 'were fixed during this job' が残っていない", () => {
    // verification command: grep が 0 件
    const rgsPath = path.join(SRC_ROOT, "prompts/regression-gate-system.ts");
    const content = fs.readFileSync(rgsPath, "utf-8");
    const badPhrases = [
      "were fixed during this job",
      "code-fixer が修正した",
      "修正した fixable findings",
    ];
    for (const phrase of badPhrases) {
      if (content.includes(phrase)) {
        expect.fail(
          `TC-007 FAILED: regression-gate-system.ts に虚偽の記述 '${phrase}' が残っています。` +
          `ledger の説明を実装の実態（reviewer が指摘した fixable findings 全件）に合わせてください。`,
        );
      }
    }
    // All phrases must be absent
    for (const phrase of badPhrases) {
      expect(content).not.toContain(phrase);
    }
  });

  it("TC-007: regression-gate.ts の buildLedgerBlock に 'were fixed during this job' が残っていない", () => {
    const gatePath = path.join(SRC_ROOT, "core/step/regression-gate.ts");
    const content = fs.readFileSync(gatePath, "utf-8");
    const badPhrase = "were fixed during this job";
    if (content.includes(badPhrase)) {
      expect.fail(
        `TC-007 FAILED: regression-gate.ts の buildLedgerBlock に '${badPhrase}' が残っています。` +
        `実態（reviewer が指摘した fixable findings。全てが修正済みとは限らない）に沿った文言に修正してください。`,
      );
    }
    expect(content).not.toContain(badPhrase);
  });
});

// ---------------------------------------------------------------------------
// Utility: recursive grep within src/
// ---------------------------------------------------------------------------

interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

/**
 * Walk rootDir recursively and find lines containing needle in .ts files.
 * Pure FS-based grep — no shell spawn needed.
 */
function grepRecursive(rootDir: string, needle: string): GrepMatch[] {
  const matches: GrepMatch[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, .git, and test directories (avoid self-reference)
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__tests__") continue;
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        lines.forEach((text, idx) => {
          if (text.includes(needle)) {
            matches.push({ file: fullPath.replace(rootDir + path.sep, ""), line: idx + 1, text });
          }
        });
      }
    }
  }

  walk(rootDir);
  return matches;
}
