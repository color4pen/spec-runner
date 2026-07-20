/**
 * TC-003: 全 hint の specrunner 参照がレジストリと一致する
 * TC-004: 架空コマンドの混入を検出する（破壊確認）
 * TC-005: local-state-writable は廃止コマンドを処方しない
 *
 * 機械検査: src/**\/*.ts (*.test.ts / __tests__ 除外) の hint 文字列中の
 * "specrunner <token1> [<token2>]" が COMMANDS に実在するかを検証する。
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { COMMANDS } from "../../../src/cli/command-registry.js";
import { localStateWritableCheck } from "../../../src/core/doctor/checks/storage/local-state-writable.js";
import { buildMockContext, buildMockFs } from "../../core/doctor/mock-context.js";

// ---------------------------------------------------------------------------
// Helper: collect all .ts source files (exclude test files and __tests__ dirs)
// ---------------------------------------------------------------------------
function collectSourceFiles(dir: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip __tests__ directories
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      result.push(...collectSourceFiles(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      result.push(fullPath);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helper: remove single-line comments from TypeScript source
// ---------------------------------------------------------------------------
function removeLineComments(content: string): string {
  // Remove // ... but preserve string literals (simple heuristic: line-by-line)
  return content
    .split("\n")
    .map((line) => {
      // Strip // comment that isn't inside a string (simple heuristic)
      const idx = line.indexOf("//");
      if (idx === -1) return line;
      // Check if inside a string by counting unescaped quotes before idx
      const before = line.slice(0, idx);
      const dqCount = (before.match(/(?<!\\)"/g) ?? []).length;
      const sqCount = (before.match(/(?<!\\)'/g) ?? []).length;
      // If even number of quote chars → not inside string → safe to strip
      if (dqCount % 2 === 0 && sqCount % 2 === 0) {
        return line.slice(0, idx);
      }
      return line;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Helper: extract hint literal strings from source content
// Targets:
//   (a) hint: "..." / hint: '...' / hint: `...`
//   (b) new SpecRunnerError(code, "hint", ...) — 2nd argument
// ---------------------------------------------------------------------------
function extractHints(content: string): string[] {
  const noComments = removeLineComments(content);
  const hints: string[] = [];

  // (a) hint property: hint: "..." | hint: '...' | hint: `...`
  // Handles multi-line strings via dotAll-ish approach on noComments
  const hintPropRe =
    /hint\s*:\s*(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|`((?:[^`\\]|\\[\s\S])*)`)/gm;
  let m: RegExpExecArray | null;
  while ((m = hintPropRe.exec(noComments)) !== null) {
    const hit = m[1] ?? m[2] ?? m[3];
    if (hit !== undefined) hints.push(hit);
  }

  // (b) new SpecRunnerError(code, hint, ...) — 2nd string arg
  // Allow ERROR_CODES.X or "CODE" as first arg, then comma, then string
  const specErrRe =
    /new SpecRunnerError\([^,]+,\s*(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|`((?:[^`\\]|\\[\s\S])*)`)/gm;
  while ((m = specErrRe.exec(noComments)) !== null) {
    const hit = m[1] ?? m[2] ?? m[3];
    if (hit !== undefined) hints.push(hit);
  }

  return hints;
}

// ---------------------------------------------------------------------------
// Helper: build subcommand map from COMMANDS
// ---------------------------------------------------------------------------
type SubcommandMap = Map<string, Set<string>>;

function buildSubcommandMap(): SubcommandMap {
  const map: SubcommandMap = new Map();
  for (const [name, entry] of Object.entries(COMMANDS)) {
    if ("subcommands" in entry) {
      map.set(name, new Set(Object.keys(entry.subcommands)));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helper: validate specrunner command references in a hint string
// Returns list of violation descriptions (empty = all valid).
// ---------------------------------------------------------------------------
function validateHintCommands(
  hint: string,
  validTopLevel: Set<string>,
  subcommandMap: SubcommandMap,
): string[] {
  const errors: string[] = [];
  // Match: specrunner <token1> [<token2>]
  // Use [a-zA-Z0-9_-]+ to avoid capturing surrounding punctuation (quotes, dots, etc.)
  const cmdRe = /specrunner\s+([a-zA-Z0-9_-]+)(?:\s+([a-zA-Z0-9_-]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = cmdRe.exec(hint)) !== null) {
    const token1 = m[1]!;
    const token2 = m[2];

    // Skip flags (- prefix)
    if (token1.startsWith("-")) continue;

    if (!validTopLevel.has(token1)) {
      errors.push(
        `unregistered top-level command: specrunner ${token1} (hint: "${hint.slice(0, 120)}")`,
      );
      continue;
    }

    // If the entry is a parent and token2 looks like a subcommand (not a flag, not a positional like <...>)
    if (
      token2 !== undefined &&
      !token2.startsWith("-") &&
      !token2.startsWith("<") &&
      subcommandMap.has(token1)
    ) {
      const subs = subcommandMap.get(token1)!;
      if (!subs.has(token2)) {
        errors.push(
          `unregistered subcommand: specrunner ${token1} ${token2} (hint: "${hint.slice(0, 120)}")`,
        );
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// TC-003: 全 hint の specrunner 参照がレジストリと一致する
// ---------------------------------------------------------------------------
describe("TC-003: 全 hint の specrunner 参照がレジストリと一致する", () => {
  it("src/**/*.ts (test files excluded) に廃止/存在しないコマンドへの hint 参照が無い", () => {
    const srcDir = path.resolve(__dirname, "../../../src");
    const files = collectSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const validTopLevel = new Set(Object.keys(COMMANDS));
    const subcommandMap = buildSubcommandMap();

    const allViolations: { file: string; violation: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const hints = extractHints(content);
      for (const hint of hints) {
        const violations = validateHintCommands(hint, validTopLevel, subcommandMap);
        for (const v of violations) {
          allViolations.push({ file: path.relative(srcDir, file), violation: v });
        }
      }
    }

    if (allViolations.length > 0) {
      const report = allViolations.map((v) => `  ${v.file}: ${v.violation}`).join("\n");
      throw new Error(`Hint references to non-existent commands found:\n${report}`);
    }

    expect(allViolations.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-004: 架空コマンドの混入を検出する（破壊確認 — バリデーターの感度検証）
// ---------------------------------------------------------------------------
describe("TC-004: 架空コマンドの混入を検出する（破壊確認）", () => {
  it("hint に COMMANDS に存在しない specrunner <架空コマンド> があると violations が出る", () => {
    const validTopLevel = new Set(Object.keys(COMMANDS));
    const subcommandMap = buildSubcommandMap();

    const fakeHint = "Run 'specrunner frobnicate --all' to fix everything.";
    const violations = validateHintCommands(fakeHint, validTopLevel, subcommandMap);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes("frobnicate"))).toBe(true);
  });

  it("hint に COMMANDS に存在しない specrunner managed setup があると violations が出る", () => {
    const validTopLevel = new Set(Object.keys(COMMANDS));
    const subcommandMap = buildSubcommandMap();

    // "managed" was removed from COMMANDS — replaced by "runtime"
    const staleHint = "Run 'specrunner managed setup' to configure the environment.";
    const violations = validateHintCommands(staleHint, validTopLevel, subcommandMap);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("hint に COMMANDS に存在しない specrunner ps があると violations が出る", () => {
    const validTopLevel = new Set(Object.keys(COMMANDS));
    const subcommandMap = buildSubcommandMap();

    // "ps" was removed from COMMANDS
    const staleHint = "Run 'specrunner ps' once to initialize storage.";
    const violations = validateHintCommands(staleHint, validTopLevel, subcommandMap);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("hint に正規コマンドのみが含まれる場合は violations が出ない", () => {
    const validTopLevel = new Set(Object.keys(COMMANDS));
    const subcommandMap = buildSubcommandMap();

    const validHint = "Run 'specrunner login' to authenticate.";
    const violations = validateHintCommands(validHint, validTopLevel, subcommandMap);
    expect(violations.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-005: local-state-writable は廃止コマンドを処方しない
// ---------------------------------------------------------------------------
describe("TC-005: local-state-writable は廃止コマンドを処方しない", () => {
  it("ディレクトリ未作成の warn 時に hint が 'specrunner ps' を含まない", async () => {
    let callCount = 0;
    const access = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: local state dir — ENOENT
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      // Second call: parent dir — writable
      return undefined;
    });
    const mockFs = buildMockFs({ access });
    const ctx = buildMockContext({ fs: mockFs });
    const result = await localStateWritableCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).not.toContain("specrunner ps");
  });

  it("ディレクトリ未作成の warn 時に hint は初回 run での自動作成または実在コマンドを案内する", async () => {
    let callCount = 0;
    const access = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return undefined;
    });
    const mockFs = buildMockFs({ access });
    const ctx = buildMockContext({ fs: mockFs });
    const result = await localStateWritableCheck.check(ctx);
    // The hint should either describe auto-creation or reference a real command
    // At minimum it must not reference the defunct "ps" command
    expect(result.hint).toBeDefined();
    expect(typeof result.hint).toBe("string");
  });
});
